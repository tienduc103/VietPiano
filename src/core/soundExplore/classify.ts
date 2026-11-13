/**
 * Bộ máy quy tắc: phân loại cao / thấp, lên / xuống, ngắn / dài. CHỈ dựa vào số nốt MIDI và thời gian giữ phím —
 * lực gõ (velocity) / độ to không bao giờ tham gia phân loại cao độ ("cao" ≠ "to").
 */
import { PITCH_SPAN, type SoundExploreSettings } from './config';

export type Register = 'low' | 'middle' | 'high';
export type Direction = 'up' | 'down' | 'same';
/** `tooQuick`: chạm vội / nảy phím (< shortMinMs) — bỏ qua; `unclear`: vùng giữa → mời thử lại, không báo sai. */
export type DurationClass = 'short' | 'long' | 'unclear' | 'tooQuick';

export type Thresholds = Pick<SoundExploreSettings, 'shortMinMs' | 'shortMaxMs' | 'longMinMs' | 'lowMax' | 'highMin'>;

export function classifyRegister(midi: number, t: Pick<Thresholds, 'lowMax' | 'highMin'>): Register {
  if (midi <= t.lowMax) return 'low';
  if (midi >= t.highMin) return 'high';
  return 'middle';
}

/** Hướng của nốt `next` so với nốt liền trước — so sánh tương đối, không phụ thuộc vùng. */
export function classifyDirection(prev: number, next: number): Direction {
  return next > prev ? 'up' : next < prev ? 'down' : 'same';
}

export function classifyDuration(ms: number, t: Pick<Thresholds, 'shortMinMs' | 'shortMaxMs' | 'longMinMs'>): DurationClass {
  if (!Number.isFinite(ms) || ms < t.shortMinMs) return 'tooQuick';
  if (ms <= t.shortMaxMs) return 'short';
  if (ms >= t.longMinMs) return 'long';
  return 'unclear';
}

/** Cao độ → độ cao 0 (đáy) … 1 (đỉnh), tuyến tính theo nửa cung, kẹp trong `PITCH_SPAN`. */
export function pitchHeight(midi: number, span: { min: number; max: number } = PITCH_SPAN): number {
  const v = (midi - span.min) / (span.max - span.min);
  return Math.min(1, Math.max(0, v));
}

/**
 * Nội suy chuyển động mượt, không phụ thuộc tốc độ khung hình: tiến về đích theo hằng thời gian `tauMs`,
 * mỗi khung đi không quá `maxStep` (chống giật khi nốt nhảy xa). `dtMs` lớn (tab ẩn) bị kẹp.
 */
export function approach(current: number, target: number, dtMs: number, tauMs = 120, maxStep = 0.08): number {
  const dt = Math.min(100, Math.max(0, dtMs));
  const k = 1 - Math.exp(-dt / tauMs);
  const delta = (target - current) * k;
  const step = Math.max(-maxStep, Math.min(maxStep, delta));
  const next = current + step;
  return Math.abs(target - next) < 1e-4 ? target : next;
}

/** Màu theo cao độ (vòng màu theo nốt trong quãng tám, sáng hơn khi cao) — chỉ trang trí, không mang thông tin bắt buộc. */
export function pitchColor(midi: number): string {
  const hue = Math.round(((midi % 12) / 12) * 300);
  const light = Math.round(45 + pitchHeight(midi) * 20);
  return `hsl(${hue} 85% ${light}%)`;
}
