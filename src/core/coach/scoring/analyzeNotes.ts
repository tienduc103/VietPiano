/**
 * Tiêu chí "Chính xác nốt". N = số nốt bản nhạc cần chấm; mỗi lỗi trừ (theo phần giá trị tiêu chí):
 *   sai nốt / thiếu nốt 1/N · sai quãng tám 0.5/N · sai thứ tự 0.5/N mỗi nốt · thừa / cùng lúc 0.5/N · đánh lặp 0.25/N.
 * Sai thứ tự: hai nốt đơn liền nhau đánh tráo cao độ, hoặc đúng phím nhưng đảo thời gian.
 * Nốt thừa không gán tay (không suy tay từ cao độ).
 */
import type { NoteAlignment } from '../types';
import { createContext, handLabel, measureAtMs, measureLabel, notePosition, noteName, type AnalysisContext, type CriterionOutcome, type IssueDraft } from './context';
import { REPEAT_BEAT_FRACTION, REPEAT_MIN_MS, SIMULTANEOUS_MS } from './modes';

export const NOTE_PENALTY = { wrong: 1, missing: 1, octave: 0.5, order: 0.5, extra: 0.5, simultaneous: 0.5, repeated: 0.25 } as const;

export type ExtraKind = 'extra' | 'repeated' | 'simultaneous';

export interface NotesOutcome extends CriterionOutcome {
  extras: { perf: number; kind: ExtraKind; measure: number }[];
}

export function analyzeNotes(ctx: AnalysisContext): NotesOutcome {
  const { ref, perf, aligned } = ctx;
  const N = ref.notes.length;
  // Trạng thái từ căn chỉnh.
  ref.notes.forEach((_, i) => {
    const p = aligned.pairs.get(i);
    ctx.status[i] = !p ? 'missing' : p.kind === 'exact' ? 'correct' : p.kind;
    ctx.perfOf[i] = p?.perf ?? null;
  });

  // Sai thứ tự: hai nhóm liền nhau, mỗi nhóm một nốt.
  for (let g = 0; g + 1 < ref.groups.length; g++) {
    const A = ref.groups[g];
    const B = ref.groups[g + 1];
    if (A.notes.length !== 1 || B.notes.length !== 1) continue;
    const a = A.notes[0];
    const b = B.notes[0];
    const pa = ctx.perfOf[a];
    const pb = ctx.perfOf[b];
    if (pa === null || pb === null) continue;
    const swappedPitch = ctx.status[a] === 'wrong' && ctx.status[b] === 'wrong' && perf.notes[pa].midi === ref.notes[b].midi && perf.notes[pb].midi === ref.notes[a].midi;
    const swappedTime = ctx.status[a] === 'correct' && ctx.status[b] === 'correct' && perf.notes[pa].onMs > perf.notes[pb].onMs;
    if (swappedPitch || swappedTime) {
      ctx.status[a] = 'order';
      ctx.status[b] = 'order';
    }
  }

  const issues: IssueDraft[] = [];
  if (N === 0) return { value: null, subScores: [], issues, reason: 'Bản nhạc không có nốt cần chấm', extras: [] };
  const unit = 1 / N;

  ref.notes.forEach((n, i) => {
    const st = ctx.status[i];
    if (st === 'correct') return;
    const inChord = ref.groups[n.group].notes.length > 1;
    const p = ctx.perfOf[i];
    const played = p !== null ? perf.notes[p] : null;
    const where = notePosition(ref, n);
    const hand = handLabel(n.hand);
    const base = { criterion: 'notes' as const, measure: n.measure, beat: n.beatInMeasure, refNoteIds: [n.id], perfNoteIds: p !== null ? [p] : [], hand: n.hand, expectedMidi: n.midi, confidence: 'high' as const };
    if (st === 'missing') {
      issues.push({
        ...base,
        type: inChord ? 'chord-missing-note' : 'missing-note',
        severity: 'major',
        criterionDeduction: NOTE_PENALTY.missing * unit,
        message: inChord ? `${where}: hợp âm thiếu nốt ${noteName(n.midi)} (${hand}).` : `${where}: thiếu nốt ${noteName(n.midi)} (${hand}).`,
      });
    } else if (st === 'wrong' && played) {
      issues.push({
        ...base,
        type: inChord ? 'chord-wrong-note' : 'wrong-note',
        severity: 'major',
        actualMidi: played.midi,
        criterionDeduction: NOTE_PENALTY.wrong * unit,
        message: `${where}: ${inChord ? 'hợp âm cần' : 'cần'} ${noteName(n.midi)}, bạn đánh ${noteName(played.midi)} (${hand}).`,
      });
    } else if (st === 'octave' && played) {
      issues.push({
        ...base,
        type: 'octave',
        severity: 'minor',
        actualMidi: played.midi,
        criterionDeduction: NOTE_PENALTY.octave * unit,
        message: `${where}: đúng tên nốt nhưng sai quãng tám (cần ${noteName(n.midi)}, đánh ${noteName(played.midi)}).`,
      });
    } else if (st === 'order') {
      issues.push({
        ...base,
        type: 'order',
        severity: 'minor',
        ...(played ? { actualMidi: played.midi } : {}),
        criterionDeduction: NOTE_PENALTY.order * unit,
        message: `${where}: nốt ${noteName(n.midi)} đánh sai thứ tự với nốt kề bên.`,
      });
    }
  });

  // Nốt thừa.
  const extras: NotesOutcome['extras'] = [];
  const groupOnsets = ref.groups.map((g) => {
    const ts = g.notes.map((r) => ctx.perfOf[r]).filter((p): p is number => p !== null).map((p) => perf.notes[p].onMs);
    return ts.length ? ts : null;
  });
  for (const p of aligned.extras) {
    const x = perf.notes[p];
    const pos = measureAtMs(ctx, x.onMs);
    const repeatWindow = Math.max(REPEAT_MIN_MS, REPEAT_BEAT_FRACTION * aligned.map.msPerBeatAt(pos.beat));
    const repeated = [...aligned.perfToRef.keys()].some((q) => perf.notes[q].midi === x.midi && perf.notes[q].onMs < x.onMs && x.onMs - perf.notes[q].onMs <= repeatWindow);
    const simultaneous = !repeated && groupOnsets.some((ts) => ts !== null && ts.some((t) => Math.abs(t - x.onMs) <= SIMULTANEOUS_MS));
    const kind: ExtraKind = repeated ? 'repeated' : simultaneous ? 'simultaneous' : 'extra';
    extras.push({ perf: p, kind, measure: pos.measure });
    const at = measureLabel(pos.measure);
    issues.push({
      criterion: 'notes',
      type: kind === 'repeated' ? 'repeated-note' : kind === 'simultaneous' ? 'simultaneous-extra' : 'extra-note',
      severity: 'minor',
      measure: pos.measure,
      beat: pos.beat - ref.measureStarts[Math.max(0, ref.printedMeasures.indexOf(pos.measure))],
      refNoteIds: [],
      perfNoteIds: [p],
      hand: 'unknown',
      actualMidi: x.midi,
      actualMs: x.onMs,
      criterionDeduction: NOTE_PENALTY[kind] * unit,
      confidence: 'medium',
      message:
        kind === 'repeated'
          ? `${at}: đánh lặp nốt ${noteName(x.midi)}.`
          : kind === 'simultaneous'
            ? `${at}: thừa nốt ${noteName(x.midi)} đánh cùng lúc với nốt khác.`
            : `${at}: thừa nốt ${noteName(x.midi)}.`,
    });
  }

  const lost = issues.reduce((a, i) => a + i.criterionDeduction, 0);
  // Kẹp ở 0: phần khấu trừ vượt 1 được thu nhỏ đều để tổng khấu trừ = 1 − giá trị.
  if (lost > 1) for (const i of issues) i.criterionDeduction /= lost;
  return { value: Math.max(0, 1 - lost), subScores: [], issues, extras };
}

/** Bảng ghép từng nốt (cho tô khuông / chi tiết nốt) — trường thời gian / trường độ được bổ sung sau. */
export function baseAlignment(ctx: AnalysisContext, extras: NotesOutcome['extras']): NoteAlignment[] {
  const out: NoteAlignment[] = ctx.ref.notes.map((n, i) => {
    const p = ctx.perfOf[i];
    return {
      refId: n.id,
      perfId: p,
      status: ctx.status[i],
      refMidi: n.midi,
      ...(p !== null ? { perfMidi: ctx.perf.notes[p].midi, actualMs: ctx.perf.notes[p].onMs, velocity: ctx.perf.notes[p].velocity } : {}),
      hand: n.hand,
      measure: n.measure,
    };
  });
  for (const x of extras) {
    const pn = ctx.perf.notes[x.perf];
    out.push({ refId: null, perfId: x.perf, status: x.kind, perfMidi: pn.midi, hand: 'unknown', measure: x.measure, actualMs: pn.onMs, velocity: pn.velocity });
  }
  return out;
}

export { createContext };
