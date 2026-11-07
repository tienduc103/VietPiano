/**
 * Tổng kết Chờ nốt / Đếm nốt theo TỪNG TAY và từng Ô NHỊP (màn Luyện tập), suy từ trạng thái PracticeEngine trước / sau
 * mỗi lần bấm phím — không đổi logic Wait Mode. Wait Mode không có đồng hồ nhịp nên không có điểm tiết tấu.
 *  - Phím đúng: thuộc tay trái nếu là nốt tay trái còn thiếu của bước, còn lại là tay phải (giai điệu / hoà âm).
 *  - Phím sai: tập một tay → tay đó; tập hai tay → đoán theo vùng phím (thấp hơn điểm giữa hai tay → tay trái).
 *  - Ô nhịp: lỗi (phím sai + nốt bỏ qua) tính vào ô của bước đang chờ.
 */
import { measureIndexAtBeat, measureStarts, printedMeasure } from '../lessons/positions';
import { chordMidis, type Hand, type Lesson } from '../lessons/types';
import type { PracticeTrack } from './handPractice';
import type { NoteResult, PracticeState } from './PracticeEngine';

export interface HandTally {
  correct: number;
  wrong: number;
}

/** Điểm chia hai tay theo vùng phím: giữa nốt cao nhất tay trái và nốt thấp nhất tay phải. */
export function handSplitMidi(lesson: Pick<Lesson, 'notes' | 'accompaniment'>): number | null {
  const left = (lesson.accompaniment ?? []).flatMap((c) => c.midis);
  const right = lesson.notes.filter((n) => !n.rest).flatMap(chordMidis);
  if (!left.length || !right.length) return null;
  return (Math.max(...left) + Math.min(...right)) / 2;
}

/** Số ô in của từng bước trong dòng tập. */
export function stepMeasures(lesson: Lesson, track: Pick<PracticeTrack, 'steps'>): number[] {
  const starts = measureStarts(lesson);
  return track.steps.map((s) => printedMeasure(lesson, measureIndexAtBeat(starts, s.startBeat)));
}

export class WaitTally {
  private hands: Record<Hand, HandTally> = { right: { correct: 0, wrong: 0 }, left: { correct: 0, wrong: 0 } };
  /** Số lần bấm sai ở từng bước. */
  private stepWrong: number[] = [];
  private readonly split: number | null;

  constructor(
    lesson: Lesson,
    private readonly hand: PracticeTrack['hand'],
    /** Nốt tay trái của từng bước (tập hai tay) — để biết phím phụ đúng là của tay nào. */
    private readonly leftOfStep: readonly (readonly number[])[] | undefined,
  ) {
    this.split = handSplitMidi(lesson);
  }

  reset(): void {
    this.hands = { right: { correct: 0, wrong: 0 }, left: { correct: 0, wrong: 0 } };
    this.stepWrong = [];
  }

  private handOf(midi: number, correct: boolean, before: PracticeState): Hand {
    if (this.hand !== 'both') return this.hand;
    if (correct) return this.leftOfStep?.[before.index]?.includes(midi) && before.pendingLeft.includes(midi) ? 'left' : 'right';
    return this.split !== null && midi < this.split ? 'left' : 'right';
  }

  /** Gọi sau `engine.handleNote(midi)` với trạng thái ngay trước và ngay sau. */
  record(before: PracticeState, after: PracticeState, midi: number): void {
    if (after === before || before.status === 'finished') return;
    if (after.startedAt === null) return;
    const wrong = after.wrong > before.wrong;
    const accepted = wrong || after.index !== before.index || after.status === 'finished' || after.pendingLeft.length !== before.pendingLeft.length || after.melodyDone !== before.melodyDone;
    if (!accepted) return;
    const hand = this.handOf(midi, !wrong, before);
    this.hands[hand][wrong ? 'wrong' : 'correct']++;
    if (wrong) this.stepWrong[before.index] = (this.stepWrong[before.index] ?? 0) + 1;
  }

  handTallies(): Record<Hand, HandTally> {
    return { right: { ...this.hands.right }, left: { ...this.hands.left } };
  }

  wrongPerStep(): number[] {
    return [...this.stepWrong];
  }
}

/** Lỗi theo ô (số ô in → số lỗi): phím sai ở bước + bước bị bỏ qua. */
export function measureErrorsFrom(stepWrong: readonly number[], results: readonly NoteResult[], measures: readonly number[]): Record<number, number> {
  const out: Record<number, number> = {};
  measures.forEach((m, i) => {
    const n = (stepWrong[i] ?? 0) + (results[i] === 'skipped' ? 1 : 0);
    if (n > 0) out[m] = (out[m] ?? 0) + n;
  });
  return out;
}

/** Độ chính xác một tay (null = tay đó không bấm phím nào). */
export function handAccuracy(t: HandTally): number | null {
  const n = t.correct + t.wrong;
  return n ? t.correct / n : null;
}

/** Gộp lỗi theo ô của nhiều phiên (lịch sử) → các ô hay sai, nhiều lỗi trước. */
export function frequentMistakes(lists: readonly (Readonly<Record<string, number>> | undefined)[], limit = 3): { measure: number; total: number }[] {
  const sum = new Map<number, number>();
  for (const l of lists) for (const [m, n] of Object.entries(l ?? {})) sum.set(Number(m), (sum.get(Number(m)) ?? 0) + n);
  return [...sum.entries()]
    .filter(([, n]) => n > 0)
    .map(([measure, total]) => ({ measure, total }))
    .sort((a, b) => b.total - a.total || a.measure - b.measure)
    .slice(0, limit);
}
