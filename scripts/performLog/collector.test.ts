import { createServer, type Server } from 'node:http';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { APP_ID, createPerformLogHandler, isPrivateHost, MAX_BODY_BYTES, originAllowed, parseBody, shortAgent, splitList, summaryLine, updateMachines } from './collector.ts';

const AT = new Date(2026, 10, 8, 14, 3, 22);

const visit = (id: string, extra: Record<string, unknown> = {}) => ({
  v: 1,
  id,
  type: 'visit',
  reason: 'open',
  at: AT.toISOString(),
  app: '2.21.1',
  device: { id: 'd-ipad0001', name: 'iPad bé An' },
  player: { id: 'p1', name: 'Bé An', age: 7, experience: 'new' },
  env: { ua: 'Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) Version/18.0 Safari/605.1.15', page: 'https://192.168.1.14:5173/', screen: '1180x820@2', standalone: true, platform: 'iPad' },
  ...extra,
});

const perform = (id: string) => ({ ...visit(id), type: 'perform', summary: 'Biểu diễn Luyện tập · "Gam" [scale-c-major] · điểm 40\nnghi: trễ' });

describe('máy ghi — quy tắc', () => {
  it('máy nội bộ', () => {
    for (const h of ['localhost', '127.0.0.1', '10.0.0.5', '172.20.1.1', '192.168.1.14', '169.254.3.3', 'pc.local', '[::1]', 'fd12:3456::1']) expect(isPrivateHost(h)).toBe(true);
    for (const h of ['8.8.8.8', '172.32.0.1', 'example.com', 'tienduc103.github.io']) expect(isPrivateHost(h)).toBe(false);
  });

  it('trang được gửi log: không Origin, máy nội bộ, *.github.io (https), cùng máy, danh sách thêm', () => {
    expect(originAllowed(undefined, 'pc:8790')).toBe(true);
    expect(originAllowed('https://192.168.1.14:5173', '192.168.1.14:5173')).toBe(true);
    expect(originAllowed('http://localhost:4173', 'localhost:4173')).toBe(true);
    expect(originAllowed('https://tienduc103.github.io', '192.168.1.14:8790')).toBe(true);
    expect(originAllowed('http://evil.github.io', '192.168.1.14:8790')).toBe(false);
    expect(originAllowed('https://example.com', '192.168.1.14:8790')).toBe(false);
    expect(originAllowed('https://example.com', '192.168.1.14:8790', ['https://example.com'])).toBe(true);
    expect(originAllowed('https://example.com', 'x', ['*'])).toBe(true);
    expect(originAllowed('https://piano.example.com', 'piano.example.com:443')).toBe(true);
    expect(originAllowed('not a url', 'x')).toBe(false);
    expect(splitList(' a, ,b ')).toEqual(['a', 'b']);
  });

  it('chỉ nhận bản log đúng dạng', () => {
    const body = [JSON.stringify(visit('a')), '{bad json', JSON.stringify({ ...visit('b'), v: 2 }), JSON.stringify({ ...visit('c'), device: {} }), '', JSON.stringify(perform('d'))].join('\n');
    const r = parseBody(body);
    expect(r.entries.map((e) => e.id)).toEqual(['a', 'd']);
    expect(r.rejected).toBe(3);
  });

  it('dòng summary.log: một dòng, có IP, máy, người chơi, trình duyệt', () => {
    const srv = { at: '', ip: '192.168.1.20', origin: '', ua: '' };
    expect(summaryLine(visit('a'), srv, AT)).toBe('2026-11-08 14:03:22 | 192.168.1.20 | iPad bé An d-ipad0001 | Bé An | iOS/Safari | mở app · v2.21.1 · https://192.168.1.14:5173/ · 1180x820@2 · app cài');
    expect(summaryLine(perform('b'), srv, AT)).toContain('| Biểu diễn Luyện tập · "Gam" [scale-c-major] · điểm 40 nghi: trễ');
    expect(shortAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/156.0 Safari/537.36')).toBe('Windows/Chrome');
    expect(shortAgent('Mozilla/5.0 (Windows NT 10.0) Chrome/156.0 Safari/537.36 Edg/156.0')).toBe('Windows/Edge');
  });

  it('danh sách máy: gộp IP, người chơi, đếm lần mở app / lượt Biểu diễn', () => {
    const srv = { at: '', ip: '192.168.1.20', origin: '', ua: '' };
    let m = updateMachines({}, visit('a'), srv, AT);
    m = updateMachines(m, { ...perform('b'), player: { name: 'Bé Bình' } }, { ...srv, ip: '192.168.1.21' }, new Date(2026, 10, 8, 15, 0, 0));
    expect(m['d-ipad0001']).toMatchObject({
      name: 'iPad bé An',
      firstSeen: '2026-11-08 14:03:22',
      lastSeen: '2026-11-08 15:00:00',
      ips: ['192.168.1.20', '192.168.1.21'],
      players: ['Bé An', 'Bé Bình'],
      visits: 1,
      performs: 1,
      standalone: true,
    });
  });
});

describe('máy ghi — HTTP', () => {
  let dir: string;
  let server: Server;
  let url: string;
  const printed: string[] = [];

  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), 'vp-perflog-'));
    printed.length = 0;
    const handler = createPerformLogHandler({ dir, now: () => AT, log: (l) => printed.push(l) });
    server = createServer((req, res) => handler(req, res));
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
    const addr = server.address();
    url = `http://127.0.0.1:${typeof addr === 'object' && addr ? addr.port : 0}/`;
  });

  afterEach(async () => {
    await new Promise<void>((r) => server.close(() => r()));
    rmSync(dir, { recursive: true, force: true });
  });

  const post = (lines: unknown[], headers: Record<string, string> = {}) =>
    fetch(url, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=UTF-8', ...headers }, body: lines.map((l) => JSON.stringify(l)).join('\n') + '\n' });

  it('POST: ghi file ngày (kèm IP / origin), summary.log, machines.json; gửi lại không ghi trùng', async () => {
    const res = await post([visit('a'), perform('b')], { Origin: 'https://tienduc103.github.io' });
    expect(res.status).toBe(200);
    expect(res.headers.get('access-control-allow-origin')).toBe('https://tienduc103.github.io');
    expect(await res.json()).toEqual({ ok: true, saved: 2, duplicate: 0, rejected: 0 });

    const day = readFileSync(join(dir, '2026-11-08.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
    expect(day.map((e) => e.id)).toEqual(['a', 'b']);
    expect(day[0].srv).toMatchObject({ ip: '127.0.0.1', origin: 'https://tienduc103.github.io', at: AT.toISOString() });
    expect(readFileSync(join(dir, 'summary.log'), 'utf8').trim().split('\n')).toHaveLength(2);
    expect(JSON.parse(readFileSync(join(dir, 'machines.json'), 'utf8'))['d-ipad0001']).toMatchObject({ visits: 1, performs: 1, ips: ['127.0.0.1'] });
    expect(printed).toHaveLength(1); // chỉ in lượt Biểu diễn

    const again = await post([perform('b'), perform('c')]);
    expect(await again.json()).toEqual({ ok: true, saved: 1, duplicate: 1, rejected: 0 });
    expect(readFileSync(join(dir, '2026-11-08.jsonl'), 'utf8').trim().split('\n')).toHaveLength(3);
  });

  it('trang lạ → 403; không có bản hợp lệ → 400; quá lớn → 413', async () => {
    expect((await post([visit('a')], { Origin: 'https://example.com' })).status).toBe(403);
    expect((await post([{ hello: 1 }])).status).toBe(400);
    const big = await fetch(url, { method: 'POST', body: 'x'.repeat(MAX_BODY_BYTES + 10) });
    expect(big.status).toBe(413);
  });

  it('GET = thử kết nối; OPTIONS = preflight (kể cả mạng cục bộ của Chrome); phương thức khác → 405', async () => {
    const ping = await fetch(url);
    expect(await ping.json()).toMatchObject({ ok: true, app: APP_ID, dir });
    const pre = await fetch(url, { method: 'OPTIONS', headers: { Origin: 'http://192.168.1.20:5173', 'Access-Control-Request-Private-Network': 'true' } });
    expect(pre.status).toBe(204);
    expect(pre.headers.get('access-control-allow-private-network')).toBe('true');
    expect(pre.headers.get('access-control-allow-methods')).toContain('POST');
    expect((await fetch(url, { method: 'DELETE' })).status).toBe(405);
  });
});
