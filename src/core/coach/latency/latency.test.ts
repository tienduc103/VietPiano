import { describe, expect, it } from 'vitest';
import type { LatencyCalibration } from '../types';
import { analyzeTaps, calibrationQuality, CALIBRATION_BPM, MIN_VALID_TAPS, tapStatusMessage } from './calibration';
import {
  COACH_LATENCY_KEY,
  DEFAULT_LATENCY_MS,
  deviceKeyFor,
  deviceLabel,
  effectiveLatency,
  loadLatencyStore,
  sanitizeCalibration,
  saveLatencyStore,
  withCalibration,
  withoutCalibration,
} from './store';

const BEAT = 60000 / CALIBRATION_BPM;
const clicks = Array.from({ length: 16 }, (_, k) => 10_000 + k * BEAT);
/** Lần gõ tất định: click + offset + nhiễu ±jitter (chuỗi cố định). */
const NOISE = [0.3, -0.8, 0.5, -0.1, 0.9, -0.6, 0.2, -0.4, 0.7, -0.9, 0.1, -0.2, 0.6, -0.5, 0.4, -0.7];
const taps = (offset: number, jitter = 0, skip: number[] = []) => clicks.flatMap((c, i) => (skip.includes(i) ? [] : [c + offset + NOISE[i] * jitter]));

describe('analyzeTaps — gõ theo tiếng click', () => {
  it('đều tay: độ trễ = trung vị, độ dao động nhỏ, "tốt"', () => {
    const a = analyzeTaps(clicks, taps(84, 6), BEAT);
    expect(a.status).toBe('ok');
    expect(a.offsetMs).toBeGreaterThanOrEqual(82);
    expect(a.offsetMs).toBeLessThanOrEqual(86);
    expect(a.jitterMs).toBeLessThanOrEqual(6);
    expect(calibrationQuality(a.jitterMs!)).toBe('good');
    expect(a).toMatchObject({ used: 16, missed: 0, extra: 0, outliers: 0 });
  });

  it('gõ trước tiếng click (máy rất nhanh + thói quen bắt nhịp) → số âm vẫn hợp lệ', () => {
    expect(analyzeTaps(clicks, taps(-25, 4), BEAT)).toMatchObject({ status: 'ok', offsetMs: -25 });
  });

  it('gõ đúp + lần gõ lệch xa + bỏ lỡ vài tiếng: không làm lệch kết quả', () => {
    // Bỏ lỡ tiếng 3 và 9; gõ đúp ở tiếng 5 (lần 2 muộn hơn 140 ms) và 12; tiếng 7 gõ lệch xa (+290 ms, vẫn trong cửa sổ).
    const t = [...taps(120, 5, [3, 7, 9]), clicks[7] + 290, clicks[5] + 120 + 140, clicks[12] + 120 - 3];
    const a = analyzeTaps(clicks, t, BEAT);
    expect(a.status).toBe('ok');
    expect(a.missed).toBe(2);
    expect(a.extra).toBe(2);
    expect(a.outliers).toBe(1);
    expect(Math.abs(a.offsetMs! - 120)).toBeLessThanOrEqual(3);
  });

  it('lần gõ ngoài mọi cửa sổ (lúc bắt nhịp, sau khi hết) = thừa', () => {
    const a = analyzeTaps(clicks, [clicks[0] - BEAT, ...taps(60, 3), clicks[15] + BEAT], BEAT);
    expect(a).toMatchObject({ status: 'ok', extra: 2 });
  });

  it('quá ít lần gõ → không lưu', () => {
    const a = analyzeTaps(clicks, taps(80, 3).slice(0, MIN_VALID_TAPS - 1), BEAT);
    expect(a.status).toBe('too-few');
    expect(tapStatusMessage(a)).toContain(`cần ít nhất ${MIN_VALID_TAPS}`);
    expect(analyzeTaps(clicks, [], BEAT)).toMatchObject({ status: 'too-few', offsetMs: null, used: 0, missed: 16 });
  });

  it('dao động quá nhiều → "không ổn định"', () => {
    const a = analyzeTaps(clicks, taps(80, 90), BEAT);
    expect(a.status).toBe('unstable');
    expect(tapStatusMessage(a)).toContain('dao động');
  });

  it('lệch gần nửa phách (gõ lệch phách) → không tin', () => {
    const a = analyzeTaps(clicks, taps(290, 3), BEAT);
    expect(a.status).toBe('implausible');
  });
});

describe('kho số đo độ trễ theo thiết bị', () => {
  const cal = (patch: Partial<LatencyCalibration> = {}): LatencyCalibration => ({
    deviceKey: 'midi:Roland FP-30X',
    source: 'midi',
    deviceName: 'Roland FP-30X',
    offsetMs: 96,
    jitterMs: 9,
    taps: 15,
    clicks: 16,
    bpm: 90,
    method: 'tap',
    measuredAt: 1_700_000_000_000,
    outputLatencyMs: 40,
    ...patch,
  });
  const memory = () => {
    const m = new Map<string, string>();
    return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), m };
  };

  it('khoá: mỗi đàn MIDI một số đo; bàn phím / micro chung một khoá', () => {
    expect(deviceKeyFor('midi', ' Roland FP-30X ')).toBe('midi:Roland FP-30X');
    expect(deviceKeyFor('midi')).toBe('midi:?');
    expect(deviceKeyFor('virtual', 'x')).toBe('virtual');
    expect(deviceKeyFor('microphone')).toBe('microphone');
    expect(deviceLabel('midi', 'Casio')).toBe('đàn MIDI “Casio”');
  });

  it('chưa đo → mặc định như cũ (micro 60, MIDI / bàn phím 0)', () => {
    expect(effectiveLatency('microphone', undefined, {}, null)).toEqual({ latencyMs: DEFAULT_LATENCY_MS.microphone, calibration: null, outputChanged: false });
    expect(effectiveLatency('midi', 'Roland FP-30X', {}, 40).latencyMs).toBe(0);
  });

  it('đã đo → dùng số đo của ĐÚNG đàn; độ trễ đầu ra đổi nhiều → cảnh báo', () => {
    const store = withCalibration({}, cal());
    expect(effectiveLatency('midi', 'Roland FP-30X', store, 45)).toMatchObject({ latencyMs: 96, outputChanged: false });
    expect(effectiveLatency('midi', 'Roland FP-30X', store, 210).outputChanged).toBe(true);
    expect(effectiveLatency('midi', 'Roland FP-30X', store, null).outputChanged).toBe(false);
    expect(effectiveLatency('midi', 'Yamaha P-45', store, 45).calibration).toBeNull();
    expect(withoutCalibration(store, 'midi:Roland FP-30X')).toEqual({});
  });

  it('lưu / đọc localStorage; dữ liệu hỏng bị bỏ, khoá tính lại từ nguồn + tên', () => {
    const st = memory();
    saveLatencyStore(withCalibration(withCalibration({}, cal()), cal({ deviceKey: 'virtual', source: 'virtual', deviceName: undefined, offsetMs: 35 })), st);
    expect(Object.keys(loadLatencyStore(st)).sort()).toEqual(['midi:Roland FP-30X', 'virtual']);
    st.setItem(COACH_LATENCY_KEY, JSON.stringify({ a: { ...cal(), deviceKey: 'giả', offsetMs: 12.6 }, b: { source: 'x' }, c: 'rác', d: { ...cal(), offsetMs: 99999 } }));
    const loaded = loadLatencyStore(st);
    expect(Object.keys(loaded)).toEqual(['midi:Roland FP-30X']);
    expect(loaded['midi:Roland FP-30X'].offsetMs).toBe(13);
    st.setItem(COACH_LATENCY_KEY, '{hỏng');
    expect(loadLatencyStore(st)).toEqual({});
    expect(loadLatencyStore(null)).toEqual({});
    expect(sanitizeCalibration({ ...cal(), outputLatencyMs: 'x' })?.outputLatencyMs).toBeNull();
  });

  it('giữ tối đa 30 số đo mới nhất', () => {
    const st = memory();
    let store = {};
    for (let i = 0; i < 35; i++) store = withCalibration(store, cal({ deviceKey: `midi:đàn ${i}`, deviceName: `đàn ${i}`, measuredAt: 1000 + i }));
    saveLatencyStore(store, st);
    const loaded = loadLatencyStore(st);
    expect(Object.keys(loaded)).toHaveLength(30);
    expect(loaded['midi:đàn 34']).toBeDefined();
    expect(loaded['midi:đàn 0']).toBeUndefined();
  });
});
