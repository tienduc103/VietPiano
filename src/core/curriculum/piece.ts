/**
 * Bản nhạc của giáo trình → Lesson (để dùng lại ScoreView / PracticeEngine) và → dòng thời gian từng nốt
 * (pitch, midiNote, startBeat, durationBeats, hand, finger, measureIndex) để chấm nhịp, phát mẫu, xuất MIDI.
 * Quy ước Đô giữa = C4 = MIDI 60.
 */
import { parseNotes, splitMeasures } from '../lessons/notation';
import { DURATION_BEATS, measureLength, noteHand, type Finger, type Hand, type Lesson } from '../lessons/types';
import type { TimedNote } from '../practice/PerformanceTracker';
import { text, type Piece } from './types';

export function pieceToLesson(piece: Piece, id: string): Lesson {
  return {
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
  };
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
  /** Ô nhịp (từ 0, gồm cả ô lấy đà). */
  measureIndex: number;
}

const DEFAULT_VELOCITY = 80;

export function lessonTimeline(lesson: Lesson): TimelineNote[] {
  const measures = splitMeasures(lesson.notes, measureLength(lesson.timeSignature), lesson.pickup);
  const out: TimelineNote[] = [];
  let beat = 0;
  measures.forEach((m, mi) => {
    for (const n of m.items) {
      const durationBeats = DURATION_BEATS[n.duration];
      out.push({
        index: out.length,
        pitch: n.pitch,
        midiNote: n.rest ? null : n.midi,
        startBeat: beat,
        durationBeats,
        hand: noteHand(lesson, n),
        ...(n.finger ? { finger: n.finger } : {}),
        velocity: DEFAULT_VELOCITY,
        measureIndex: mi,
      });
      beat += durationBeats;
    }
  });
  return out;
}

/** Dòng thời gian → đầu vào PerformanceTracker; `hand` chỉ chấm một tay (tay kia coi như dấu lặng). */
export function timedNotes(timeline: readonly TimelineNote[], hand?: Hand): TimedNote[] {
  return timeline.map((n) => ({
    startBeat: n.startBeat,
    durationBeats: n.durationBeats,
    midi: hand && n.hand !== hand ? null : n.midiNote,
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
export function timelineToMidi(timeline: readonly TimelineNote[], bpm: number, timeSignature: [number, 4 | 8] = [4, 4]): Uint8Array {
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
