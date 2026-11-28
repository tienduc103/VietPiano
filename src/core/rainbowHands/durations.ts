/**
 * Trường độ cho chế độ "Trường độ" của Cầu vồng hai bàn tay: nốt tròn, trắng, đen, móc đơn, móc kép.
 * Mẫu tiết tấu gán trường độ cho từng bước của lượt (lặp lại theo vòng). Số phách lấy từ `DURATION_BEATS` dùng chung.
 */
import { DURATION_BEATS, type Duration } from '../lessons/types';

/** Năm trường độ bé tập (không dùng nốt chấm dôi ở đây). */
export type KidDuration = Extract<Duration, 'w' | 'h' | 'q' | '8' | '16'>;

export const DURATION_INFO: Record<KidDuration, { name: string; short: string; beats: number; hint: string }> = {
  w: { name: 'Nốt tròn', short: 'Tròn', beats: DURATION_BEATS.w, hint: 'giữ 4 phách — đếm 1 2 3 4' },
  h: { name: 'Nốt trắng', short: 'Trắng', beats: DURATION_BEATS.h, hint: 'giữ 2 phách — đếm 1 2' },
  q: { name: 'Nốt đen', short: 'Đen', beats: DURATION_BEATS.q, hint: '1 phách — đếm 1' },
  '8': { name: 'Nốt móc đơn', short: 'Móc đơn', beats: DURATION_BEATS['8'], hint: 'nửa phách — hai nốt một phách' },
  '16': { name: 'Nốt móc kép', short: 'Móc kép', beats: DURATION_BEATS['16'], hint: 'một phần tư phách — bốn nốt một phách' },
};

export type RhythmPatternId = 'q' | 'h' | 'w' | '8' | '16' | 'h-q-q' | 'q-8-8' | '8-16-16' | 'mix';

/** Mẫu tiết tấu: chu kỳ trường độ lặp lại theo bước (tổng mỗi chu kỳ tròn phách → dễ đếm). */
export const RHYTHM_PATTERNS: Record<RhythmPatternId, { label: string; cycle: readonly KidDuration[] }> = {
  q: { label: 'Toàn nốt đen ♩', cycle: ['q'] },
  h: { label: 'Toàn nốt trắng', cycle: ['h'] },
  w: { label: 'Toàn nốt tròn', cycle: ['w'] },
  '8': { label: 'Toàn móc đơn ♪', cycle: ['8', '8'] },
  '16': { label: 'Toàn móc kép', cycle: ['16', '16', '16', '16'] },
  'h-q-q': { label: 'Trắng – đen – đen', cycle: ['h', 'q', 'q'] },
  'q-8-8': { label: 'Đen – móc đơn – móc đơn', cycle: ['q', '8', '8'] },
  '8-16-16': { label: 'Móc đơn – móc kép – móc kép', cycle: ['8', '16', '16'] },
  mix: { label: 'Đủ 5 loại: tròn → trắng → đen → móc đơn → móc kép', cycle: ['w', 'h', 'q', 'q', '8', '8', '16', '16', '16', '16'] },
};

export const RHYTHM_PATTERN_IDS = Object.keys(RHYTHM_PATTERNS) as RhythmPatternId[];

/** Trường độ của bước thứ `index` trong lượt theo mẫu. */
export function durationAt(pattern: RhythmPatternId, index: number): KidDuration {
  const cycle = RHYTHM_PATTERNS[pattern].cycle;
  return cycle[index % cycle.length];
}

export function beatsOf(d: Duration | undefined): number {
  return d ? DURATION_BEATS[d] : 1;
}

/** Ký hiệu gọn để vẽ thẻ khuông ("C4/h"; nốt đen không ghi đuôi). */
export function cardNotation(pitch: string, d: KidDuration): string {
  return d === 'q' ? pitch : `${pitch}/${d}`;
}

/**
 * Giữ phím đủ trường độ? Cho phép nhả sớm một chút: đủ khi giữ ≥ 75% độ dài (nốt ngắn: ≥ độ dài − 120 ms, tối thiểu 40%).
 * Giữ lâu hơn (nối sang nốt sau) không bị trừ.
 */
export function holdEnough(heldMs: number, requiredMs: number): boolean {
  const need = Math.max(requiredMs * 0.4, Math.min(requiredMs * 0.75, requiredMs - 120));
  return heldMs >= need;
}
