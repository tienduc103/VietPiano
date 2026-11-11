/**
 * Tạo bài luyện bổ trợ 3–5 nốt từ đoạn khó (đặc tả §14, quyết định F6).
 * - Cắt theo NHÓM nốt (cùng phách: hợp âm / hai tay giữ nguyên), giữ cao độ, trường độ, thứ tự, tay, số ngón, sắc thái, hoá biểu.
 * - Ranh giới chỉ đặt ở phách mà KHÔNG nốt / dấu lặng nào (của mọi bè) đang ngân qua → không tách nốt tuỳ tiện, ô nhịp vẫn đúng.
 * - Không có ranh giới an toàn gần đó (nốt ngân dài của tay kia…) → cắt theo ô nhịp (`sliceLesson`).
 * - Bài bổ trợ có id `rem:<bài gốc>:<nhóm đầu>-<nhóm cuối>` và SINH LẠI được từ bài gốc → không lưu nốt.
 */
import { referenceFromLesson } from '../coach/reference/fromLesson';
import type { ScoreReference } from '../coach/types';
import { measureRange, sliceLesson } from '../lessons/slice';
import { DURATION_BEATS, measureLength, type Lesson } from '../lessons/types';
import { dynamicAt } from '../music/dynamics';
import { groupName } from './passages';

const EPS = 1e-6;
export const REMEDIAL_PREFIX = 'rem:';

export function remedialId(sourceId: string, a: number, b: number): string {
  return `${REMEDIAL_PREFIX}${sourceId}:${a}-${b}`;
}

export function parseRemedialId(id: string): { sourceId: string; a: number; b: number } | null {
  if (!id.startsWith(REMEDIAL_PREFIX)) return null;
  const k = id.lastIndexOf(':');
  const m = /^(\d+)-(\d+)$/.exec(id.slice(k + 1));
  const sourceId = id.slice(REMEDIAL_PREFIX.length, k);
  if (!m || !sourceId || k <= REMEDIAL_PREFIX.length) return null;
  const a = Number(m[1]);
  const b = Number(m[2]);
  return b >= a ? { sourceId, a, b } : null;
}

/**
 * Khoảng nhóm của bài bổ trợ bậc `variant` cho đoạn khó [startGroup, endGroup] (lỗi ở chỗ chuyển VÀO startGroup).
 * Ví dụ lỗi Mi → Fa trong Đô–Rê–Mi–Fa–Sol–La–Si–Đô: bậc 0 Rê–Mi–Fa, bậc 1 Rê–Mi–Fa–Sol, bậc 2 Đô–Rê–Mi–Fa–Sol (đặc tả §14).
 */
export function remedialRange(groupCount: number, startGroup: number, endGroup: number, variant: number): [number, number] {
  const last = groupCount - 1;
  const core0 = Math.max(0, Math.min(startGroup - 1, last));
  const core1 = Math.max(core0, Math.min(endGroup, last));
  const coreSize = core1 - core0 + 1;
  const v = Math.max(0, Math.min(2, Math.floor(variant)));
  const size = Math.min(groupCount, Math.max(3 + v, coreSize + 1 + v));
  const leftPad = v === 2 ? 2 : 1;
  let a = core0 - leftPad;
  if (a < 0) a = 0;
  let b = a + size - 1;
  if (b > last) {
    b = last;
    a = Math.max(0, last - size + 1);
  }
  // Đoạn luôn chứa chỗ lỗi.
  if (b < core1) b = core1;
  return [a, b];
}

interface Span {
  onset: number;
  end: number;
}

function spans<T extends { duration: keyof typeof DURATION_BEATS }>(items: readonly T[], start = 0): Span[] {
  let beat = start;
  return items.map((it) => {
    const s = { onset: beat, end: beat + DURATION_BEATS[it.duration] };
    beat = s.end;
    return s;
  });
}

export interface RemedialBuild {
  lesson: Lesson;
  /** Cắt theo ô vì không có ranh giới an toàn trong phạm vi nốt. */
  byMeasures?: [number, number];
  noteNames: string[];
}

/** Dựng bài bổ trợ cho nhóm [a, b] của bài gốc. `reference` = bản tham chiếu CẢ BÀI, hai tay của bài gốc. */
export function buildRemedialLesson(source: Lesson, a: number, b: number, reference: ScoreReference = referenceFromLesson(source)): RemedialBuild {
  const groups = reference.groups;
  if (a < 0 || b >= groups.length || b < a) throw new Error(`Đoạn nhóm ${a}–${b} không có trong bài ${source.id}`);
  const noteNames = Array.from({ length: b - a + 1 }, (_, k) => groupName(reference, a + k));
  const id = remedialId(source.id, a, b);
  const title = `${source.title.replace(/ — ô .*$/, '')} — luyện ${noteNames.join(' – ')}`;
  const full = measureLength(source.timeSignature);
  // Lesson có pickup bắt đầu trước phách 0 của khuông? lessonTimeline tính phách từ đầu bài (gồm ô lấy đà) — cùng gốc với reference.
  const mel = spans(source.notes);
  const acc = source.accompaniment ? spans(source.accompaniment) : [];
  const all = [...mel, ...acc];
  const crossing = (x: number) => all.filter((s) => s.onset < x - EPS && s.end > x + EPS);

  let start = groups[a].onsetBeat;
  let end = b + 1 < groups.length ? groups[b + 1].onsetBeat : reference.totalBeats;
  // Kết thúc đoạn sau khi các nốt của nhóm cuối hết ngân nếu nhóm kế tiếp là dấu lặng dài — dùng mốc nhóm kế tiếp là đủ.
  for (let guard = 0; guard < 64; guard++) {
    const c = crossing(start);
    if (!c.length) break;
    start = Math.min(...c.map((s) => s.onset));
  }
  for (let guard = 0; guard < 64; guard++) {
    const c = crossing(end);
    if (!c.length) break;
    end = Math.max(...c.map((s) => s.end));
  }
  const requested = (b + 1 < groups.length ? groups[b + 1].onsetBeat : reference.totalBeats) - groups[a].onsetBeat;
  const melIdx = mel.map((s, i) => (s.onset >= start - EPS && s.onset < end - EPS ? i : -1)).filter((i) => i >= 0);
  const accIdx = acc.map((s, i) => (s.onset >= start - EPS && s.onset < end - EPS ? i : -1)).filter((i) => i >= 0);
  const sum = (idx: number[], xs: Span[]) => idx.reduce((t, i) => t + xs[i].end - xs[i].onset, 0);
  const span = end - start;
  const tooLong = span - requested > 2 * full + EPS;
  const mismatch = !melIdx.length || Math.abs(sum(melIdx, mel) - span) > EPS || (acc.length > 0 && accIdx.length > 0 && Math.abs(sum(accIdx, acc) - span) > EPS);
  if (tooLong || mismatch) return byMeasureFallback(source, reference, a, b, id, title, noteNames);

  const i0 = melIdx[0];
  const i1 = melIdx[melIdx.length - 1];
  const inRange = (i: number) => i >= i0 && i <= i1;
  const marks = source.dynamics ?? [];
  const inEffect = marks.length ? dynamicAt(marks, source.notes.length)[i0] : undefined;
  const dynamics = [
    ...(inEffect && !marks.some((d) => d.index === i0) ? [{ index: 0, mark: inEffect }] : []),
    ...marks.filter((d) => inRange(d.index)).map((d) => ({ ...d, index: d.index - i0 })),
  ];
  const hairpins = (source.hairpins ?? [])
    .filter((h) => h.to >= i0 && h.from <= i1)
    .map((h) => ({ ...h, from: Math.max(h.from, i0) - i0, to: Math.min(h.to, i1) - i0 }))
    .filter((h) => h.to > h.from);
  const chords = source.chordSymbols ?? [];
  const sounding = [...chords].reverse().find((c) => c.index <= i0);
  const chordSymbols = [
    ...(sounding && sounding.index < i0 ? [{ index: 0, symbol: sounding.symbol }] : []),
    ...chords.filter((c) => inRange(c.index)).map((c) => ({ ...c, index: c.index - i0 })),
  ];

  // Vị trí trong ô nhịp của điểm bắt đầu → ô lấy đà để vạch nhịp giữ đúng chỗ như bài gốc.
  const pickup0 = source.pickup ?? 0;
  const offset = start < pickup0 - EPS ? start + (full - pickup0) : (start - pickup0) % full;
  const out: Lesson = {
    id,
    title,
    description: `Bài luyện bổ trợ tự tạo từ "${source.title}": ${noteNames.join(' – ')}. Luyện chậm, đều, rồi quay lại bài gốc.`,
    category: source.category,
    clef: source.clef,
    timeSignature: source.timeSignature,
    difficulty: source.difficulty,
    hand: source.hand,
    notes: melIdx.map((i) => source.notes[i]),
    ...(source.keySignature ? { keySignature: source.keySignature } : {}),
    ...(source.tempo ? { tempo: source.tempo } : {}),
    ...(source.tempoRange ? { tempoRange: source.tempoRange } : {}),
    ...(source.source ? { source: source.source } : {}),
  };
  if (offset > EPS && Math.abs(offset - full) > EPS) out.pickup = full - offset;
  if (source.accompaniment && accIdx.length) out.accompaniment = accIdx.map((i) => source.accompaniment![i]);
  if (dynamics.length) out.dynamics = dynamics;
  if (hairpins.length) out.hairpins = hairpins;
  if (chordSymbols.length) out.chordSymbols = chordSymbols;
  return { lesson: out, noteNames };
}

function byMeasureFallback(source: Lesson, reference: ScoreReference, a: number, b: number, id: string, title: string, noteNames: string[]): RemedialBuild {
  const range = measureRange(source);
  const m1 = Math.max(range.first, Math.min(reference.groups[a].measure, range.last));
  const m2 = Math.max(m1, Math.min(reference.groups[b].measure, range.last));
  const sliced = sliceLesson(source, m1, m2);
  const lesson: Lesson = { ...sliced, id, title };
  // Bài bổ trợ ngắn: bỏ ký hiệu pedal (tập nốt / chuyển ngón) — quyết định F6.
  delete lesson.pedal;
  delete lesson.pedalOptional;
  delete lesson.sections;
  return { lesson, byMeasures: [m1, m2], noteNames };
}

/** Sinh lại bài bổ trợ từ id (`rem:<bài gốc>:<a>-<b>`); bài gốc tra bằng `findSource`. */
export function remedialLessonFromId(id: string, findSource: (sourceId: string) => Lesson | undefined): RemedialBuild | null {
  const p = parseRemedialId(id);
  if (!p) return null;
  const source = findSource(p.sourceId);
  if (!source) return null;
  try {
    const ref = referenceFromLesson(source);
    if (p.b >= ref.groups.length) return null;
    return buildRemedialLesson(source, p.a, p.b, ref);
  } catch {
    return null;
  }
}
