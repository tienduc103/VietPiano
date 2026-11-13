/**
 * Máy ghi "Nhật ký Biểu diễn" — TẠM THỜI (docs/perform-log.md). Nhận log từ app trên mọi máy (POST NDJSON),
 * ghi vào thư mục log của máy chạy server:
 *  - `<YYYY-MM-DD>.jsonl`: mỗi dòng một bản log đầy đủ + `srv` (giờ máy ghi, IP máy gửi, origin, user agent);
 *  - `summary.log`: một dòng dễ đọc mỗi bản (giờ | IP | máy | người chơi | tóm tắt);
 *  - `machines.json`: các máy đã truy cập (tên, IP, trình duyệt, người chơi, số lần mở app / số lượt Biểu diễn).
 * Dùng chung cho plugin vite (`npm run dev` / `dev:https` / `serve:lan`, đường dẫn `<base>__vplog`) và
 * `npm run perflog` (máy ghi riêng cổng 8790 cho trang GitHub Pages). Không gửi gì ra ngoài máy này.
 * Chỉ dùng cú pháp TypeScript "xoá được" (Node chạy thẳng file .ts).
 */
import type { IncomingMessage, ServerResponse } from 'node:http';
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

export const DEFAULT_LOG_DIR = 'logs/perform-log';
export const MAX_BODY_BYTES = 4 * 1024 * 1024;
export const MAX_LINES = 200;
export const APP_ID = 'vietpiano-perform-log';

export interface CollectorOptions {
  /** Thư mục ghi log (tương đối theo thư mục đang chạy). */
  dir: string;
  /** Origin được phép thêm (biến PERFLOG_ORIGINS); '*' = mọi origin. */
  origins?: readonly string[];
  now?: () => Date;
  /** In một dòng mỗi lượt Biểu diễn nhận được (console của server). */
  log?: (line: string) => void;
}

export interface ServerInfo {
  at: string;
  ip: string;
  origin: string;
  ua: string;
}

type Entry = Record<string, unknown>;

const isObject = (x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x);

/** Máy nội bộ: localhost, IP mạng riêng (10/8, 172.16/12, 192.168/16, 169.254/16), IPv6 nội bộ, tên *.local. */
export function isPrivateHost(hostname: string): boolean {
  const h = hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.local') || h === '::1') return true;
  if (/^(fc|fd)[0-9a-f]{2}:/.test(h) || h.startsWith('fe80:')) return true;
  const m = /^(\d+)\.(\d+)\.(\d+)\.(\d+)$/.exec(h);
  if (!m) return false;
  const [a, b] = [Number(m[1]), Number(m[2])];
  return a === 127 || a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 169 && b === 254);
}

/**
 * Trang nào được gửi log: không có Origin (curl, test), trang trên máy nội bộ, *.github.io (bản phát hành),
 * cùng máy với máy ghi, hoặc có trong `extra` ('*' = mọi trang).
 */
export function originAllowed(origin: string | undefined, host: string | undefined, extra: readonly string[] = []): boolean {
  if (!origin) return true;
  if (extra.includes('*') || extra.includes(origin)) return true;
  let url: URL;
  try {
    url = new URL(origin);
  } catch {
    return false;
  }
  if (isPrivateHost(url.hostname)) return true;
  if (url.protocol === 'https:' && /\.github\.io$/i.test(url.hostname)) return true;
  const ownHost = (host ?? '').replace(/:\d+$/, '').toLowerCase();
  return !!ownHost && url.hostname.toLowerCase() === ownHost;
}

/** Tách NDJSON: chỉ nhận bản log đúng dạng (schema 1, loại visit / perform, có mã log + mã máy). */
export function parseBody(body: string): { entries: Entry[]; rejected: number } {
  const entries: Entry[] = [];
  let rejected = 0;
  const lines = body.split('\n').filter((l) => l.trim());
  for (const [k, line] of lines.entries()) {
    if (k >= MAX_LINES) {
      rejected++;
      continue;
    }
    let x: unknown;
    try {
      x = JSON.parse(line);
    } catch {
      rejected++;
      continue;
    }
    const ok =
      isObject(x) &&
      x.v === 1 &&
      (x.type === 'visit' || x.type === 'perform') &&
      typeof x.id === 'string' &&
      x.id.length > 0 &&
      x.id.length <= 80 &&
      isObject(x.device) &&
      typeof x.device.id === 'string' &&
      x.device.id.length > 0 &&
      x.device.id.length <= 64;
    if (ok) entries.push(x as Entry);
    else rejected++;
  }
  return { entries, rejected };
}

const pad = (n: number) => String(n).padStart(2, '0');
/** Ngày / giờ theo đồng hồ máy ghi. */
export const localDate = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const localStamp = (d: Date) => `${localDate(d)} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;

/** Bỏ xuống dòng / ký tự điều khiển (một bản log = đúng một dòng summary.log). */
const oneLine = (s: unknown, max = 600) =>
  String(s ?? '')
    .replace(/[\u0000-\u001f\u007f]+/g, ' ')
    .slice(0, max);

/** Nhãn ngắn của trình duyệt cho summary.log. */
export function shortAgent(ua: string): string {
  const os = /iPad|iPhone/.test(ua) ? 'iOS' : /Macintosh/.test(ua) ? 'Mac' : /Android/.test(ua) ? 'Android' : /Windows/.test(ua) ? 'Windows' : /Linux/.test(ua) ? 'Linux' : '?';
  const browser = /Edg\//.test(ua) ? 'Edge' : /CriOS|Chrome\//.test(ua) ? 'Chrome' : /FxiOS|Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : '?';
  return `${os}/${browser}`;
}

export function summaryLine(entry: Entry, srv: ServerInfo, at: Date): string {
  const device = isObject(entry.device) ? entry.device : {};
  const player = isObject(entry.player) ? entry.player : {};
  const env = isObject(entry.env) ? entry.env : {};
  const who = `${oneLine(device.name, 40) || '(chưa đặt tên)'} ${oneLine(device.id, 64)}`;
  const text =
    entry.type === 'perform'
      ? oneLine(entry.summary)
      : `${entry.reason === 'player' ? 'đổi người chơi' : 'mở app'} · v${oneLine(entry.app, 40)} · ${oneLine(env.page, 120)} · ${oneLine(env.screen, 40)}${env.standalone ? ' · app cài' : ''}`;
  return [localStamp(at), srv.ip || '?', who, oneLine(player.name, 40) || '(không hồ sơ)', shortAgent(String(env.ua ?? srv.ua)), text].join(' | ');
}

export interface MachineRecord {
  name: string;
  firstSeen: string;
  lastSeen: string;
  ips: string[];
  ua: string;
  platform: string;
  screen: string;
  standalone: boolean;
  app: string;
  players: string[];
  visits: number;
  performs: number;
}

/** Cập nhật danh sách máy đã truy cập (theo mã máy). */
export function updateMachines(machines: Record<string, MachineRecord>, entry: Entry, srv: ServerInfo, at: Date): Record<string, MachineRecord> {
  const device = isObject(entry.device) ? entry.device : {};
  const player = isObject(entry.player) ? entry.player : {};
  const env = isObject(entry.env) ? entry.env : {};
  const id = String(device.id);
  const stamp = localStamp(at);
  const prev = machines[id];
  const playerName = oneLine(player.name, 40);
  const next: MachineRecord = {
    name: oneLine(device.name, 40) || prev?.name || '',
    firstSeen: prev?.firstSeen ?? stamp,
    lastSeen: stamp,
    ips: [...new Set([...(prev?.ips ?? []), ...(srv.ip ? [srv.ip] : [])])].slice(-10),
    ua: oneLine(env.ua ?? srv.ua, 400),
    platform: oneLine(env.platform, 60),
    screen: oneLine(env.screen, 40),
    standalone: env.standalone === true,
    app: oneLine(entry.app, 40),
    players: [...new Set([...(prev?.players ?? []), ...(playerName ? [playerName] : [])])].slice(-20),
    visits: (prev?.visits ?? 0) + (entry.type === 'visit' ? 1 : 0),
    performs: (prev?.performs ?? 0) + (entry.type === 'perform' ? 1 : 0),
  };
  return { ...machines, [id]: next };
}

function header(req: IncomingMessage, name: string): string | undefined {
  const v = req.headers[name];
  return Array.isArray(v) ? v[0] : v;
}

function send(res: ServerResponse, status: number, body: unknown): void {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

/** Bộ xử lý HTTP (connect middleware hoặc `http.createServer`). Không bao giờ gọi `next`: đường dẫn đã thuộc về máy ghi. */
export function createPerformLogHandler(opts: CollectorOptions): (req: IncomingMessage, res: ServerResponse, next?: () => void) => void {
  const dir = resolve(opts.dir);
  const now = opts.now ?? (() => new Date());
  const extra = opts.origins ?? [];
  /** Mã log đã ghi (app gửi lại sau lỗi mạng → không ghi trùng). */
  const seen = new Set<string>();

  const write = (entries: Entry[], srv: ServerInfo, at: Date): number => {
    mkdirSync(dir, { recursive: true });
    const fresh = entries.filter((e) => !seen.has(String(e.id)));
    if (!fresh.length) return 0;
    appendFileSync(join(dir, `${localDate(at)}.jsonl`), fresh.map((e) => JSON.stringify({ ...e, srv })).join('\n') + '\n', 'utf8');
    const lines = fresh.map((e) => summaryLine(e, srv, at));
    appendFileSync(join(dir, 'summary.log'), lines.join('\n') + '\n', 'utf8');
    const machinesFile = join(dir, 'machines.json');
    let machines: Record<string, MachineRecord> = {};
    try {
      if (existsSync(machinesFile)) machines = JSON.parse(readFileSync(machinesFile, 'utf8')) as Record<string, MachineRecord>;
    } catch {
      machines = {};
    }
    for (const e of fresh) machines = updateMachines(machines, e, srv, at);
    writeFileSync(machinesFile, JSON.stringify(machines, null, 2) + '\n', 'utf8');
    for (const e of fresh) {
      seen.add(String(e.id));
      if (e.type === 'perform') opts.log?.(summaryLine(e, srv, at));
    }
    if (seen.size > 20_000) seen.clear();
    return fresh.length;
  };

  return (req, res) => {
    const origin = header(req, 'origin');
    if (!originAllowed(origin, header(req, 'host'), extra)) return send(res, 403, { ok: false, error: 'origin-not-allowed', origin });
    if (origin) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
      // Chrome: trang công khai (GitHub Pages) gọi máy trong mạng LAN.
      res.setHeader('Access-Control-Allow-Private-Network', 'true');
      res.setHeader('Access-Control-Max-Age', '600');
    }
    if (req.method === 'OPTIONS') {
      res.statusCode = 204;
      res.end();
      return;
    }
    if (req.method === 'GET') return send(res, 200, { ok: true, app: APP_ID, dir });
    if (req.method !== 'POST') return send(res, 405, { ok: false, error: 'method' });

    const chunks: Buffer[] = [];
    let size = 0;
    req.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size <= MAX_BODY_BYTES) chunks.push(chunk);
    });
    req.on('error', () => send(res, 400, { ok: false, error: 'read' }));
    req.on('end', () => {
      if (size > MAX_BODY_BYTES) return send(res, 413, { ok: false, error: 'too-large' });
      const { entries, rejected } = parseBody(Buffer.concat(chunks).toString('utf8'));
      if (!entries.length) return send(res, 400, { ok: false, error: 'no-valid-entry', rejected });
      const at = now();
      const srv: ServerInfo = {
        at: at.toISOString(),
        ip: (req.socket.remoteAddress ?? '').replace(/^::ffff:/, ''),
        origin: origin ?? '',
        ua: header(req, 'user-agent') ?? '',
      };
      try {
        const saved = write(entries, srv, at);
        send(res, 200, { ok: true, saved, duplicate: entries.length - saved, rejected });
      } catch (e) {
        send(res, 500, { ok: false, error: e instanceof Error ? e.message : 'write' });
      }
    });
  };
}

/** "a, b" → ['a', 'b']. */
export function splitList(value: string | undefined): string[] {
  return (value ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}
