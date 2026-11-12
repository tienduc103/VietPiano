/**
 * "Đố bé nốt gì?" — vị trí nốt trên khuông theo khoá (Sol, Fa, Đô Alto, Đô Tenor), tên nốt / trường độ cho bé.
 * Logic thuần: vị trí tính theo bậc diatonic so với dòng kẻ dưới cùng của khoá → test được độc lập với VexFlow
 * (e2e so số này với vị trí VexFlow vẽ thật).
 */
import { LETTER_TO_SOLFEGE } from '../music/notes';

export type Letter = 'C' | 'D' | 'E' | 'F' | 'G' | 'A' | 'B';
export const LETTERS: readonly Letter[] = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
const LETTER_PC: Record<Letter, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

/** Tên Đô Rê Mi (chữ hiển thị và câu cô đọc dùng chung). */
export const SOLFEGE_NAME: Record<Letter, string> = LETTER_TO_SOLFEGE as Record<Letter, string>;

export type QuizClef = 'treble' | 'bass' | 'alto' | 'tenor';
export const QUIZ_CLEFS: readonly QuizClef[] = ['treble', 'bass', 'alto', 'tenor'];
export const CLEF_LABEL: Record<QuizClef, string> = { treble: 'Khoá Sol', bass: 'Khoá Fa', alto: 'Khoá Đô Alto', tenor: 'Khoá Đô Tenor' };

/** Trường độ dùng trong trò (nốt đơn, không chấm dôi): Tròn, Trắng, Đen, Móc đơn, Móc đôi — dài → ngắn. */
export type QuizDuration = 'w' | 'h' | 'q' | '8' | '16';
export const QUIZ_DURATIONS: readonly QuizDuration[] = ['w', 'h', 'q', '8', '16'];
/** Tên trường độ như giáo trình "Làm quen từng nốt" (viết hoa như câu hỏi của cô: "nốt Đô Tròn"). */
export const DURATION_NAME: Record<QuizDuration, string> = { w: 'Tròn', h: 'Trắng', q: 'Đen', '8': 'Móc đơn', '16': 'Móc đôi' };
/** Số phách (nhịp 4/4) — để giải thích sau khi bé trả lời và độ dài tiếng đàn phát lại. */
export const DURATION_BEATS: Record<QuizDuration, number> = { w: 4, h: 2, q: 1, '8': 0.5, '16': 0.25 };
export const DURATION_LOOK: Record<QuizDuration, string> = {
  w: 'đầu nốt rỗng, không có đuôi',
  h: 'đầu nốt rỗng, có đuôi',
  q: 'đầu nốt tô đen, có đuôi',
  '8': 'đầu nốt tô đen, có đuôi và một móc',
  '16': 'đầu nốt tô đen, có đuôi và hai móc',
};

/** Bậc diatonic tuyệt đối (C0 = 0, D0 = 1 …). Chỉ dùng cho phím trắng. */
export function diatonic(midi: number): number {
  const pc = ((midi % 12) + 12) % 12;
  const letter = LETTERS.find((l) => LETTER_PC[l] === pc);
  if (!letter) throw new Error(`MIDI ${midi} không phải phím trắng`);
  return Math.floor(midi / 12 - 1) * 7 + LETTERS.indexOf(letter);
}

export function letterOf(midi: number): Letter {
  return LETTERS[((diatonic(midi) % 7) + 7) % 7];
}

/** MIDI của nốt `letter` ở quãng tám `octave` (C4 = 60). */
export function midiOf(letter: Letter, octave: number): number {
  return (octave + 1) * 12 + LETTER_PC[letter];
}

/** Nốt nằm trên dòng kẻ dưới cùng của từng khoá: Sol E4, Fa G2, Đô Alto F3, Đô Tenor D3. */
const BOTTOM_LINE: Record<QuizClef, number> = { treble: midiOf('E', 4), bass: midiOf('G', 2), alto: midiOf('F', 3), tenor: midiOf('D', 3) };

/**
 * Vị trí nốt trên khuông: số bậc tính từ dòng kẻ dưới cùng (0 = dòng 1, 1 = khe 1, 2 = dòng 2 … 8 = dòng 5).
 * Âm = dưới khuông, > 8 = trên khuông. Số chẵn = nằm trên dòng kẻ, số lẻ = nằm trong khe.
 */
export function staffStep(midi: number, clef: QuizClef): number {
  return diatonic(midi) - diatonic(BOTTOM_LINE[clef]);
}

/** Số dòng kẻ phụ nốt cần (0 nếu nằm trong khuông). */
export function ledgerLines(step: number): number {
  if (step <= -2) return Math.floor(-step / 2);
  if (step >= 10) return Math.floor((step - 8) / 2);
  return 0;
}

/**
 * Dải nốt (phím trắng) của mỗi khoá: một quãng tám từ Đô, chọn sao cho ít dòng kẻ phụ nhất mà vẫn có nốt Đô của khoá;
 * hai quãng tám thì mở thêm về phía còn chỗ (Sol lên trên, Fa xuống dưới, Đô Alto xuống, Đô Tenor lên).
 */
export function clefRange(clef: QuizClef, octaves: 1 | 2): { from: number; to: number } {
  const one: Record<QuizClef, [number, number]> = {
    treble: [midiOf('C', 4), midiOf('B', 4)],
    bass: [midiOf('C', 3), midiOf('B', 3)],
    alto: [midiOf('C', 4), midiOf('B', 4)],
    tenor: [midiOf('C', 3), midiOf('B', 3)],
  };
  const [from, to] = one[clef];
  if (octaves === 1) return { from, to };
  return clef === 'treble' || clef === 'tenor' ? { from, to: to + 12 } : { from: from - 12, to };
}

/** Các phím trắng của dải. */
export function clefPitches(clef: QuizClef, octaves: 1 | 2): number[] {
  const { from, to } = clefRange(clef, octaves);
  const out: number[] = [];
  for (let m = from; m <= to; m++) if ([0, 2, 4, 5, 7, 9, 11].includes(m % 12)) out.push(m);
  return out;
}

/** Giải thích vị trí nốt (hiện SAU khi bé trả lời): "nằm trên dòng kẻ thứ 2", "nằm ở khe thứ 3", "dòng kẻ phụ thứ 1 dưới khuông". */
export function positionText(midi: number, clef: QuizClef): string {
  const s = staffStep(midi, clef);
  if (s >= 0 && s <= 8) return s % 2 === 0 ? `nằm trên dòng kẻ thứ ${s / 2 + 1}` : `nằm ở khe thứ ${(s + 1) / 2}`;
  if (s === -1) return 'nằm ngay dưới dòng kẻ thứ 1';
  if (s === 9) return 'nằm ngay trên dòng kẻ thứ 5';
  const below = s < 0;
  const n = ledgerLines(s);
  const onLedger = s % 2 === 0;
  const where = below ? 'dưới khuông' : 'trên khuông';
  return onLedger ? `nằm trên dòng kẻ phụ thứ ${n} ${where}` : `nằm ${below ? 'dưới' : 'trên'} dòng kẻ phụ thứ ${n} ${where}`;
}
