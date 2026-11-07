/**
 * Tiêu chí "Trường độ": tỉ lệ thời gian GIỮ PHÍM / trường độ kỳ vọng theo tempo thật của người chơi (bản đồ tempo),
 * chấm bằng công thức cũ `durationQuality` (0.6–1.25 trọn điểm, 0 ở 0.1 và 1.75).
 *  - Thả phím lúc pedal vang đang đạp: tiếng vẫn ngân → không tính giữ thiếu (tỉ lệ ≥ 1), như chế độ Biểu diễn.
 *  - Note Off không phải lúc tiếng tắt: `soundingMs` (tới lúc nhả pedal / sostenuto) được ghi riêng để hiển thị.
 *  - Còn giữ lúc dừng ghi: ≥ 60% trường độ thì trọn điểm, chưa đủ thì không đo; rút đàn giữa chừng → không đo.
 *  - Nguồn không báo thả phím (micro) → tiêu chí "không đo".
 * Bài không có ký hiệu legato / staccato / dấu nối / ngắt câu → không chấm các ý đó (không suy đoán).
 */
import { durationQuality } from '../../practice/PerformanceTracker';
import { formatNumber, notePosition, noteName, type AnalysisContext, type CriterionOutcome, type IssueDraft } from './context';

export interface NoteDuration {
  heldMs: number | null;
  soundingMs: number | null;
  expectedMs: number;
  ratio: number | null;
  status: 'short' | 'long' | 'ok';
}

export interface DurationOutcome extends CriterionOutcome {
  durations: Map<number, NoteDuration>;
}

export const SHORT_RATIO = 0.6;
export const LONG_RATIO = 1.25;

export function analyzeDuration(ctx: AnalysisContext): DurationOutcome {
  const { ref, perf, aligned } = ctx;
  const durations = new Map<number, NoteDuration>();
  if (!ctx.capabilities.noteOff) return { value: null, subScores: [], issues: [], durations, reason: 'Nguồn vào không báo lúc thả phím (micro) — không đo trường độ' };

  const scored: { r: number; q: number; ratio: number }[] = [];
  ref.notes.forEach((n, r) => {
    const p = ctx.perfOf[r];
    if (p === null || ctx.status[r] === 'order') return;
    const pn = perf.notes[p];
    const expectedMs = aligned.map.msAt(n.onsetBeat + n.durationBeats) - aligned.map.msAt(n.onsetBeat);
    if (!(expectedMs > 0)) return;
    const soundingMs = pn.soundingEndMs === null ? null : pn.soundingEndMs - pn.onMs;
    if (pn.heldMs === null) {
      if (pn.endedBy === 'stop' && pn.heldAtLeastMs !== undefined && pn.heldAtLeastMs >= SHORT_RATIO * expectedMs) {
        scored.push({ r, q: 1, ratio: 1 });
        durations.set(r, { heldMs: null, soundingMs, expectedMs, ratio: null, status: 'ok' });
      }
      return;
    }
    const raw = pn.heldMs / expectedMs;
    const ratio = pn.releasedUnderPedal ? Math.max(raw, 1) : raw;
    const q = durationQuality(ratio);
    scored.push({ r, q, ratio });
    durations.set(r, { heldMs: pn.heldMs, soundingMs, expectedMs, ratio: raw, status: ratio < SHORT_RATIO ? 'short' : ratio > LONG_RATIO ? 'long' : 'ok' });
  });

  if (!scored.length) return { value: null, subScores: [], issues: [], durations, reason: 'Chưa có nốt nào đo được lúc thả phím' };
  const issues: IssueDraft[] = [];
  for (const s of scored) {
    if (s.q >= 1) continue;
    const n = ref.notes[s.r];
    const d = durations.get(s.r)!;
    const short = s.ratio < SHORT_RATIO;
    issues.push({
      criterion: 'duration',
      type: short ? 'short' : 'long',
      severity: s.q < 0.5 ? 'major' : 'minor',
      measure: n.measure,
      beat: n.beatInMeasure,
      refNoteIds: [n.id],
      perfNoteIds: [ctx.perfOf[s.r]!],
      hand: n.hand,
      value: Math.round(s.ratio * 100) / 100,
      criterionDeduction: (1 - s.q) / scored.length,
      confidence: 'high',
      message: short
        ? `${notePosition(ref, n)}: nốt ${noteName(n.midi)} nhả sớm (giữ ${Math.round(s.ratio * 100)}% trường độ${d.heldMs !== null ? `, ${formatNumber(Math.round(d.heldMs / 10) / 100, 2)} giây` : ''}).`
        : `${notePosition(ref, n)}: nốt ${noteName(n.midi)} giữ quá lâu (${Math.round(s.ratio * 100)}% trường độ).`,
    });
  }
  const value = scored.reduce((a, s) => a + s.q, 0) / scored.length;
  return { value, subScores: [], issues, durations };
}
