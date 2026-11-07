/**
 * Luyện theo đoạn: cắt bài thành các ô `from`…`to` (số ô IN trên bản nhạc; bài có ô lấy đà thì ô lấy đà = 0).
 * Đoạn cắt vẫn là một `Lesson` đầy đủ (giai điệu + chùm nốt + phần đệm + pedal + sắc thái + hợp âm) nên dùng lại
 * nguyên màn Luyện tập; `slice` ghi lại vị trí trong bài gốc để báo đúng số ô và để lưu phiên "luyện đoạn"
 * (không tính là hoàn thành cả bài). `id` giữ nguyên bài gốc (tiến độ, nhận xét AI gắn với bài gốc).
 */
import { splitMeasures } from './notation';
import { measureIndexOf, printedMeasure } from './positions';
import { measureLength, type Lesson, type PedalMark } from './types';
import { dynamicAt } from '../music/dynamics';

/** Số ô in đầu / cuối của bài. */
export function measureRange(lesson: Pick<Lesson, 'notes' | 'timeSignature' | 'pickup'>): { first: number; last: number } {
  const count = splitMeasures(lesson.notes, measureLength(lesson.timeSignature), lesson.pickup).length;
  return { first: printedMeasure(lesson, 0), last: printedMeasure(lesson, count - 1) };
}

export function sliceLesson(lesson: Lesson, from: number, to: number): Lesson {
  const full = measureLength(lesson.timeSignature);
  const melody = splitMeasures(lesson.notes, full, lesson.pickup);
  const acc = lesson.accompaniment ? splitMeasures(lesson.accompaniment, full, lesson.pickup) : undefined;
  const a = measureIndexOf(lesson, from);
  const b = measureIndexOf(lesson, to);
  if (a < 0 || b >= melody.length || b < a) throw new Error(`Đoạn ô ${from}–${to} không có trong bài`);
  const firstNote = melody.slice(0, a).reduce((n, m) => n + m.items.length, 0);
  const notes = melody.slice(a, b + 1).flatMap((m) => m.items);
  const lastNote = firstNote + notes.length - 1;
  const inRange = (i: number) => i >= firstNote && i <= lastNote;
  const keepsPickup = a === 0 && !!lesson.pickup;

  // Sắc thái đang có hiệu lực ở đầu đoạn được đặt lại ở nốt đầu đoạn.
  const marks = lesson.dynamics ?? [];
  const inEffect = marks.length ? dynamicAt(marks, lesson.notes.length)[firstNote] : undefined;
  const dynamics = [
    ...(inEffect && !marks.some((d) => d.index === firstNote) ? [{ index: 0, mark: inEffect }] : []),
    ...marks.filter((d) => inRange(d.index)).map((d) => ({ ...d, index: d.index - firstNote })),
  ];
  const hairpins = (lesson.hairpins ?? [])
    .filter((h) => h.to >= firstNote && h.from <= lastNote)
    .map((h) => ({ ...h, from: Math.max(h.from, firstNote) - firstNote, to: Math.min(h.to, lastNote) - firstNote }));
  // Ký hiệu hợp âm: giữ hợp âm đang vang ở đầu đoạn (đặt lại ở nốt đầu) + các ký hiệu trong đoạn.
  const chords = lesson.chordSymbols ?? [];
  const sounding = [...chords].reverse().find((c) => c.index <= firstNote);
  const chordSymbols = [
    ...(sounding && sounding.index < firstNote ? [{ index: 0, symbol: sounding.symbol }] : []),
    ...chords.filter((c) => inRange(c.index)).map((c) => ({ ...c, index: c.index - firstNote })),
  ];
  const pedal: PedalMark[] = (lesson.pedal ?? [])
    .filter((p) => p.to >= a && p.from <= b)
    .map((p) => {
      const m: PedalMark = { from: Math.max(p.from, a) - a, to: Math.min(p.to, b) - a };
      if (p.fromBeat !== undefined && p.from >= a) m.fromBeat = p.fromBeat;
      if (p.toBeat !== undefined && p.to <= b) m.toBeat = p.toBeat;
      return m;
    });
  // Chữ đánh dấu đoạn: đánh số lại theo đoạn cắt (không giữ ô lấy đà → ô `from` thành ô 1).
  const shift = keepsPickup ? 0 : from - 1;
  const count = b - a + 1;
  const sections = (lesson.sections ?? [])
    .map((s) => ({ ...s, measure: s.measure - shift }))
    .filter((s) => s.measure >= 1 && (keepsPickup ? s.measure : s.measure - 1) < count);

  const out: Lesson = {
    ...lesson,
    title: `${lesson.title} — ô ${from === to ? from : `${from}–${to}`}`,
    notes,
    slice: { from, to },
  };
  if (keepsPickup) out.pickup = lesson.pickup;
  else delete out.pickup;
  if (acc) out.accompaniment = acc.slice(a, b + 1).flatMap((m) => m.items);
  if (lesson.dynamics) out.dynamics = dynamics;
  if (lesson.hairpins) out.hairpins = hairpins;
  if (lesson.chordSymbols) out.chordSymbols = chordSymbols;
  if (lesson.pedal) out.pedal = pedal;
  if (lesson.sections) out.sections = sections;
  return out;
}

/** Số ô in trong bài gốc ứng với số ô in `measure` của đoạn cắt. */
export function originalMeasure(lesson: Pick<Lesson, 'slice' | 'pickup'>, measure: number): number {
  if (!lesson.slice) return measure;
  // Đoạn không giữ ô lấy đà đánh số từ 1 → ô 1 của đoạn = ô `from` của bài gốc.
  return lesson.pickup ? measure + lesson.slice.from : measure - 1 + lesson.slice.from;
}
