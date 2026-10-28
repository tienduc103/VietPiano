/**
 * Trò chơi sau mỗi buổi: suy từ nội dung buổi (không soạn tay cho từng buổi).
 *  - Buổi có ≥ 3 nốt khác nhau (đọc nốt, chơi theo khuông) → "Hứng nốt rơi" với chính các nốt đó.
 *  - Ít nốt nhưng có bài tìm phím → "Săn phím" với các lượt tìm phím của buổi.
 *  - Còn lại (vd buổi tiết tấu chỉ gõ một nốt) → "Hứng nốt rơi" với nốt của các buổi gần trước đó.
 */
import { lessonTimeline, pieceToLesson } from '../curriculum/piece';
import type { CurriculumLesson, KeyQuizRound } from '../curriculum/types';
import { midiToPitchClass, requireMidi } from '../music/notes';

export type GameSpec =
  | { kind: 'note-catch'; keyboard: { from: number; to: number }; notes: number[] }
  | { kind: 'key-hunt'; keyboard: { from: number; to: number }; rounds: KeyQuizRound[] };

export type GameKind = GameSpec['kind'];

export const GAME_TITLE: Record<GameKind, string> = { 'note-catch': 'Hứng nốt rơi', 'key-hunt': 'Săn phím' };

const MIN_NOTES = 3;
/** Số buổi gần trước được lấy nốt khi buổi này quá ít nốt. */
const LOOKBACK = 4;
const FALLBACK_NOTES = [60, 62, 64];

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
export function keyboardFor(notes: readonly number[]): { from: number; to: number } {
  const lo = Math.min(...notes);
  const hi = Math.max(...notes);
  const from = lo - midiToPitchClass(lo);
  return { from, to: Math.max(hi + (11 - midiToPitchClass(hi)), from + 11) };
}

/** `earlier`: các buổi trước buổi này (theo thứ tự học), dùng khi buổi này quá ít nốt. */
export function gameForLesson(lesson: CurriculumLesson, earlier: readonly CurriculumLesson[] = []): GameSpec {
  const own = lessonPitches(lesson);
  if (own.length >= MIN_NOTES) return { kind: 'note-catch', keyboard: keyboardFor(own), notes: own };

  const keyQuizzes = lesson.exercises.filter((e) => e.kind === 'key-quiz');
  if (keyQuizzes.length > 0) {
    return { kind: 'key-hunt', keyboard: keyQuizzes[0].keyboard, rounds: keyQuizzes.flatMap((e) => e.rounds) };
  }

  const set = new Set(own);
  for (const l of earlier.slice(-LOOKBACK).reverse()) {
    if (set.size >= MIN_NOTES) break;
    lessonPitches(l).forEach((m) => set.add(m));
  }
  if (set.size < MIN_NOTES) FALLBACK_NOTES.forEach((m) => set.add(m));
  const notes = [...set].sort((a, b) => a - b);
  return { kind: 'note-catch', keyboard: keyboardFor(notes), notes };
}
