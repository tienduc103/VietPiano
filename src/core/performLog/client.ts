/**
 * Nhật ký Biểu diễn (TẠM THỜI, docs/perform-log.md) — lưu log vào hàng đợi trên máy rồi gửi tới máy ghi:
 * POST NDJSON (`Content-Type: text/plain` → không preflight CORS), mỗi lần tối đa `BATCH` bản / `MAX_BODY` byte;
 * máy ghi trả `{ ok: true }` thì đánh dấu đã gửi. Lỗi (không có máy ghi, mất mạng, trang https gọi http bị chặn…)
 * → giữ trên máy, không thử lại địa chỉ đó tới lần mở app sau / bấm "Gửi ngay". Không bao giờ chặn luồng học.
 */
import type { LogCounts, LogQueue } from './queue';
import type { PerformLogSettings } from './settings';
import type { PerformLogEntry } from './types';

export const BATCH = 20;
export const MAX_BODY = 1_500_000;

export interface LogStatus extends LogCounts {
  sending: boolean;
  /** Địa chỉ đang dùng; null = không gửi (chỉ lưu trên máy). */
  endpoint: string | null;
  lastSentAt: number | null;
  lastError: string | null;
}

export interface PerformLogClientDeps {
  queue: () => LogQueue;
  fetch: () => typeof fetch | undefined;
  settings: () => PerformLogSettings;
  endpoint: (settings: PerformLogSettings) => string | null;
  now?: () => number;
  /** Hẹn giờ gửi (test truyền đồng bộ). */
  schedule?: (fn: () => void, ms: number) => void;
}

/** Thông báo lỗi dễ hiểu cho Cài đặt. */
export function describeSendError(e: unknown): string {
  if (e instanceof LogHttpError) {
    if (e.status === 404 || e.status === 405) return `Máy chủ không có máy ghi log (HTTP ${e.status}).`;
    if (e.status === 403) return 'Máy ghi từ chối trang này (HTTP 403) — thêm địa chỉ trang vào PERFLOG_ORIGINS trên máy ghi.';
    if (e.status === 413) return 'Log quá lớn (HTTP 413).';
    return `Máy ghi báo lỗi HTTP ${e.status}.`;
  }
  if (e instanceof Error && e.message === 'bad-response') return 'Địa chỉ trả lời không phải máy ghi log của VietPiano.';
  return 'Không kết nối được máy ghi (máy ghi chưa chạy, sai địa chỉ, hoặc trình duyệt chặn trang https gọi địa chỉ http).';
}

export class LogHttpError extends Error {
  constructor(readonly status: number) {
    super(`HTTP ${status}`);
  }
}

/** Chia các bản log thành từng lần gửi (≤ BATCH bản, ≤ MAX_BODY byte; một bản quá lớn vẫn gửi riêng). */
export function batches(entries: readonly PerformLogEntry[]): { ids: string[]; body: string }[] {
  const out: { ids: string[]; body: string }[] = [];
  let ids: string[] = [];
  let body = '';
  for (const e of entries) {
    const line = `${JSON.stringify(e)}\n`;
    if (ids.length && (ids.length >= BATCH || body.length + line.length > MAX_BODY)) {
      out.push({ ids, body });
      ids = [];
      body = '';
    }
    ids.push(e.id);
    body += line;
  }
  if (ids.length) out.push({ ids, body });
  return out;
}

export class PerformLogClient {
  private status: LogStatus = { total: 0, pending: 0, perform: 0, sending: false, endpoint: null, lastSentAt: null, lastError: null };
  private readonly listeners = new Set<() => void>();
  /** Địa chỉ vừa lỗi: không tự thử lại (tới lần mở app sau hoặc bấm "Gửi ngay"). */
  private failed: string | null = null;
  private flushing: Promise<void> | null = null;
  private pendingTimer = false;

  constructor(private readonly deps: PerformLogClientDeps) {}

  getStatus(): LogStatus {
    return this.status;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private set(patch: Partial<LogStatus>): void {
    this.status = { ...this.status, ...patch };
    this.listeners.forEach((l) => l());
  }

  /** Đọc lại số bản trên máy + địa chỉ gửi (Cài đặt gọi khi mở). */
  async refresh(): Promise<void> {
    try {
      const counts = await this.deps.queue().counts();
      this.set({ ...counts, endpoint: this.deps.endpoint(this.deps.settings()) });
    } catch {
      // Không đọc được hàng đợi: giữ số cũ.
    }
  }

  /** Lưu một bản log (khi đang bật) rồi hẹn gửi. Không ném lỗi. */
  async record(entry: PerformLogEntry): Promise<void> {
    if (!this.deps.settings().enabled) return;
    try {
      await this.deps.queue().add(entry);
    } catch {
      return;
    }
    await this.refresh();
    this.scheduleFlush();
  }

  scheduleFlush(ms = 800): void {
    if (this.pendingTimer) return;
    this.pendingTimer = true;
    const run = () => {
      this.pendingTimer = false;
      void this.flush();
    };
    (this.deps.schedule ?? ((fn, t) => setTimeout(fn, t)))(run, ms);
  }

  /** Gửi các bản chưa gửi. `force`: thử cả địa chỉ vừa lỗi (nút "Gửi ngay"). */
  flush(force = false): Promise<void> {
    if (this.flushing) return this.flushing;
    this.flushing = this.doFlush(force).finally(() => {
      this.flushing = null;
    });
    return this.flushing;
  }

  private async doFlush(force: boolean): Promise<void> {
    const settings = this.deps.settings();
    const endpoint = settings.enabled ? this.deps.endpoint(settings) : null;
    const doFetch = this.deps.fetch();
    if (!endpoint || !doFetch) {
      this.set({ endpoint: null });
      return;
    }
    if (force) this.failed = null;
    if (this.failed === endpoint) return;
    this.set({ sending: true, endpoint });
    try {
      // Bản đã gửi trong lần này (hàng đợi không đánh dấu được thì cũng không gửi lặp mãi).
      const done = new Set<string>();
      for (;;) {
        const entries = (await this.deps.queue().unsent(BATCH)).filter((e) => !done.has(e.id));
        if (!entries.length) break;
        for (const b of batches(entries)) {
          const res = await doFetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=UTF-8' }, body: b.body });
          if (!res.ok) throw new LogHttpError(res.status);
          const json = (await res.json().catch(() => null)) as { ok?: unknown } | null;
          if (!json || json.ok !== true) throw new Error('bad-response');
          await this.deps.queue().markSent(b.ids);
          b.ids.forEach((id) => done.add(id));
        }
        this.set({ lastSentAt: (this.deps.now ?? Date.now)(), lastError: null });
      }
    } catch (e) {
      this.failed = endpoint;
      this.set({ lastError: describeSendError(e) });
    } finally {
      this.set({ sending: false });
      await this.refresh();
    }
  }

  /** Thử địa chỉ máy ghi (GET → `{ ok: true, app: 'vietpiano-perform-log' }`). */
  async test(endpoint: string | null): Promise<{ ok: boolean; text: string }> {
    const doFetch = this.deps.fetch();
    if (!endpoint || !doFetch) return { ok: false, text: 'Chưa có địa chỉ máy ghi: "auto" chỉ dùng được khi mở app từ máy chủ của app (npm run dev / serve:lan).' };
    try {
      const res = await doFetch(endpoint, { method: 'GET' });
      if (!res.ok) throw new LogHttpError(res.status);
      const json = (await res.json().catch(() => null)) as { ok?: unknown; app?: unknown; dir?: unknown } | null;
      if (!json || json.ok !== true || json.app !== 'vietpiano-perform-log') throw new Error('bad-response');
      this.failed = null;
      return { ok: true, text: `Kết nối tốt — máy ghi lưu vào ${typeof json.dir === 'string' ? json.dir : 'thư mục log'}.` };
    } catch (e) {
      return { ok: false, text: describeSendError(e) };
    }
  }

  /** Toàn bộ log trên máy, mỗi dòng một bản (NDJSON) — để tải file khi không gửi được. */
  async exportText(): Promise<string> {
    const all = await this.deps.queue().all();
    return all.map((e) => JSON.stringify(e)).join('\n') + (all.length ? '\n' : '');
  }

  async clear(): Promise<void> {
    await this.deps.queue().clear();
    await this.refresh();
  }
}
