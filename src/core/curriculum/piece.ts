/**
 * Bản nhạc của giáo trình → Lesson (để dùng lại ScoreView / PracticeEngine) và → dòng thời gian từng nốt
 * (pitch, midiNote, startBeat, durationBeats, hand, finger, measureIndex) để chấm nhịp, phát mẫu, xuất MIDI.
 * Quy ước Đô giữa = C4 = MIDI 60.
 */
import { parseAccompaniment, parseNotes, splitMeasures } from '../lessons/notation';
import { DURATION_BEATS, measureLength, noteHand, type Finger, type Hand, type Lesson } from '../lessons/types';
import { dynamicAt, DYNAMIC_VELOCITY, type DynamicMark } from '../music/dynamics';
import type { PedalRange } from '../music/pedal';
import type { TimedNote } from '../practice/PerformanceTracker';
import { text, type Piece } from './types';

export function pieceToLesson(piece: Piece, id: string): Lesson {
  const lesson: Lesson = {
    id,
    title: piece.title ? text(piece.title) : '',
    description: '',
    category: 'notes',
    clef: piece.clef,
    timeSignature: piece.timeSignature ?? [4, 4],
    difficulty: 1,
    hand: piece.hand,
    notes: parseNotes(piece.notation),
    tempo: piece.bpm,
    source: piece.source,
    ...(piece.keySignature ? { keySignature: piece.keySignature } : {}),
    ...(piece.accompaniment ? { accompaniment: parseAccompaniment(piece.accompaniment) } : {}),
    ...(piece.sections ? { sections: piece.sections } : {}),
  };
  if (piece.dynamics) lesson.dynamics = dynamicMarks(lesson, piece.dynamics);
  if (piece.pedal) lesson.pedal = pedalMarks(lesson, piece.pedal);
  return lesson;
}

/** Pedal theo số ô như bản in (từ 1) → chỉ số ô (từ 0, gồm ô lấy đà). Ô không tồn tại / khoảng ngược / chồng nhau → lỗi. */
function pedalMarks(lesson: Lesson, ranges: NonNullable<Piece['pedal']>): NonNullable<Lesson['pedal']> {
  const count = splitMeasures(lesson.notes, measureLength(lesson.timeSignature), lesson.pickup).length;
  const offset = lesson.pickup ? 0 : -1;
  return ranges.map(([from, to], i) => {
    const r = { from: from + offset, to: to + offset };
    if (r.from < 0 || r.to >= count) throw new Error(`Pedal ô ${from}–${to} không có trong bài`);
    if (r.to < r.from) throw new Error(`Pedal ô ${from}–${to}: ô kết thúc đứng trước ô bắt đầu`);
    if (i > 0 && from <= ranges[i - 1][1]) throw new Error(`Pedal ô ${from}–${to} chồng lên khoảng trước`);
    return r;
  });
}

/** Ký hiệu pedal của bài → khoảng theo phách (để chấm và phát mẫu); có `fromBeat` / `toBeat` = đổi pedal giữa ô. */
export function pedalRanges(lesson: Lesson): PedalRange[] {
  if (!lesson.pedal?.length) return [];
  const measures = splitMeasures(lesson.notes, measureLength(lesson.timeSignature), lesson.pickup);
  const starts: number[] = [];
  let beat = 0;
  for (const m of measures) {
    starts.push(beat);
    beat += m.beats;
  }
  starts.push(beat);
  return lesson.pedal.map((p) => ({
    startBeat: starts[p.from] + (p.fromBeat ?? 0),
    endBeat: p.toBeat !== undefined ? starts[p.to] + p.toBeat : starts[p.to + 1],
  }));
}

/** Dấu sắc thái theo ô nhịp (từ 1, ô lấy đà không đánh số) → chỉ số nốt đầu ô. Ô không tồn tại → lỗi. */
function dynamicMarks(lesson: Lesson, byMeasure: NonNullable<Piece['dynamics']>): NonNullable<Lesson['dynamics']> {
  const measures = splitMeasures(lesson.notes, measureLength(lesson.timeSignature), lesson.pickup);
  const firstIndex: number[] = [];
  let i = 0;
  for (const m of measures) {
    firstIndex.push(i);
    i += m.items.length;
  }
  const offset = lesson.pickup ? 0 : -1;
  return Object.entries(byMeasure)
    .map(([measure, mark]) => {
      const idx = firstIndex[Number(measure) + offset];
      if (idx === undefined) throw new Error(`Dấu sắc thái ở ô nhịp ${measure} không có trong bài`);
      return { index: idx, mark: mark as DynamicMark };
    })
    .sort((a, b) => a.index - b.index);
}

export interface TimelineNote {
  /** Chỉ số trong `lesson.notes`. */
  index: number;
  /** Tên nốt ("C4"), "R" với dấu lặng. */
  pitch: string;
  /** null với dấu lặng. */
  midiNote: number | null;
  startBeat: number;
  durationBeats: number;
  hand: Hand;
  finger?: Finger;
  /** Lực gõ khi phát mẫu / xuất MIDI (1–127). */
  velocity: number;
  /** Sắc thái đang có hiệu lực (bài có dấu p / f…). */
  dynamic?: DynamicMark;
  /** Ô nhịp (từ 0, gồm cả ô lấy đà). */
  measureIndex: number;
}

const DEFAULT_VELOCITY = 80;

export function lessonTimeline(lesson: Lesson): TimelineNote[] {
  const measures = splitMeasures(lesson.notes, measureLength(lesson.timeSignature), lesson.pickup);
  const out: TimelineNote[] = [];
  const dynamics = lesson.dynamics ? dynamicAt(lesson.dynamics, lesson.notes.length) : [];
  let beat = 0;
  measures.forEach((m, mi) => {
    for (const n of m.items) {
      const durationBeats = DURATION_BEATS[n.duration];
      const dynamic = dynamics[out.length];
      out.push({
        index: out.length,
        pitch: n.pitch,
        midiNote: n.rest ? null : n.midi,
        startBeat: beat,
        durationBeats,
        hand: noteHand(lesson, n),
        ...(n.finger ? { finger: n.finger } : {}),
        velocity: dynamic ? DYNAMIC_VELOCITY[dynamic] : DEFAULT_VELOCITY,
        ...(dynamic ? { dynamic } : {}),
        measureIndex: mi,
      });
      beat += durationBeats;
    }
  });
  applyHairpins(lesson, out);
  return out;
}

/** Bước lực gõ khi to dần / nhỏ dần mà không có dấu sắc thái đích phía sau. */
const HAIRPIN_STEP = 15;

/**
 * To dần / nhỏ dần: lực gõ các nốt dưới hình nêm đổi dần (theo phách) từ sắc thái ở đầu hình nêm tới sắc thái
 * đứng ngay sau nó (không có thì ± HAIRPIN_STEP). Chỉ ảnh hưởng nghe mẫu / xuất MIDI, không đổi đoạn chấm sắc thái.
 */
function applyHairpins(lesson: Lesson, out: TimelineNote[]): void {
  for (const h of lesson.hairpins ?? []) {
    const first = out[h.from];
    const last = out[h.to];
    if (!first || !last || h.to < h.from) continue;
    const after = out[h.to + 1];
    const startV = first.velocity;
    const sign = h.type === 'cresc' ? 1 : -1;
    const target = after && Math.sign(after.velocity - startV) === sign ? after.velocity : Math.min(127, Math.max(1, startV + sign * HAIRPIN_STEP));
    const span = (after?.startBeat ?? last.startBeat + last.durationBeats) - first.startBeat;
    for (let i = h.from; i <= h.to; i++) {
      const t = span > 0 ? (out[i].startBeat - first.startBeat) / span : 0;
      out[i].velocity = Math.round(startV + (target - startV) * t);
    }
  }
}

/** Nốt phát lại (mẫu, MIDI): một phím một mục. */
export interface SoundingNote {
  midiNote: number;
  startBeat: number;
  durationBeats: number;
  velocity: number;
  hand: Hand;
}

/** Bè trong của tay phải mềm hơn giai điệu khi nghe mẫu (giai điệu nổi lên trên). */
const HARMONY_VELOCITY_RATIO = 0.8;

/** Nốt hoà âm tay phải (chùm nốt), cùng phách + trường độ với nốt giai điệu; không chấm điểm ở đây. */
export function harmonyTimeline(lesson: Lesson, melody: readonly TimelineNote[] = lessonTimeline(lesson)): SoundingNote[] {
  const out: SoundingNote[] = [];
  lesson.notes.forEach((n, i) => {
    for (const h of n.harmony ?? []) {
      const m = melody[i];
      out.push({ midiNote: h.midi, startBeat: m.startBeat, durationBeats: m.durationBeats, velocity: Math.round(m.velocity * HARMONY_VELOCITY_RATIO), hand: m.hand });
    }
  });
  return out;
}

/** Nốt phần đệm (mỗi nốt của hợp âm một mục) để phát mẫu cùng giai điệu; không chấm điểm. */
export function accompanimentTimeline(lesson: Lesson): SoundingNote[] {
  const out: SoundingNote[] = [];
  // Bài có sắc thái: tay trái theo lực gõ của nốt giai điệu đang vang (kể cả to dần / nhỏ dần).
  const melody = lesson.dynamics || lesson.hairpins ? lessonTimeline(lesson) : [];
  let beat = 0;
  for (const chord of lesson.accompaniment ?? []) {
    const durationBeats = DURATION_BEATS[chord.duration];
    const under = melody.filter((n) => n.startBeat <= beat + 1e-9).pop();
    const scale = under ? under.velocity / DEFAULT_VELOCITY : 1;
    // Tay trái nhỏ hơn giai điệu một chút khi nghe mẫu.
    const velocity = Math.round(ACCOMPANIMENT_VELOCITY * scale);
    for (const midi of chord.midis) out.push({ midiNote: midi, startBeat: beat, durationBeats, velocity, hand: 'left' });
    beat += durationBeats;
  }
  return out;
}

/**
 * Mọi phím của bài theo thời gian (giai điệu + hoà âm tay phải + phần đệm tay trái), xếp theo phách —
 * nghe mẫu và xuất MIDI đọc cùng một nguồn với khuông nhạc nên luôn khớp nhau.
 */
export function soundingNotes(lesson: Lesson): SoundingNote[] {
  const melody = lessonTimeline(lesson);
  const played = melody.filter((n): n is TimelineNote & { midiNote: number } => n.midiNote !== null).map(({ midiNote, startBeat, durationBeats, velocity, hand }) => ({ midiNote, startBeat, durationBeats, velocity, hand }));
  return [...played, ...harmonyTimeline(lesson, melody), ...accompanimentTimeline(lesson)].sort((a, b) => a.startBeat - b.startBeat || a.midiNote - b.midiNote);
}

/** File MIDI chuẩn của cả bài (tay phải kênh 1, tay trái kênh 2), nhịp độ gợi ý của bài. */
export function lessonToMidi(lesson: Lesson, bpm = lesson.tempo ?? 72): Uint8Array {
  return timelineToMidi(soundingNotes(lesson), bpm, lesson.timeSignature);
}

const ACCOMPANIMENT_VELOCITY = 55;

/** Dòng thời gian → đầu vào PerformanceTracker; `hand` chỉ chấm một tay (tay kia coi như dấu lặng). */
export function timedNotes(timeline: readonly TimelineNote[], hand?: Hand): TimedNote[] {
  return timeline.map((n) => ({
    startBeat: n.startBeat,
    durationBeats: n.durationBeats,
    midi: hand && n.hand !== hand ? null : n.midiNote,
    ...(n.dynamic ? { dynamic: n.dynamic } : {}),
  }));
}

/** Số nốt cần chơi (không tính dấu lặng). */
export function playableCount(timeline: readonly TimelineNote[]): number {
  return timeline.filter((n) => n.midiNote !== null).length;
}

// ── Xuất MIDI chuẩn (SMF format 0) ──────────────────────────────────

const TICKS_PER_QUARTER = 480;

function varLen(value: number): number[] {
  const bytes = [value & 0x7f];
  let v = value >> 7;
  while (v > 0) {
    bytes.unshift((v & 0x7f) | 0x80);
    v >>= 7;
  }
  return bytes;
}

/**
 * File MIDI một track: tempo, nhịp, rồi Note On / Note Off theo thứ tự thời gian.
 * Tay phải kênh 1, tay trái kênh 2.
 */
export function timelineToMidi(
  timeline: readonly Pick<TimelineNote, 'midiNote' | 'startBeat' | 'durationBeats' | 'velocity' | 'hand'>[],
  bpm: number,
  timeSignature: [number, 4 | 8] = [4, 4],
): Uint8Array {
  type Ev = { tick: number; order: number; bytes: number[] };
  const events: Ev[] = [];
  const usPerQuarter = Math.round(60_000_000 / bpm);
  events.push({ tick: 0, order: 0, bytes: [0xff, 0x51, 0x03, (usPerQuarter >> 16) & 0xff, (usPerQuarter >> 8) & 0xff, usPerQuarter & 0xff] });
  events.push({ tick: 0, order: 0, bytes: [0xff, 0x58, 0x04, timeSignature[0], Math.log2(timeSignature[1]), 24, 8] });
  for (const n of timeline) {
    if (n.midiNote === null) continue;
    const ch = n.hand === 'left' ? 1 : 0;
    const on = Math.round(n.startBeat * TICKS_PER_QUARTER);
    const off = Math.round((n.startBeat + n.durationBeats) * TICKS_PER_QUARTER);
    // Cùng tick: Note Off của nốt trước đi trước Note On của nốt sau.
    events.push({ tick: on, order: 2, bytes: [0x90 | ch, n.midiNote, n.velocity] });
    events.push({ tick: off, order: 1, bytes: [0x80 | ch, n.midiNote, 0] });
  }
  events.sort((a, b) => a.tick - b.tick || a.order - b.order);
  const track: number[] = [];
  let last = 0;
  for (const e of events) {
    track.push(...varLen(e.tick - last), ...e.bytes);
    last = e.tick;
  }
  track.push(0x00, 0xff, 0x2f, 0x00);
  const header = [0x4d, 0x54, 0x68, 0x64, 0, 0, 0, 6, 0, 0, 0, 1, (TICKS_PER_QUARTER >> 8) & 0xff, TICKS_PER_QUARTER & 0xff];
  const len = track.length;
  const trackHeader = [0x4d, 0x54, 0x72, 0x6b, (len >>> 24) & 0xff, (len >>> 16) & 0xff, (len >>> 8) & 0xff, len & 0xff];
  return new Uint8Array([...header, ...trackHeader, ...track]);
}
