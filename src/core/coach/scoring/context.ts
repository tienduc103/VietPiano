/**
 * Ngữ cảnh dùng chung của các bộ phân tích tiêu chí (nốt → nhịp → trường độ → pedal → sắc thái).
 * Mỗi bộ phân tích trả về giá trị tiêu chí (0..1 hoặc null) + issue kèm `criterionDeduction` (phần giá trị bị mất),
 * sao cho 1 − Σ khấu trừ = giá trị → mọi điểm truy được về lỗi cụ thể.
 */
import { midiToName } from '../../music/notes';
import { measureAtBeat } from '../reference/fromLesson';
import type { BuiltPerformance, CoachMode, InputCapabilities, RefNote, ScoreReference, ScoringIssue, SubScore } from '../types';
import { mapAtMs, type AlignedNotes } from './align';
import type { ModeParams } from './modes';

export type IssueDraft = Omit<ScoringIssue, 'id' | 'deduction'>;

export interface CriterionOutcome {
  value: number | null;
  subScores: SubScore[];
  issues: IssueDraft[];
  reason?: string;
}

export type RefStatus = 'correct' | 'octave' | 'wrong' | 'missing' | 'order';

export interface AnalysisContext {
  ref: ScoreReference;
  perf: BuiltPerformance;
  aligned: AlignedNotes;
  mode: CoachMode;
  params: ModeParams;
  capabilities: InputCapabilities;
  /** Theo từng nốt bản nhạc (điền bởi analyzeNotes). */
  status: RefStatus[];
  /** Nốt biểu diễn ghép với từng nốt bản nhạc (null = thiếu). */
  perfOf: (number | null)[];
  /** Thời điểm kỳ vọng của từng nhóm theo tempo cục bộ của người chơi (điền bởi analyzeRhythm); null = không đo. */
  expectedGroupMs: (number | null)[];
  /** Độ lệch thời điểm từng nhóm (ms). */
  groupDeviation: (number | null)[];
  /** Độ dài phách ước lượng của cả bài (ms). */
  msPerBeat: number;
}

export function createContext(
  ref: ScoreReference,
  perf: BuiltPerformance,
  aligned: AlignedNotes,
  mode: CoachMode,
  params: ModeParams,
  capabilities: InputCapabilities,
): AnalysisContext {
  return {
    ref,
    perf,
    aligned,
    mode,
    params,
    capabilities,
    status: ref.notes.map((_, i) => (aligned.pairs.has(i) ? 'correct' : 'missing')),
    perfOf: ref.notes.map((_, i) => aligned.pairs.get(i)?.perf ?? null),
    expectedGroupMs: ref.groups.map(() => null),
    groupDeviation: ref.groups.map(() => null),
    msPerBeat: aligned.targetMsPerBeat,
  };
}

/** "2", "2,5" (dấu phẩy thập phân). */
export function formatNumber(x: number, digits = 1): string {
  const s = Number.isInteger(x) ? String(x) : x.toFixed(digits).replace(/0+$/, '').replace(/\.$/, '');
  return s.replace('.', ',');
}

/** Số phách trong ô theo đơn vị của số chỉ nhịp (x/4 → nốt đen, x/8 → móc đơn), đếm từ 1. */
export function beatNumber(ref: Pick<ScoreReference, 'timeSignature'>, beatInMeasure: number): number {
  const unit = 4 / ref.timeSignature[1];
  return 1 + beatInMeasure / unit;
}

export function measureLabel(measure: number | null): string {
  if (measure === null) return 'Cả bài';
  return measure === 0 ? 'Ô lấy đà' : `Ô ${measure}`;
}

/** "Ô 6, phách 2". */
export function notePosition(ref: ScoreReference, n: Pick<RefNote, 'measure' | 'beatInMeasure'>): string {
  return `${measureLabel(n.measure)}, phách ${formatNumber(beatNumber(ref, n.beatInMeasure), 2)}`;
}

/** Số ô in ứng với thời điểm biểu diễn (nốt thừa / nốt chơi lại — theo bản đồ tempo của lượt chứa nó), kẹp trong bài. */
export function measureAtMs(ctx: AnalysisContext, ms: number): { measure: number; beat: number } {
  const beat = Math.min(ctx.ref.totalBeats - 1e-6, Math.max(0, mapAtMs(ctx.aligned, ms).beatAt(ms)));
  return { measure: measureAtBeat(ctx.ref, beat), beat };
}

export const noteName = (midi: number) => midiToName(midi);

export function handLabel(hand: string | undefined): string {
  return hand === 'left' ? 'tay trái' : hand === 'right' ? 'tay phải' : '';
}

/** Gộp điểm con có trọng số; điểm con null bị bỏ, trọng số chia lại. Trả về null khi không có điểm con nào đo được. */
export function combineSubScores(subs: readonly SubScore[]): { value: number | null; share: Map<string, number> } {
  const measured = subs.filter((s) => s.value !== null && s.weight > 0);
  const total = measured.reduce((a, s) => a + s.weight, 0);
  const share = new Map<string, number>();
  if (total === 0) return { value: null, share };
  for (const s of measured) share.set(s.key, s.weight / total);
  return { value: measured.reduce((a, s) => a + (s.weight / total) * (s.value as number), 0), share };
}

export const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
export const mean = (xs: readonly number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);
export function std(xs: readonly number[]): number {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return Math.sqrt(xs.reduce((a, x) => a + (x - m) ** 2, 0) / (xs.length - 1));
}
