/**
 * Chế độ Biểu diễn ở màn Luyện tập (bài Thư viện): đồng hồ nhịp CỐ ĐỊNH, chơi một mạch từ đầu tới cuối, sai không dừng
 * (PerformanceTracker). File này:
 *  - `performancePlan`: danh sách nốt cần chấm theo tay đang tập + nguồn vào (micro chỉ chấm được nốt đơn:
 *    hai tay → chỉ giai điệu; tay trái → chỉ nốt đệm đơn). Mỗi nốt ghi tay, loại (giai điệu / hoà âm / tay trái),
 *    chỉ số nốt trên khuông và số ô nhịp in — để tô khuông, chấm từng tay, tìm ô hay sai.
 *  - `performanceBreakdown`: tổng kết. Điểm tổng dùng ĐÚNG rubric Biểu diễn của giáo trình (`scoring.ts`: đúng nốt 45 +
 *    đúng nhịp 30 + trường độ 15 + hoàn thành 10, + mạnh nhẹ 15 / pedal 15 khi bài có; tiêu chí không đo được chia lại
 *    trọng số). Thêm: điểm từng tay, độ đồng bộ hai tay (chỉ khi chấm cả hai tay), ô nhịp nhiều lỗi.
 *  Không suy đoán ngón tay — app không có cảm biến ngón.
 */
import { lessonTimeline } from '../curriculum/piece';
import { DYNAMICS_WEIGHT, PEDAL_WEIGHT, PERFORMANCE_WEIGHTS, weightedScore, type Criterion } from '../curriculum/scoring';
import { measureIndexAtBeat, measureStarts, printedMeasure } from '../lessons/positions';
import { DURATION_BEATS, type Hand, type Lesson } from '../lessons/types';
import type { PracticeHand } from './handPractice';
import type { NoteResult } from './PracticeEngine';
import { timingQuality, type PerformanceResult, type PerformanceState, type TimedNote } from './PerformanceTracker';

export interface PerformNote extends TimedNote {
  midi: number;
  pitch: string;
  hand: Hand;
  kind: 'melody' | 'harmony' | 'left';
  /** Chỉ số nốt trên khuông: `lesson.notes` (giai điệu, hoà âm) hoặc `lesson.accompaniment` (tay trái). */
  scoreIndex: number;
  /** Số ô nhịp in trên bản nhạc (ô lấy đà = 0). */
  measure: number;
}

/** Hai tay cùng phách lệch nhau tối đa bấy nhiêu ms vẫn tính là đồng bộ. */
export const SYNC_MS = 80;

/** Danh sách nốt cần chấm, xếp theo phách (cùng phách: tay trái trước, thấp → cao). Bài phải có ít nhất một nốt. */
export function performancePlan(lesson: Lesson, hand: PracticeHand, singleNotesOnly: boolean): PerformNote[] {
  const starts = measureStarts(lesson);
  const measureOf = (beat: number) => printedMeasure(lesson, measureIndexAtBeat(starts, beat));
  const timeline = lessonTimeline(lesson);
  const dynamicAtBeat = (beat: number) => timeline.filter((n) => n.startBeat <= beat + 1e-9).pop()?.dynamic;
  const out: PerformNote[] = [];
  if (hand !== 'left') {
    timeline.forEach((t, i) => {
      const n = lesson.notes[i];
      if (t.midiNote === null) return;
      const base = { startBeat: t.startBeat, durationBeats: t.durationBeats, hand: t.hand, scoreIndex: i, measure: measureOf(t.startBeat), ...(t.dynamic ? { dynamic: t.dynamic } : {}) };
      out.push({ ...base, midi: t.midiNote, pitch: n.pitch, kind: 'melody' });
      if (!singleNotesOnly) for (const h of n.harmony ?? []) out.push({ ...base, midi: h.midi, pitch: h.pitch, kind: 'harmony' });
    });
  }
  if (hand === 'left' || (hand === 'both' && !singleNotesOnly)) {
    let beat = 0;
    (lesson.accompaniment ?? []).forEach((c, i) => {
      const durationBeats = DURATION_BEATS[c.duration];
      if (c.midis.length > 0 && !(singleNotesOnly && c.midis.length > 1)) {
        const dynamic = dynamicAtBeat(beat);
        c.midis.forEach((midi, k) =>
          out.push({ startBeat: beat, durationBeats, midi, pitch: c.pitches[k], hand: 'left', kind: 'left', scoreIndex: i, measure: measureOf(beat), ...(dynamic ? { dynamic } : {}) }),
        );
      }
      beat += durationBeats;
    });
  }
  const order = { left: 0, harmony: 1, melody: 2 };
  return out.sort((a, b) => a.startBeat - b.startBeat || order[a.kind] - order[b.kind] || a.midi - b.midi);
}

/** Kết quả trên khuông: nốt / chùm nốt (giai điệu + hoà âm, hoặc hợp âm đệm) = kết quả xấu nhất của các phím trong chùm. */
export function planResultsOnScore(plan: readonly PerformNote[], results: readonly NoteResult[], staff: 'melody' | 'accompaniment', size: number): NoteResult[] {
  const rank: Record<NoteResult, number> = { pending: 0, correct: 1, corrected: 2, skipped: 3, wrong: 4 };
  const out: NoteResult[] = Array.from({ length: size }, () => 'pending');
  const seen = new Map<number, NoteResult[]>();
  plan.forEach((n, i) => {
    if ((staff === 'melody') === (n.kind === 'left')) return;
    seen.set(n.scoreIndex, [...(seen.get(n.scoreIndex) ?? []), results[i]]);
  });
  for (const [k, rs] of seen) {
    // Còn phím chưa tới lượt → chưa tô; đã chấm hết → kết quả xấu nhất.
    out[k] = rs.includes('pending') ? 'pending' : rs.reduce((a, b) => (rank[b] > rank[a] ? b : a), 'correct' as NoteResult);
  }
  return out;
}

export interface HandBreakdown {
  notes: number;
  correct: number;
  wrong: number;
  missed: number;
  /** Đúng cao độ / số nốt của tay (nốt lỡ tính là sai). */
  pitchAccuracy: number;
  /** 0..1 điểm thời điểm trung bình (nốt lỡ = 0). */
  timing: number;
}

export interface MeasureErrors {
  /** Số ô in trên bản nhạc. */
  measure: number;
  wrong: number;
  missed: number;
  /** Nốt có đánh nhưng lệch nhịp quá `onTimeMs`. */
  offBeat: number;
  total: number;
}

export interface PerformBreakdown {
  /** 0–100 theo rubric Biểu diễn. */
  score: number;
  criteria: Criterion[];
  hands: Partial<Record<Hand, HandBreakdown>>;
  /** Tỉ lệ chỗ hai tay cùng phách đánh lệch nhau ≤ SYNC_MS; null = không chấm cả hai tay / không có chỗ nào đo được. */
  sync: number | null;
  /** Ô có lỗi, nhiều lỗi trước. */
  measures: MeasureErrors[];
}

export function performanceBreakdown(plan: readonly PerformNote[], state: PerformanceState, result: PerformanceResult, onTimeMs: number, windowMs: number): PerformBreakdown {
  const criteria: Criterion[] = [
    { key: 'pitch', label: 'Đúng nốt', value: result.pitchAccuracy, weight: PERFORMANCE_WEIGHTS.pitch },
    { key: 'timing', label: 'Đúng nhịp', value: result.timing, weight: PERFORMANCE_WEIGHTS.timing },
    { key: 'duration', label: 'Đúng trường độ', value: result.duration, weight: PERFORMANCE_WEIGHTS.duration },
    { key: 'completion', label: 'Hoàn thành bài', value: result.completion, weight: PERFORMANCE_WEIGHTS.completion },
    ...(result.dynamics !== undefined ? [{ key: 'dynamics' as const, label: 'Mạnh – nhẹ', value: result.dynamics, weight: DYNAMICS_WEIGHT }] : []),
    ...(result.pedal !== undefined ? [{ key: 'pedal' as const, label: 'Pedal', value: result.pedal, weight: PEDAL_WEIGHT }] : []),
  ];

  const hands: Partial<Record<Hand, HandBreakdown>> = {};
  for (const hand of ['right', 'left'] as const) {
    const idx = plan.map((n, i) => (n.hand === hand ? i : -1)).filter((i) => i >= 0);
    if (!idx.length) continue;
    let correct = 0;
    let wrong = 0;
    let timingSum = 0;
    for (const i of idx) {
      const r = state.results[i];
      if (r === 'correct') correct++;
      else if (r === 'wrong') wrong++;
      const off = state.offsetsMs[i];
      if (off !== null && (r === 'correct' || r === 'wrong')) timingSum += timingQuality(off, onTimeMs, windowMs);
    }
    hands[hand] = { notes: idx.length, correct, wrong, missed: idx.length - correct - wrong, pitchAccuracy: correct / idx.length, timing: timingSum / idx.length };
  }

  // Đồng bộ hai tay: mỗi phách có nốt của cả hai tay và cả hai tay đều đã đánh → lệch trung bình giữa hai tay.
  let syncTotal = 0;
  let synced = 0;
  if (hands.right && hands.left) {
    const byBeat = new Map<number, { right: number[]; left: number[] }>();
    plan.forEach((n, i) => {
      const off = state.offsetsMs[i];
      const r = state.results[i];
      const g = byBeat.get(n.startBeat) ?? { right: [], left: [] };
      if (off !== null && (r === 'correct' || r === 'wrong')) g[n.hand].push(off);
      else g[n.hand].push(NaN);
      byBeat.set(n.startBeat, g);
    });
    for (const g of byBeat.values()) {
      const r = g.right.filter((x) => !Number.isNaN(x));
      const l = g.left.filter((x) => !Number.isNaN(x));
      if (!g.right.length || !g.left.length || !r.length || !l.length) continue;
      syncTotal++;
      const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
      if (Math.abs(mean(r) - mean(l)) <= SYNC_MS) synced++;
    }
  }

  const byMeasure = new Map<number, MeasureErrors>();
  plan.forEach((n, i) => {
    const r = state.results[i];
    const off = state.offsetsMs[i];
    const e = byMeasure.get(n.measure) ?? { measure: n.measure, wrong: 0, missed: 0, offBeat: 0, total: 0 };
    if (r === 'wrong') e.wrong++;
    else if (r === 'skipped' || r === 'pending') e.missed++;
    else if (off !== null && Math.abs(off) > onTimeMs) e.offBeat++;
    e.total = e.wrong + e.missed + e.offBeat;
    byMeasure.set(n.measure, e);
  });
  const measures = [...byMeasure.values()].filter((m) => m.total > 0).sort((a, b) => b.total - a.total || a.measure - b.measure);

  return { score: Math.round(weightedScore(criteria)), criteria, hands, sync: syncTotal ? synced / syncTotal : null, measures };
}

/** Gợi ý đoạn luyện lại: ô nhiều lỗi nhất, gộp với ô liền kề cũng có lỗi (tối đa `maxLength` ô). */
export function weakestSpan(measures: readonly Pick<MeasureErrors, 'measure' | 'total'>[], maxLength = 2): { from: number; to: number } | null {
  if (!measures.length) return null;
  const worst = [...measures].sort((a, b) => b.total - a.total || a.measure - b.measure)[0];
  const errorsAt = (m: number) => measures.find((x) => x.measure === m)?.total ?? 0;
  let from = worst.measure;
  let to = worst.measure;
  while (to - from + 1 < maxLength) {
    const before = errorsAt(from - 1);
    const after = errorsAt(to + 1);
    if (!before && !after) break;
    if (after >= before) to++;
    else from--;
  }
  return { from, to };
}
