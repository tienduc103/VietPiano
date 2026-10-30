/**
 * Nội dung trò "Bóng bay nốt nhạc": tập nốt theo chế độ, cách so nốt, số ngón gợi ý, tên nốt.
 *
 * - `one-hand`   1 tay · 5 nốt (Đô → Sol, thế Đô), chọn tay phải / trái.
 * - `two-hands`  2 tay · 5 nốt: tay trái Đô3 → Sol3, tay phải Đô4 → Sol4 (mỗi bóng ghi tay cần đánh).
 * - `seven`      1–2 tay · 7 nốt Đô → Si: tay phải / trái / hai tay.
 * - `full`       2 tay full phím: phím trắng Đô2 → Đô6, phải đúng quãng tám (C2 ≠ C3).
 * Ba chế độ đầu chỉ phân biệt tên nốt C D E F G A B (đánh Đô ở quãng nào cũng được).
 */
import type { Finger } from '../lessons/types';
import { midiToOctave, midiToPitchClass } from '../music/notes';

export type BalloonMode = 'one-hand' | 'two-hands' | 'seven' | 'full';
export const BALLOON_MODES: readonly BalloonMode[] = ['one-hand', 'two-hands', 'seven', 'full'];
export type BalloonHand = 'right' | 'left';
/** Tay luyện ở chế độ có lựa chọn tay (`both` chỉ ở chế độ 7 nốt). */
export type HandChoice = BalloonHand | 'both';
export type BalloonLabelStyle = 'letter' | 'solfege';

export const MODE_INFO: Record<BalloonMode, { label: string; description: string; hands: readonly HandChoice[] }> = {
  'one-hand': { label: '1 tay · 5 nốt', description: 'Đô Rê Mi Pha Sol một tay, thế Đô — chỉ cần đúng tên nốt', hands: ['right', 'left'] },
  'two-hands': { label: '2 tay · 5 nốt', description: 'Tay trái Đô3 → Sol3, tay phải Đô4 → Sol4 — chỉ cần đúng tên nốt', hands: [] },
  seven: { label: '1–2 tay · 7 nốt', description: 'Đủ 7 nốt Đô → Si (luồn ngón cái) — chỉ cần đúng tên nốt', hands: ['right', 'left', 'both'] },
  full: { label: '2 tay · full phím', description: 'Phím trắng Đô2 → Đô6 — phải đúng phím, đúng quãng tám (C2, C3, C4…)', hands: [] },
};

export const HAND_LABEL: Record<HandChoice, string> = { right: 'Tay phải', left: 'Tay trái', both: 'Hai tay' };

export type Letter = 'C' | 'D' | 'E' | 'F' | 'G' | 'A' | 'B';
export const LETTERS: readonly Letter[] = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
/** Tên đọc của trò (theo cách gọi quen thuộc ở Việt Nam). */
export const SOLFEGE: Record<Letter, string> = { C: 'Đô', D: 'Rê', E: 'Mi', F: 'Pha', G: 'Sol', A: 'La', B: 'Si' };
const WHITE_PCS = [0, 2, 4, 5, 7, 9, 11];

/** Ngón theo thế tay: 5 nốt = thế Đô; 7 nốt = ngón gam Đô trưởng (tay phải luồn ngón cái ở Pha, tay trái bắc ngón 3 ở La). */
const FINGERS: Record<BalloonHand, readonly Finger[]> = { right: [1, 2, 3, 1, 2, 3, 4], left: [5, 4, 3, 2, 1, 3, 2] };
const FIVE_FINGERS: Record<BalloonHand, readonly Finger[]> = { right: [1, 2, 3, 4, 5], left: [5, 4, 3, 2, 1] };

export interface BalloonNote {
  midi: number;
  letter: Letter;
  hand: BalloonHand;
  finger: Finger;
}

/** Tên nốt của phím trắng; phím đen → null. */
export function letterOf(midi: number): Letter | null {
  const i = WHITE_PCS.indexOf(midiToPitchClass(midi));
  return i < 0 ? null : LETTERS[i];
}

/** Quãng tám mặc định của mỗi tay (chế độ chỉ xét tên nốt): trái Đô3, phải Đô4. */
const HAND_C: Record<BalloonHand, number> = { left: 48, right: 60 };

function octave(hand: BalloonHand, count: 5 | 7): BalloonNote[] {
  const fingers = count === 5 ? FIVE_FINGERS[hand] : FINGERS[hand];
  return LETTERS.slice(0, count).map((letter, i) => ({ midi: HAND_C[hand] + WHITE_PCS[i], letter, hand, finger: fingers[i] }));
}

/** Tập nốt bốc ngẫu nhiên cho bóng. */
export function notePool(mode: BalloonMode, hand: HandChoice = 'right'): BalloonNote[] {
  switch (mode) {
    case 'one-hand':
      return octave(hand === 'left' ? 'left' : 'right', 5);
    case 'two-hands':
      return [...octave('left', 5), ...octave('right', 5)];
    case 'seven':
      return hand === 'both' ? [...octave('left', 7), ...octave('right', 7)] : octave(hand, 7);
    case 'full': {
      const out: BalloonNote[] = [];
      for (let m = 36; m <= 84; m++) {
        const letter = letterOf(m);
        if (!letter) continue;
        const h: BalloonHand = m < 60 ? 'left' : 'right';
        out.push({ midi: m, letter, hand: h, finger: FINGERS[h][LETTERS.indexOf(letter)] });
      }
      return out;
    }
  }
}

/** Full phím: so đúng phím; chế độ khác: chỉ so tên nốt (phím đen không khớp nốt nào). */
export const exactPitch = (mode: BalloonMode) => mode === 'full';

/** Khoá so nốt: hai bóng cùng khoá không bay cùng lúc (một lần đánh không biết nổ quả nào). */
export function matchKey(mode: BalloonMode, midi: number): number {
  return exactPitch(mode) ? midi : midiToPitchClass(midi);
}

export function matches(mode: BalloonMode, note: BalloonNote, midi: number): boolean {
  return letterOf(midi) !== null && matchKey(mode, midi) === matchKey(mode, note.midi);
}

/** Tên nốt: "C" / "Đô", kèm quãng tám ("C4" / "Đô4") khi `withOctave`. Phím đen → "". */
export function noteName(midi: number, style: BalloonLabelStyle, withOctave: boolean): string {
  const letter = letterOf(midi);
  if (!letter) return '';
  return `${style === 'letter' ? letter : SOLFEGE[letter]}${withOctave ? midiToOctave(midi) : ''}`;
}

/** Bàn phím hiện trên màn chơi. */
export function keyboardRange(mode: BalloonMode, hand: HandChoice = 'right'): { from: number; to: number } {
  if (mode === 'full') return { from: 36, to: 84 };
  const hands = new Set(notePool(mode, hand).map((n) => n.hand));
  return { from: hands.has('left') ? 48 : 60, to: hands.has('right') ? 71 : 59 };
}
