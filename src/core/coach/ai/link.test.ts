import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AI_LINK_PRIVACY, AiLinkMonitor, aiLinkView, type AiLinkConfig, type AiLinkSnapshot } from './link';
import type { AiStatus } from './provider';

const OK: AiStatus = { ok: true, baseUrl: 'http://localhost:11434', models: ['gemma4:12b', 'llama3:latest'], modelAvailable: true };
const NO_MODEL: AiStatus = { ok: true, baseUrl: 'http://localhost:11434', models: ['llama3:latest'], modelAvailable: false };
const DOWN: AiStatus = { ok: false, error: 'Không kết nối được Ollama', kind: 'network' };

/** Hàm kiểm tra giả: trả lần lượt các kết quả (hết danh sách → kết quả cuối), ghi lại tín hiệu huỷ. */
function fakeCheck(results: (AiStatus | 'hang')[]) {
  const signals: AbortSignal[] = [];
  let i = 0;
  const check = vi.fn((signal: AbortSignal) => {
    signals.push(signal);
    const r = results[Math.min(i++, results.length - 1)];
    return r === 'hang' ? new Promise<AiStatus>(() => {}) : Promise.resolve(r);
  });
  return { check, signals };
}

const cfg = (check: AiLinkConfig['check'], patch: Partial<AiLinkConfig> = {}): AiLinkConfig => ({ enabled: true, model: 'gemma4:12b', key: 'auto|gemma4:12b', check, ...patch });

describe('AiLinkMonitor', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-07T10:00:00Z'));
  });
  afterEach(() => vi.useRealTimers());

  const monitor = (log = vi.fn()) => new AiLinkMonitor({ log, clock: () => Date.now() });

  it('AI tắt → trạng thái "off", không gọi mạng', async () => {
    const { check } = fakeCheck([OK]);
    const m = monitor();
    m.configure(cfg(check, { enabled: false }));
    m.start();
    await vi.advanceTimersByTimeAsync(120_000);
    expect(check).not.toHaveBeenCalled();
    expect(m.getSnapshot().state).toBe('off');
    m.refresh();
    expect(check).not.toHaveBeenCalled();
  });

  it('mở màn → kiểm tra ngay; đã kết nối → kiểm tra lại sau 30 s; ghi nhật ký chỉ khi đổi trạng thái', async () => {
    const { check } = fakeCheck([OK]);
    const log = vi.fn();
    const m = monitor(log);
    m.configure(cfg(check));
    expect(m.getSnapshot().state).toBe('checking');
    m.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(check).toHaveBeenCalledTimes(1);
    expect(m.getSnapshot()).toMatchObject({ state: 'connected', baseUrl: 'http://localhost:11434', modelCount: 2, failures: 0, refreshing: false, checkedAt: Date.parse('2026-11-07T10:00:00Z') });
    expect(m.getSnapshot().lastConnectedAt).toBeDefined();
    await vi.advanceTimersByTimeAsync(29_000);
    expect(check).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(check).toHaveBeenCalledTimes(2);
    expect(log).toHaveBeenCalledTimes(1);
    expect(log.mock.calls[0]).toEqual([expect.stringContaining('đã kết nối http://localhost:11434'), false]);
  });

  it('chưa kết nối → thử lại mỗi 15 s; Ollama bật lên → "đã kết nối"; tắt giữa chừng → "mất kết nối"', async () => {
    const { check } = fakeCheck([DOWN, DOWN, OK, DOWN]);
    const log = vi.fn();
    const m = monitor(log);
    m.configure(cfg(check));
    m.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(m.getSnapshot()).toMatchObject({ state: 'offline', failures: 1, error: 'Không kết nối được Ollama' });
    expect(aiLinkView(m.getSnapshot()).label).toBe('AI cục bộ: chưa kết nối');
    await vi.advanceTimersByTimeAsync(15_000);
    expect(m.getSnapshot()).toMatchObject({ state: 'offline', failures: 2 });
    await vi.advanceTimersByTimeAsync(15_000);
    expect(m.getSnapshot()).toMatchObject({ state: 'connected', failures: 0 });
    await vi.advanceTimersByTimeAsync(30_000);
    expect(m.getSnapshot()).toMatchObject({ state: 'offline', failures: 1 });
    expect(aiLinkView(m.getSnapshot()).label).toBe('AI cục bộ: mất kết nối');
    expect(check).toHaveBeenCalledTimes(4);
    // offline → connected → offline: 3 lần đổi trạng thái (lần offline thứ hai giữ nguyên không ghi).
    expect(log.mock.calls.map((c) => c[1])).toEqual([true, false, true]);
    expect(log.mock.calls[2][0]).toContain('mất kết nối');
  });

  it('kết nối được nhưng chưa tải model → "no-model"', async () => {
    const { check } = fakeCheck([NO_MODEL]);
    const m = monitor();
    m.configure(cfg(check));
    m.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(m.getSnapshot()).toMatchObject({ state: 'no-model', modelCount: 1 });
    await vi.advanceTimersByTimeAsync(15_000);
    expect(check).toHaveBeenCalledTimes(2);
  });

  it('không trả lời → hết giờ sau 5 s: "offline", huỷ request', async () => {
    const { check, signals } = fakeCheck(['hang']);
    const m = monitor();
    m.configure(cfg(check));
    m.start();
    await vi.advanceTimersByTimeAsync(4_999);
    expect(m.getSnapshot().state).toBe('checking');
    await vi.advanceTimersByTimeAsync(1);
    expect(m.getSnapshot()).toMatchObject({ state: 'offline', timedOut: true, error: 'Ollama không trả lời trong 5 giây' });
    expect(signals[0].aborted).toBe(true);
  });

  it('hàm kiểm tra ném lỗi → "offline" kèm thông báo', async () => {
    const m = monitor();
    m.configure(cfg(() => Promise.reject(new Error('boom'))));
    m.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(m.getSnapshot()).toMatchObject({ state: 'offline', error: 'boom' });
  });

  it('đổi địa chỉ / model giữa lúc đang kiểm tra → bỏ kết quả cũ, kiểm tra cấu hình mới ngay', async () => {
    let resolveOld!: (s: AiStatus) => void;
    const old = vi.fn((_s: AbortSignal) => new Promise<AiStatus>((r) => (resolveOld = r)));
    const m = monitor();
    m.configure(cfg(old));
    m.start();
    await vi.advanceTimersByTimeAsync(0);
    const fresh = fakeCheck([NO_MODEL]);
    m.configure(cfg(fresh.check, { model: 'qwen3:8b', key: 'auto|qwen3:8b' }));
    expect(old.mock.calls[0][0].aborted).toBe(true);
    await vi.advanceTimersByTimeAsync(0);
    resolveOld(OK);
    await vi.advanceTimersByTimeAsync(0);
    expect(m.getSnapshot()).toMatchObject({ state: 'no-model', model: 'qwen3:8b' });
    expect(m.getSnapshot().lastConnectedAt).toBeUndefined();
  });

  it('cùng cấu hình (hàm kiểm tra mới mỗi lần render) → giữ kết quả, không kiểm tra lại', async () => {
    const a = fakeCheck([OK]);
    const m = monitor();
    m.configure(cfg(a.check));
    m.start();
    await vi.advanceTimersByTimeAsync(0);
    const snap = m.getSnapshot();
    const b = fakeCheck([DOWN]);
    m.configure(cfg(b.check));
    await vi.advanceTimersByTimeAsync(0);
    expect(m.getSnapshot()).toBe(snap);
    expect(b.check).not.toHaveBeenCalled();
    // Lần định kỳ sau dùng hàm mới.
    await vi.advanceTimersByTimeAsync(30_000);
    expect(b.check).toHaveBeenCalledTimes(1);
  });

  it('rời màn → dừng; mở lại: kết quả còn mới thì chờ nốt, cũ thì kiểm tra ngay', async () => {
    const { check } = fakeCheck([OK]);
    const m = monitor();
    m.configure(cfg(check));
    m.start();
    await vi.advanceTimersByTimeAsync(0);
    m.stop();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(check).toHaveBeenCalledTimes(1);
    m.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(check).toHaveBeenCalledTimes(2);
    m.stop();
    await vi.advanceTimersByTimeAsync(10_000);
    m.start();
    await vi.advanceTimersByTimeAsync(19_999);
    expect(check).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1);
    expect(check).toHaveBeenCalledTimes(3);
  });

  it('app ẩn → không kiểm tra; hiện lại sau lâu → kiểm tra ngay', async () => {
    const { check } = fakeCheck([OK]);
    const m = monitor();
    m.configure(cfg(check));
    m.start();
    await vi.advanceTimersByTimeAsync(0);
    m.setVisible(false);
    await vi.advanceTimersByTimeAsync(120_000);
    expect(check).toHaveBeenCalledTimes(1);
    m.refresh();
    expect(check).toHaveBeenCalledTimes(1);
    m.setVisible(true);
    await vi.advanceTimersByTimeAsync(0);
    expect(check).toHaveBeenCalledTimes(2);
  });

  it('bấm kiểm tra lại: gọi ngay; giữ kết quả cũ trong lúc kiểm tra (refreshing); bấm lúc đang kiểm tra → thêm MỘT lần ngay sau đó', async () => {
    let release!: (s: AiStatus) => void;
    const check = vi
      .fn<(s: AbortSignal) => Promise<AiStatus>>()
      .mockResolvedValueOnce(OK)
      .mockImplementationOnce(() => new Promise<AiStatus>((r) => (release = r)))
      .mockResolvedValue(OK);
    const m = monitor();
    m.configure(cfg(check));
    m.start();
    await vi.advanceTimersByTimeAsync(0);
    const seen: AiLinkSnapshot[] = [];
    m.subscribe(() => seen.push(m.getSnapshot()));
    m.refresh();
    expect(check).toHaveBeenCalledTimes(2);
    expect(m.getSnapshot()).toMatchObject({ state: 'connected', refreshing: true });
    m.refresh();
    m.refresh();
    expect(check).toHaveBeenCalledTimes(2);
    release(DOWN);
    await vi.advanceTimersByTimeAsync(0);
    expect(check).toHaveBeenCalledTimes(3);
    expect(seen.map((s) => [s.state, s.refreshing])).toEqual([
      ['connected', true],
      ['offline', false],
      ['offline', true],
      ['connected', false],
    ]);
    // Sau đó về nhịp định kỳ bình thường.
    await vi.advanceTimersByTimeAsync(29_999);
    expect(check).toHaveBeenCalledTimes(3);
    await vi.advanceTimersByTimeAsync(1);
    expect(check).toHaveBeenCalledTimes(4);
  });

  it('getSnapshot trả cùng đối tượng khi không đổi (useSyncExternalStore)', async () => {
    const { check } = fakeCheck([OK]);
    const m = monitor();
    m.configure(cfg(check));
    expect(m.getSnapshot()).toBe(m.getSnapshot());
    const unsubscribe = m.subscribe(() => {});
    unsubscribe();
  });
});

describe('aiLinkView', () => {
  const at = Date.parse('2026-11-07T10:00:00Z');
  const fmt = { formatTime: () => '17:00:00' };
  const snap = (patch: Partial<AiLinkSnapshot>): AiLinkSnapshot => ({ state: 'off', model: 'gemma4:12b', refreshing: false, failures: 0, ...patch });

  it('mỗi trạng thái có ký hiệu + chữ (không chỉ màu) và nói rõ hệ quả', () => {
    expect(aiLinkView(snap({}))).toMatchObject({ tone: 'muted', icon: '○', label: 'AI cục bộ: tắt', sub: 'nhận xét theo quy tắc' });
    expect(aiLinkView(snap({ state: 'checking' }))).toMatchObject({ tone: 'busy', label: 'AI cục bộ: đang kiểm tra…', sub: 'gemma4:12b' });
    const ok = aiLinkView(snap({ state: 'connected', baseUrl: 'https://pc:5173/ollama', latencyMs: 42, checkedAt: at }), fmt);
    expect(ok).toMatchObject({ tone: 'ok', icon: '✓', label: 'AI cục bộ: đã kết nối', sub: 'gemma4:12b' });
    expect(ok.detail).toBe('Kết nối tốt: Ollama ở https://pc:5173/ollama trả lời sau 42 ms, model "gemma4:12b" đã có (kiểm tra lúc 17:00:00).');
    const nm = aiLinkView(snap({ state: 'no-model', baseUrl: 'http://localhost:11434', checkedAt: at }), fmt);
    expect(nm).toMatchObject({ tone: 'warn', icon: '!', sub: 'nhận xét theo quy tắc' });
    expect(nm.detail).toContain('ollama pull gemma4:12b');
    const off = aiLinkView(snap({ state: 'offline', error: 'Ollama không trả lời trong 5 giây', checkedAt: at }), fmt);
    expect(off).toMatchObject({ tone: 'error', icon: '✕', label: 'AI cục bộ: chưa kết nối' });
    expect(off.detail).toContain('Ollama không trả lời trong 5 giây (kiểm tra lúc 17:00:00)');
    expect(off.detail).toContain('mỗi 15 giây');
    expect(aiLinkView(snap({ state: 'offline', lastConnectedAt: at })).label).toBe('AI cục bộ: mất kết nối');
  });

  it('câu dữ liệu: trong lúc đánh không gửi gì, điểm do thuật toán', () => {
    expect(AI_LINK_PRIVACY).toContain('Trong lúc đánh app không gửi gì cho AI');
    expect(AI_LINK_PRIVACY).toContain('không log MIDI');
  });
});
