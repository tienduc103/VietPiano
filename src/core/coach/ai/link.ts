/**
 * Trạng thái kết nối AI cục bộ (Ollama) của Coach — hiện ở màn chuẩn bị và trong lúc ĐANG ĐÁNH.
 *
 * Chỉ gọi GET `/api/tags` (danh sách model): không gửi dữ liệu học viên, không gọi model, không đụng bộ ghi / bộ chấm.
 * Tự kiểm tra lại định kỳ (đã kết nối: 30 s; chưa kết nối / thiếu model: 15 s), mỗi lần có timeout riêng, dừng khi app ẩn
 * hoặc rời màn Coach. Kết quả CHỈ để hiển thị: nhận xét sau khi chấm vẫn tự gọi AI và tự dùng nhận xét theo quy tắc khi lỗi.
 */
import type { AiStatus } from './provider';

export type AiLinkState = 'off' | 'checking' | 'connected' | 'no-model' | 'offline';

export interface AiLinkSnapshot {
  state: AiLinkState;
  /** Model trong Cài đặt → AI. */
  model: string;
  /** Địa chỉ Ollama trả lời được (proxy `/ollama` của server app hoặc localhost). */
  baseUrl?: string;
  /** Số model trên máy chủ (chẩn đoán). */
  modelCount?: number;
  error?: string;
  /** Lần kiểm tra gần nhất hỏng vì hết giờ. */
  timedOut?: boolean;
  /** Mốc (Date.now) lần kiểm tra xong gần nhất. */
  checkedAt?: number;
  /** Thời gian phản hồi của lần kiểm tra gần nhất (ms). */
  latencyMs?: number;
  /** Mốc lần cuối thấy đã kết nối (cùng cấu hình) → "mất kết nối" thay vì "chưa kết nối". */
  lastConnectedAt?: number;
  /** Đang kiểm tra lại — vẫn giữ kết quả cũ, không nhấp nháy. */
  refreshing: boolean;
  /** Số lần kiểm tra hỏng liên tiếp. */
  failures: number;
}

export interface AiLinkConfig {
  enabled: boolean;
  model: string;
  /** Khoá cấu hình (địa chỉ + model): đổi → bỏ kết quả cũ, kiểm tra lại ngay. */
  key: string;
  /** Một lần kiểm tra (vd. `OllamaProvider.status`); phải dừng khi `signal` huỷ. */
  check: (signal: AbortSignal) => Promise<AiStatus>;
}

export const AI_LINK_TIMEOUT_MS = 5000;
export const AI_LINK_OK_INTERVAL_MS = 30_000;
export const AI_LINK_RETRY_INTERVAL_MS = 15_000;

export interface AiLinkOptions {
  timeoutMs?: number;
  okIntervalMs?: number;
  retryIntervalMs?: number;
  /** Đồng hồ thật cho mốc "kiểm tra lúc". */
  now?: () => number;
  /** Đồng hồ đo thời gian phản hồi. */
  clock?: () => number;
  /** Ghi nhật ký khi trạng thái đổi (không ghi mỗi lần kiểm tra). */
  log?: (message: string, failed: boolean) => void;
}

type Timer = ReturnType<typeof setTimeout>;

const defaultLog = (message: string, failed: boolean) => (failed ? console.warn : console.info)(`[VietPiano] AI cục bộ: ${message}`);

/**
 * Bộ theo dõi dùng chung cho cả màn Coach (chuẩn bị → đang ghi → kết quả). API hợp `useSyncExternalStore`:
 * `subscribe` / `getSnapshot` (cùng đối tượng tới khi đổi).
 */
export class AiLinkMonitor {
  private cfg: AiLinkConfig | null = null;
  private snap: AiLinkSnapshot = { state: 'off', model: '', refreshing: false, failures: 0 };
  private readonly listeners = new Set<() => void>();
  private running = false;
  private visible = true;
  private timer: Timer | null = null;
  private inflight: { gen: number; ctrl: AbortController; timer: Timer } | null = null;
  /** Tăng khi huỷ / bắt đầu lần kiểm tra mới → kết quả cũ về muộn bị bỏ. */
  private gen = 0;
  /** Bấm "kiểm tra lại" lúc đang kiểm tra → kiểm tra thêm một lần ngay sau khi xong (kết quả đang chờ có thể đã cũ). */
  private again = false;
  private readonly o: Required<AiLinkOptions>;

  constructor(opts: AiLinkOptions = {}) {
    this.o = {
      timeoutMs: AI_LINK_TIMEOUT_MS,
      okIntervalMs: AI_LINK_OK_INTERVAL_MS,
      retryIntervalMs: AI_LINK_RETRY_INTERVAL_MS,
      now: () => Date.now(),
      clock: () => performance.now(),
      log: defaultLog,
      ...opts,
    };
  }

  readonly subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  };

  readonly getSnapshot = (): AiLinkSnapshot => this.snap;

  /** Đặt / đổi cấu hình. Cùng bật-tắt + khoá → chỉ cập nhật hàm kiểm tra, giữ kết quả. */
  configure(cfg: AiLinkConfig): void {
    const prev = this.cfg;
    this.cfg = cfg;
    if (prev && prev.enabled === cfg.enabled && prev.key === cfg.key) return;
    this.cancel();
    this.set({ state: cfg.enabled ? 'checking' : 'off', model: cfg.model, refreshing: false, failures: 0 });
    this.schedule(0);
  }

  /** Bắt đầu theo dõi (mở màn Coach). */
  start(): void {
    this.running = true;
    this.resume();
  }

  /** Dừng theo dõi (rời màn): huỷ lần kiểm tra đang chạy, giữ kết quả cuối. */
  stop(): void {
    this.running = false;
    this.cancel();
    if (this.snap.refreshing) this.set({ ...this.snap, refreshing: false });
  }

  /** App ẩn → không kiểm tra; hiện lại → kiểm tra ngay nếu kết quả đã cũ. */
  setVisible(visible: boolean): void {
    if (this.visible === visible) return;
    this.visible = visible;
    if (visible) this.resume();
    else this.clearTimer();
  }

  /** Kiểm tra ngay (nút "Kiểm tra lại" / bấm chip). Đang kiểm tra → thêm một lần ngay sau đó; AI tắt / app ẩn → bỏ qua. */
  refresh(): void {
    if (!this.active) return;
    if (this.inflight) {
      this.again = true;
      return;
    }
    this.clearTimer();
    void this.runCheck();
  }

  private get active(): boolean {
    return this.running && this.visible && !!this.cfg?.enabled;
  }

  private intervalFor(s: AiLinkSnapshot): number {
    return s.state === 'connected' ? this.o.okIntervalMs : this.o.retryIntervalMs;
  }

  private resume(): void {
    if (!this.active || this.inflight) return;
    const age = this.snap.checkedAt === undefined ? Infinity : this.o.now() - this.snap.checkedAt;
    this.schedule(Math.max(0, this.intervalFor(this.snap) - age));
  }

  private schedule(ms: number): void {
    this.clearTimer();
    if (!this.active) return;
    if (ms <= 0) {
      void this.runCheck();
      return;
    }
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.runCheck();
    }, ms);
  }

  private clearTimer(): void {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
  }

  private cancel(): void {
    this.clearTimer();
    this.again = false;
    if (this.inflight) {
      clearTimeout(this.inflight.timer);
      this.inflight.ctrl.abort();
      this.inflight = null;
    }
    this.gen++;
  }

  private async runCheck(): Promise<void> {
    const cfg = this.cfg;
    if (!cfg?.enabled || this.inflight) return;
    const gen = ++this.gen;
    const ctrl = new AbortController();
    const started = this.o.clock();
    let timer: Timer | undefined;
    const timeout = new Promise<'timeout'>((resolve) => {
      timer = setTimeout(() => resolve('timeout'), this.o.timeoutMs);
    });
    this.inflight = { gen, ctrl, timer: timer! };
    if (this.snap.state !== 'checking' && !this.snap.refreshing) this.set({ ...this.snap, refreshing: true });
    const out = await Promise.race([
      cfg.check(ctrl.signal).catch((e: unknown): AiStatus => ({ ok: false, error: e instanceof Error ? e.message : String(e), kind: 'network' })),
      timeout,
    ]);
    clearTimeout(timer);
    // Hàm kiểm tra không tự dừng khi hết giờ → huỷ request.
    if (out === 'timeout') ctrl.abort();
    if (gen !== this.gen) return;
    this.inflight = null;
    this.finish(cfg, out, Math.round(this.o.clock() - started));
    const again = this.again;
    this.again = false;
    this.schedule(again ? 0 : this.intervalFor(this.snap));
  }

  private finish(cfg: AiLinkConfig, out: AiStatus | 'timeout', latencyMs: number): void {
    const prev = this.snap;
    const checkedAt = this.o.now();
    const base = { model: cfg.model, checkedAt, latencyMs, refreshing: false, ...(prev.lastConnectedAt !== undefined ? { lastConnectedAt: prev.lastConnectedAt } : {}) };
    let next: AiLinkSnapshot;
    if (out === 'timeout') {
      next = { ...base, state: 'offline', error: `Ollama không trả lời trong ${Math.round(this.o.timeoutMs / 1000)} giây`, timedOut: true, failures: prev.failures + 1 };
    } else if (out.ok) {
      next = {
        ...base,
        state: out.modelAvailable ? 'connected' : 'no-model',
        ...(out.baseUrl !== undefined ? { baseUrl: out.baseUrl } : {}),
        modelCount: out.models?.length ?? 0,
        failures: 0,
        ...(out.modelAvailable ? { lastConnectedAt: checkedAt } : {}),
      };
    } else {
      next = { ...base, state: 'offline', error: out.error || 'Không kết nối được Ollama', failures: prev.failures + 1 };
    }
    if (next.state !== prev.state || next.baseUrl !== prev.baseUrl) {
      const what =
        next.state === 'connected'
          ? `đã kết nối ${next.baseUrl ?? ''} (model ${cfg.model}, ${latencyMs} ms)`
          : next.state === 'no-model'
            ? `kết nối ${next.baseUrl ?? ''} nhưng chưa có model ${cfg.model}`
            : `${prev.state === 'connected' ? 'mất kết nối' : 'chưa kết nối'} — ${next.error}`;
      this.o.log(what, next.state !== 'connected');
    }
    this.set(next);
  }

  private set(next: AiLinkSnapshot): void {
    this.snap = next;
    for (const fn of this.listeners) fn();
  }
}

export type AiLinkTone = 'ok' | 'warn' | 'error' | 'muted' | 'busy';

export interface AiLinkView {
  tone: AiLinkTone;
  /** Ký hiệu đi kèm màu (không dựa riêng vào màu). */
  icon: string;
  /** Chữ ngắn luôn hiện. */
  label: string;
  /** Phần phụ: model đang dùng hoặc hệ quả ("nhận xét theo quy tắc"). */
  sub: string;
  /** Mô tả đầy đủ (thẻ AI ở màn chuẩn bị, tooltip). */
  detail: string;
}

/** Câu giải thích dữ liệu: dùng chung cho tooltip / thẻ AI. */
export const AI_LINK_PRIVACY =
  'Trong lúc đánh app không gửi gì cho AI; bấm "Kết thúc & chấm" thì app gửi bản tóm tắt điểm (không âm thanh, không log MIDI) để AI nhận xét. Điểm luôn do thuật toán chấm.';

const RULES = 'nhận xét theo quy tắc';

/** Chữ hiển thị cho một trạng thái (thuần, có test). */
export function aiLinkView(s: AiLinkSnapshot, opts: { formatTime?: (ms: number) => string; retryIntervalMs?: number } = {}): AiLinkView {
  const time = (ms: number | undefined) => (ms === undefined ? '' : (opts.formatTime ?? ((x: number) => new Date(x).toLocaleTimeString('vi-VN')))(ms));
  const retrySec = Math.round((opts.retryIntervalMs ?? AI_LINK_RETRY_INTERVAL_MS) / 1000);
  const checked = s.checkedAt !== undefined ? ` (kiểm tra lúc ${time(s.checkedAt)})` : '';
  switch (s.state) {
    case 'off':
      return { tone: 'muted', icon: '○', label: 'AI cục bộ: tắt', sub: RULES, detail: 'AI cục bộ đang tắt (Cài đặt → AI). Sau khi chấm vẫn có nhận xét theo quy tắc từ kết quả.' };
    case 'checking':
      return { tone: 'busy', icon: '⋯', label: 'AI cục bộ: đang kiểm tra…', sub: s.model, detail: `Đang tìm Ollama và model "${s.model}"…` };
    case 'connected':
      return {
        tone: 'ok',
        icon: '✓',
        label: 'AI cục bộ: đã kết nối',
        sub: s.model,
        detail: `Kết nối tốt: Ollama ở ${s.baseUrl ?? '?'} trả lời sau ${s.latencyMs ?? '?'} ms, model "${s.model}" đã có${checked}.`,
      };
    case 'no-model':
      return {
        tone: 'warn',
        icon: '!',
        label: 'AI cục bộ: thiếu model',
        sub: RULES,
        detail: `Kết nối được ${s.baseUrl ?? 'Ollama'} nhưng chưa có model "${s.model}"${checked} — chạy "ollama pull ${s.model}" hoặc chọn model khác ở Cài đặt → AI. Chưa có model thì sau khi chấm dùng nhận xét theo quy tắc.`,
      };
    case 'offline':
      return {
        tone: 'error',
        icon: '✕',
        label: s.lastConnectedAt !== undefined ? 'AI cục bộ: mất kết nối' : 'AI cục bộ: chưa kết nối',
        sub: RULES,
        detail: `${s.error ?? 'Không kết nối được Ollama'}${checked}. Sau khi chấm sẽ dùng nhận xét theo quy tắc; app tự kiểm tra lại mỗi ${retrySec} giây. Kiểm tra Ollama đang chạy; iPad / máy khác thì mở app từ máy cài Ollama (npm run serve:lan).`,
      };
  }
}
