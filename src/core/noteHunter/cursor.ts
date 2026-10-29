/**
 * Vị trí con trỏ phát trên khuông nhạc một dòng của trò Săn nốt: nội suy tuyến tính giữa tâm các nốt theo phách,
 * để con trỏ chạy liên tục (đồng bộ với đồng hồ bài nhạc) thay vì nhảy từng nốt.
 */
import type { HunterNote } from './songs';

/** Chỉ số nốt đang vang ở `beat` (-1 trước nốt đầu / khi đếm vào, nốt cuối khi đã hết bài). */
export function noteIndexAt(notes: readonly Pick<HunterNote, 'startBeat' | 'durationBeats'>[], beat: number): number {
  if (notes.length === 0 || beat < notes[0].startBeat) return -1;
  let lo = 0;
  let hi = notes.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (notes[mid].startBeat <= beat + 1e-9) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

/**
 * Toạ độ x (đơn vị SVG chưa scale) của con trỏ ở `beat`.
 * Đếm vào (beat < 0): đứng trước nốt đầu `leadInWidth`, tiến dần tới nốt đầu. Nốt cuối: tiến tới `endX`.
 */
export function cursorX(
  notes: readonly Pick<HunterNote, 'startBeat' | 'durationBeats'>[],
  centers: readonly number[],
  beat: number,
  opts: { endX: number; leadInBeats: number; leadInWidth?: number },
): number {
  if (notes.length === 0 || centers.length === 0) return 0;
  const i = noteIndexAt(notes, beat);
  if (i < 0) {
    const w = opts.leadInWidth ?? 24;
    const frac = opts.leadInBeats > 0 ? Math.max(0, 1 + (beat - notes[0].startBeat) / opts.leadInBeats) : 1;
    return centers[0] - w * (1 - frac);
  }
  const n = notes[i];
  const next = i + 1 < centers.length ? centers[i + 1] : opts.endX;
  const frac = n.durationBeats > 0 ? Math.min(1, Math.max(0, (beat - n.startBeat) / n.durationBeats)) : 0;
  return centers[i] + (next - centers[i]) * frac;
}
