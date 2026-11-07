/**
 * Vị trí trong bài: số ô nhịp như in trên bản nhạc ↔ chỉ số ô ↔ phách ↔ chỉ số nốt.
 * Số in: bài có ô lấy đà thì ô lấy đà là 0 (không đánh số), ô đầy đủ đầu tiên là 1; bài không lấy đà bắt đầu từ 1.
 * Chỉ số ô (từ 0) gồm cả ô lấy đà — cùng quy ước với `Lesson.pedal`.
 */
import { splitMeasures } from './notation';
import { DURATION_BEATS, measureLength, type Lesson } from './types';

type Shape = Pick<Lesson, 'notes' | 'timeSignature' | 'pickup'>;

const EPS = 1e-9;

/** Số in của ô có chỉ số `index`. */
export function printedMeasure(lesson: Pick<Lesson, 'pickup'>, index: number): number {
  return lesson.pickup ? index : index + 1;
}

/** Chỉ số ô (từ 0) của ô có số in `printed`. */
export function measureIndexOf(lesson: Pick<Lesson, 'pickup'>, printed: number): number {
  return lesson.pickup ? printed : printed - 1;
}

/** Phách (nốt đen, từ đầu bài) bắt đầu từng ô nhịp, thêm một phần tử cuối = hết bài. */
export function measureStarts(lesson: Shape): number[] {
  const measures = splitMeasures(lesson.notes, measureLength(lesson.timeSignature), lesson.pickup);
  const starts: number[] = [];
  let beat = 0;
  for (const m of measures) {
    starts.push(beat);
    beat += m.beats;
  }
  starts.push(beat);
  return starts;
}

/** Phách bắt đầu của từng nốt giai điệu. */
export function noteStarts(lesson: Pick<Lesson, 'notes'>): number[] {
  const out: number[] = [];
  let beat = 0;
  for (const n of lesson.notes) {
    out.push(beat);
    beat += DURATION_BEATS[n.duration];
  }
  return out;
}

/** Chỉ số ô (từ 0) chứa phách `beat`. */
export function measureIndexAtBeat(starts: readonly number[], beat: number): number {
  let i = 0;
  while (i + 2 < starts.length && starts[i + 1] <= beat + EPS) i++;
  return i;
}

/**
 * Chỉ số nốt giai điệu bắt đầu ở ô số in `measure`, lệch `beat` phách (nốt đen) từ đầu ô.
 * Không có nốt nào bắt đầu đúng chỗ đó → lỗi (dữ liệu bài viết sai vị trí).
 */
export function noteIndexAt(lesson: Shape, measure: number, beat = 0): number {
  const starts = measureStarts(lesson);
  const mi = measureIndexOf(lesson, measure);
  if (mi < 0 || mi >= starts.length - 1) throw new Error(`Bài không có ô nhịp ${measure}`);
  const target = starts[mi] + beat;
  const idx = noteStarts(lesson).findIndex((s) => Math.abs(s - target) < EPS);
  if (idx < 0) throw new Error(`Không có nốt nào bắt đầu ở ô ${measure}, phách +${beat}`);
  return idx;
}
