/**
 * Số đo độ trễ theo THIẾT BỊ trên máy này (M1-T7): localStorage riêng của Coach, không gửi đi đâu.
 * Khoá thiết bị: `midi:<tên đàn>` (mỗi đàn một số đo), `virtual` (bàn phím màn hình / máy tính), `microphone`.
 * Loa / tai nghe không nhận biết được trực tiếp → lưu độ trễ đầu ra trình duyệt báo lúc đo để cảnh báo khi có vẻ đã đổi.
 */
import type { InputSource } from '../../input/NoteInputProvider';
import type { LatencyCalibration } from '../types';
import { CALIBRATION_BPM } from './calibration';

export const COACH_LATENCY_KEY = 'vietpiano.coach.latency.v1';
/** Chưa đo → như các màn khác của app: micro 60 ms, đàn MIDI / bàn phím 0. */
export const DEFAULT_LATENCY_MS: Record<InputSource, number> = { midi: 0, virtual: 0, microphone: 60 };
/** Độ trễ đầu ra trình duyệt báo lệch hơn mức này so với lúc đo → có thể đã đổi loa / tai nghe. */
export const OUTPUT_CHANGE_MS = 30;
const MAX_NAME = 100;
const MAX_ENTRIES = 30;
const SOURCES: readonly InputSource[] = ['midi', 'virtual', 'microphone'];

type StoreRead = Pick<Storage, 'getItem'> | null;
type StoreWrite = Pick<Storage, 'setItem'> | null;
const defaultStorage = (): Storage | null => (typeof localStorage === 'undefined' ? null : localStorage);

export type LatencyStore = Record<string, LatencyCalibration>;

export function deviceKeyFor(source: InputSource, deviceName?: string): string {
  return source === 'midi' ? `midi:${(deviceName ?? '').trim().slice(0, MAX_NAME) || '?'}` : source;
}

export function deviceLabel(source: InputSource, deviceName?: string): string {
  if (source === 'midi') return deviceName ? `đàn MIDI “${deviceName}”` : 'đàn MIDI';
  return source === 'microphone' ? 'micro' : 'bàn phím màn hình / máy tính';
}

const num = (v: unknown, lo: number, hi: number): number | null => (typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi ? v : null);

/** Kiểm tra một số đo đọc từ bộ nhớ (dữ liệu có thể hỏng / bị sửa tay). */
export function sanitizeCalibration(raw: unknown): LatencyCalibration | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const source = SOURCES.find((s) => s === r.source);
  const offsetMs = num(r.offsetMs, -500, 1000);
  const jitterMs = num(r.jitterMs, 0, 500);
  const taps = num(r.taps, 0, 1000);
  const clicks = num(r.clicks, 0, 1000);
  const measuredAt = num(r.measuredAt, 0, 8.64e15);
  if (!source || offsetMs === null || jitterMs === null || taps === null || clicks === null || measuredAt === null) return null;
  const deviceName = typeof r.deviceName === 'string' && r.deviceName.trim() ? r.deviceName.trim().slice(0, MAX_NAME) : undefined;
  return {
    deviceKey: deviceKeyFor(source, deviceName),
    source,
    ...(deviceName ? { deviceName } : {}),
    offsetMs: Math.round(offsetMs),
    jitterMs: Math.round(jitterMs),
    taps: Math.round(taps),
    clicks: Math.round(clicks),
    bpm: num(r.bpm, 20, 400) ?? CALIBRATION_BPM,
    method: 'tap',
    measuredAt: Math.round(measuredAt),
    outputLatencyMs: num(r.outputLatencyMs, 0, 2000),
  };
}

export function loadLatencyStore(storage: StoreRead = defaultStorage()): LatencyStore {
  try {
    const raw = storage?.getItem(COACH_LATENCY_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : null;
    if (!parsed || typeof parsed !== 'object') return {};
    const out: LatencyStore = {};
    for (const v of Object.values(parsed as Record<string, unknown>)) {
      const c = sanitizeCalibration(v);
      if (c) out[c.deviceKey] = c;
    }
    return out;
  } catch {
    return {};
  }
}

export function saveLatencyStore(store: LatencyStore, storage: StoreWrite = defaultStorage()): void {
  try {
    // Giữ tối đa MAX_ENTRIES số đo mới nhất.
    const kept = Object.values(store)
      .sort((a, b) => b.measuredAt - a.measuredAt)
      .slice(0, MAX_ENTRIES);
    storage?.setItem(COACH_LATENCY_KEY, JSON.stringify(Object.fromEntries(kept.map((c) => [c.deviceKey, c]))));
  } catch {
    // bộ nhớ đầy / bị chặn: số đo chỉ dùng trong phiên
  }
}

export function withCalibration(store: LatencyStore, cal: LatencyCalibration): LatencyStore {
  return { ...store, [cal.deviceKey]: cal };
}

export function withoutCalibration(store: LatencyStore, deviceKey: string): LatencyStore {
  const next = { ...store };
  delete next[deviceKey];
  return next;
}

export interface EffectiveLatency {
  latencyMs: number;
  calibration: LatencyCalibration | null;
  /** Độ trễ đầu ra hiện tại lệch nhiều so với lúc đo (chỉ biết khi trình duyệt báo cả hai). */
  outputChanged: boolean;
}

/** Độ trễ dùng khi ghi: số đo của thiết bị nếu có, không thì mặc định. */
export function effectiveLatency(source: InputSource, deviceName: string | undefined, store: LatencyStore, currentOutputLatencyMs: number | null): EffectiveLatency {
  const calibration = store[deviceKeyFor(source, deviceName)] ?? null;
  if (!calibration) return { latencyMs: DEFAULT_LATENCY_MS[source], calibration: null, outputChanged: false };
  const outputChanged = calibration.outputLatencyMs !== null && currentOutputLatencyMs !== null && Math.abs(currentOutputLatencyMs - calibration.outputLatencyMs) > OUTPUT_CHANGE_MS;
  return { latencyMs: calibration.offsetMs, calibration, outputChanged };
}
