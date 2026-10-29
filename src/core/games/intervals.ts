/**
 * Quãng cho trò "Thám tử quãng": tên quãng tiếng Việt theo số nửa cung + sinh các lượt (nốt gốc, quãng, hướng).
 * Chấm bằng `KeyHuntGame` (mỗi lượt một phím đích, có giới hạn thời gian).
 */
import type { Random } from './random';

export type IntervalDirection = 'up' | 'down';

/** Tên quãng theo số nửa cung (1–12). 6 nửa cung gọi là "quãng 4 tăng". */
export const INTERVAL_NAMES: Record<number, string> = {
  1: 'quãng 2 thứ',
  2: 'quãng 2 trưởng',
  3: 'quãng 3 thứ',
  4: 'quãng 3 trưởng',
  5: 'quãng 4 đúng',
  6: 'quãng 4 tăng',
  7: 'quãng 5 đúng',
  8: 'quãng 6 thứ',
  9: 'quãng 6 trưởng',
  10: 'quãng 7 thứ',
  11: 'quãng 7 trưởng',
  12: 'quãng 8 đúng',
};

export function intervalName(semitones: number): string {
  const name = INTERVAL_NAMES[semitones];
  if (!name) throw new Error(`Không có tên quãng cho ${semitones} nửa cung`);
  return name;
}

export interface IntervalRound {
  root: number;
  semitones: number;
  direction: IntervalDirection;
  target: number;
}

const isWhite = (m: number) => ![1, 3, 6, 8, 10].includes(((m % 12) + 12) % 12);

/**
 * `count` lượt: quãng + hướng ngẫu nhiên trong danh sách; nốt gốc là phím trắng sao cho nốt đích nằm trong
 * `[from, to]`. Không lặp cùng (gốc, quãng, hướng) liền nhau.
 */
export function makeIntervalRounds(
  opts: { from: number; to: number; intervals: readonly number[]; directions: readonly IntervalDirection[] },
  count: number,
  random: Random = Math.random,
): IntervalRound[] {
  const { from, to, intervals, directions } = opts;
  const options: IntervalRound[] = [];
  for (const semitones of intervals)
    for (const direction of directions)
      for (let root = from; root <= to; root++) {
        const target = root + (direction === 'up' ? semitones : -semitones);
        if (isWhite(root) && target >= from && target <= to) options.push({ root, semitones, direction, target });
      }
  if (options.length === 0) throw new Error('Không có lượt quãng nào vừa bàn phím');
  const out: IntervalRound[] = [];
  const pick = () => options[Math.floor(random() * options.length)];
  while (out.length < count) {
    // Chọn quãng trước (đều giữa các quãng) rồi mới chọn nốt gốc — quãng nhỏ có nhiều nốt gốc hơn nhưng không áp đảo.
    const semitones = intervals[Math.floor(random() * intervals.length)];
    const pool = options.filter((o) => o.semitones === semitones);
    const r = pool.length > 0 ? pool[Math.floor(random() * pool.length)] : pick();
    const prev = out[out.length - 1];
    if (options.length > 1 && prev && prev.root === r.root && prev.semitones === r.semitones && prev.direction === r.direction) continue;
    out.push(r);
  }
  return out;
}
