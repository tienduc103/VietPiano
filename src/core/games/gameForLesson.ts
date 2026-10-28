/**
 * Trò chơi sau mỗi buổi: suy từ nội dung buổi (không soạn tay cho từng buổi). Mỗi buổi có 2 trò:
 * trò chính theo kỹ năng của buổi + "Giai điệu bí ẩn" (luyện tai) với các nốt đã học.
 * Trò chính:
 *  - Buổi có bài tiết tấu → "Đèn giao thông tiết tấu" (mẫu tiết tấu của buổi, không xét cao độ).
 *  - Buổi có bài đọc nốt → "Bắn bóng trên khuông" (nốt vẽ trên khuông, không hiện tên / làn phím).
 *  - Buổi có ≥ 3 nốt khác nhau (chơi theo khuông) → "Hứng nốt rơi" với chính các nốt đó.
 *  - Ít nốt nhưng có bài tìm phím → "Săn phím" với các lượt tìm phím của buổi.
 *  - Còn lại → "Hứng nốt rơi" với nốt của các buổi gần trước đó.
 */
import { lessonTimeline, pieceToLesson } from '../curriculum/piece';
import type { CurriculumLesson, KeyQuizRound, Piece } from '../curriculum/types';
import type { Clef } from '../lessons/types';
import { midiToPitchClass, requireMidi } from '../music/notes';

type Keyboard = { from: number; to: number };

export type GameSpec =
  | { kind: 'note-catch'; keyboard: Keyboard; notes: number[] }
  | { kind: 'key-hunt'; keyboard: Keyboard; rounds: KeyQuizRound[] }
  | { kind: 'rhythm-train'; piece: Piece }
  | { kind: 'staff-shoot'; keyboard: Keyboard; clef: Clef; notes: number[] }
  | { kind: 'echo-melody'; keyboard: Keyboard; notes: number[] };

export type GameKind = GameSpec['kind'];

export const GAME_TITLE: Record<GameKind, string> = {
  'note-catch': 'Hứng nốt rơi',
  'key-hunt': 'Săn phím',
  'rhythm-train': 'Đèn giao thông tiết tấu',
  'staff-shoot': 'Bắn bóng trên khuông',
  'echo-melody': 'Giai điệu bí ẩn',
};

export const GAME_ICON: Record<GameKind, string> = {
  'note-catch': '🌠',
  'key-hunt': '🐸',
  'rhythm-train': '🚦',
  'staff-shoot': '🎈',
  'echo-melody': '🔮',
};

const MIN_NOTES = 3;
/** Số buổi gần trước được lấy nốt khi buổi này quá ít nốt. */
const LOOKBACK = 4;
const FALLBACK_NOTES = [60, 62, 64];
/** Giai điệu bí ẩn: tầm tối đa (bán cung) — rộng hơn thì khó nhớ. */
const ECHO_MAX_SPAN = 12;

/** Các nốt (MIDI) xuất hiện trong bài đọc nốt và bài chơi có xét cao độ của buổi. */
export function lessonPitches(lesson: CurriculumLesson): number[] {
  const set = new Set<number>();
  for (const ex of lesson.exercises) {
    if (ex.kind === 'note-reading') ex.sequence.forEach((p) => set.add(requireMidi(p)));
    if (ex.kind === 'play' && ex.mode !== 'rhythm') {
      for (const n of lessonTimeline(pieceToLesson(ex.piece, ex.id))) if (n.midiNote !== null) set.add(n.midiNote);
    }
  }
  return [...set].sort((a, b) => a - b);
}

/** Bàn phím từ nốt Đô ≤ nốt thấp nhất tới nốt Si ≥ nốt cao nhất (đủ quãng 8, phím trắng ở hai đầu). */
export function keyboardFor(notes: readonly number[]): Keyboard {
  const lo = Math.min(...notes);
  const hi = Math.max(...notes);
  const from = lo - midiToPitchClass(lo);
  return { from, to: Math.max(hi + (11 - midiToPitchClass(hi)), from + 11) };
}

/** Nốt của buổi; quá ít thì thêm nốt các buổi gần trước đó (rồi Đô – Rê – Mi). */
export function notePool(lesson: CurriculumLesson, earlier: readonly CurriculumLesson[] = []): number[] {
  const set = new Set(lessonPitches(lesson));
  for (const l of earlier.slice(-LOOKBACK).reverse()) {
    if (set.size >= MIN_NOTES) break;
    lessonPitches(l).forEach((m) => set.add(m));
  }
  if (set.size < MIN_NOTES) FALLBACK_NOTES.forEach((m) => set.add(m));
  return [...set].sort((a, b) => a - b);
}

/** Trò Hứng nốt rơi / Săn phím (trò chính khi buổi không có bài tiết tấu hay đọc nốt). */
export function gameForLesson(lesson: CurriculumLesson, earlier: readonly CurriculumLesson[] = []): GameSpec {
  const own = lessonPitches(lesson);
  if (own.length >= MIN_NOTES) return { kind: 'note-catch', keyboard: keyboardFor(own), notes: own };
  const keyQuizzes = lesson.exercises.filter((e) => e.kind === 'key-quiz');
  if (keyQuizzes.length > 0) return { kind: 'key-hunt', keyboard: keyQuizzes[0].keyboard, rounds: keyQuizzes.flatMap((e) => e.rounds) };
  const notes = notePool(lesson, earlier);
  return { kind: 'note-catch', keyboard: keyboardFor(notes), notes };
}

/** Các nốt quanh nốt giữa của dãy, trong tầm `ECHO_MAX_SPAN`. */
function echoNotes(pool: readonly number[]): number[] {
  const mid = pool[Math.floor((pool.length - 1) / 2)];
  const lo = pool.filter((m) => m >= mid - ECHO_MAX_SPAN / 2 && m <= mid + ECHO_MAX_SPAN / 2);
  return lo.length >= 2 ? lo : pool.slice(0, 2);
}

/** Trò chính của buổi rồi tới "Giai điệu bí ẩn". `earlier`: các buổi trước buổi này (theo thứ tự học). */
export function gamesForLesson(lesson: CurriculumLesson, earlier: readonly CurriculumLesson[] = []): GameSpec[] {
  const rhythm = lesson.exercises.find((e) => e.kind === 'play' && e.mode === 'rhythm');
  const reading = lesson.exercises.filter((e) => e.kind === 'note-reading');
  let primary: GameSpec;
  if (rhythm && rhythm.kind === 'play') {
    primary = { kind: 'rhythm-train', piece: rhythm.piece };
  } else if (reading.length > 0) {
    const clef = reading[0].clef;
    const notes = [...new Set(reading.filter((e) => e.clef === clef).flatMap((e) => e.sequence.map(requireMidi)))].sort((a, b) => a - b);
    primary = { kind: 'staff-shoot', keyboard: keyboardFor(notes), clef, notes };
  } else {
    primary = gameForLesson(lesson, earlier);
  }
  const echo = echoNotes(notePool(lesson, earlier));
  return [primary, { kind: 'echo-melody', keyboard: keyboardFor(echo), notes: echo }];
}
