/**
 * Nội dung trò Flappy Note: mỗi màn là một tập nốt (thường là một thế tay 5 ngón → có số ngón gợi ý)
 * + vài chuỗi nốt (giai điệu tự soạn hoặc phạm vi công cộng) cho chế độ "Chuỗi nốt".
 * Độ khó (trọng lực, tốc độ, khe ống) tách riêng ở `FlappyNoteGame.ts` — cùng nội dung chơi được ở mọi độ khó.
 */
import type { Clef, Finger } from '../lessons/types';
import { requireMidi } from '../music/notes';

export type Hand = 'right' | 'left';

export interface FlappyNote {
  midi: number;
  /** Tên nốt khoa học ("C4"). */
  pitch: string;
  hand: Hand;
  /** Ngón gợi ý theo thế tay của màn; không có → người chơi tự chọn ngón. */
  finger?: Finger;
  clef: Clef;
}

export interface FlappyMelody {
  id: string;
  label: string;
  /** Tên nốt theo thứ tự; mọi nốt phải có trong màn. */
  pitches: readonly string[];
  source: string;
}

export interface FlappyLevel {
  id: string;
  label: string;
  description: string;
  notes: readonly FlappyNote[];
  melodies: readonly FlappyMelody[];
}

/** Thế tay 5 ngón: nốt thứ i dưới ngón i (tay phải) / ngón 5 − i (tay trái), từ thấp lên cao. */
function position(pitches: readonly string[], hand: Hand): FlappyNote[] {
  return pitches.map((pitch, i) => ({
    midi: requireMidi(pitch),
    pitch,
    hand,
    finger: (hand === 'right' ? i + 1 : 5 - i) as Finger,
    clef: hand === 'right' ? 'treble' : 'bass',
  }));
}

const split = (s: string) => s.trim().split(/\s+/);
const SELF = 'VietPiano tự soạn';

export const FLAPPY_LEVELS: readonly FlappyLevel[] = [
  {
    id: 'rh-do-re-mi',
    label: 'Bước 1 · Đô Rê Mi',
    description: 'Tay phải, ngón 1 – 2 – 3 trên Đô4 Rê4 Mi4',
    notes: position(split('C4 D4 E4'), 'right'),
    melodies: [
      { id: 'up-down', label: 'Đô Rê Mi Rê Đô', pitches: split('C4 D4 E4 D4 C4 D4 E4 E4'), source: SELF },
      { id: 'hot-cross-buns', label: 'Hot Cross Buns', pitches: split('E4 D4 C4 E4 D4 C4 C4 C4 C4 C4 D4 D4 D4 D4 E4 D4 C4'), source: 'Dân ca Anh — phạm vi công cộng' },
    ],
  },
  {
    id: 'rh-c-position',
    label: 'Thế Đô tay phải',
    description: 'Đô4 → Sol4, ngón 1 → 5',
    notes: position(split('C4 D4 E4 F4 G4'), 'right'),
    melodies: [
      { id: 'five-steps', label: 'Lên xuống năm ngón', pitches: split('C4 D4 E4 F4 G4 F4 E4 D4'), source: SELF },
      { id: 'ode-to-joy', label: 'Ode to Joy', pitches: split('E4 E4 F4 G4 G4 F4 E4 D4 C4 C4 D4 E4 E4 D4 D4'), source: 'L. v. Beethoven (1824) — phạm vi công cộng' },
      { id: 'mary', label: 'Mary Had a Little Lamb', pitches: split('E4 D4 C4 D4 E4 E4 E4 D4 D4 D4 E4 G4 G4'), source: 'Dân ca Mỹ — phạm vi công cộng' },
    ],
  },
  {
    id: 'lh-c-position',
    label: 'Thế Đô tay trái',
    description: 'Đô3 → Sol3 trên khuông Fa, ngón 5 → 1',
    notes: position(split('C3 D3 E3 F3 G3'), 'left'),
    melodies: [
      { id: 'five-steps', label: 'Lên xuống năm ngón', pitches: split('C3 D3 E3 F3 G3 F3 E3 D3'), source: SELF },
      { id: 'stairs', label: 'Bậc thang đi xuống', pitches: split('G3 F3 E3 D3 C3 E3 G3 C3'), source: SELF },
    ],
  },
  {
    id: 'both-c-position',
    label: 'Hai tay thế Đô',
    description: 'Tay trái Đô3 → Sol3, tay phải Đô4 → Sol4',
    notes: [...position(split('C3 D3 E3 F3 G3'), 'left'), ...position(split('C4 D4 E4 F4 G4'), 'right')],
    melodies: [{ id: 'call-answer', label: 'Gọi – đáp hai tay', pitches: split('C4 E4 G4 G3 E3 C3 D4 F4 G3 F3 D3 C4'), source: SELF }],
  },
  {
    id: 'rh-g-position',
    label: 'Thế Sol tay phải',
    description: 'Sol4 → Rê5, ngón 1 → 5',
    notes: position(split('G4 A4 B4 C5 D5'), 'right'),
    melodies: [{ id: 'five-steps', label: 'Lên xuống năm ngón', pitches: split('G4 A4 B4 C5 D5 C5 B4 A4'), source: SELF }],
  },
  {
    id: 'treble-wide',
    label: 'Khuông Sol rộng',
    description: 'Đô4 → La5, phím trắng, tự chọn ngón',
    notes: split('C4 D4 E4 F4 G4 A4 B4 C5 D5 E5 F5 G5 A5').map((pitch) => ({ midi: requireMidi(pitch), pitch, hand: 'right' as const, clef: 'treble' as const })),
    melodies: [],
  },
];

export function findLevel(id: string): FlappyLevel | undefined {
  return FLAPPY_LEVELS.find((l) => l.id === id);
}

/** Chuỗi nốt của giai điệu (nốt của màn, theo thứ tự). */
export function melodyNotes(level: FlappyLevel, melody: FlappyMelody): FlappyNote[] {
  return melody.pitches.map((p) => {
    const n = level.notes.find((x) => x.pitch === p);
    if (!n) throw new Error(`Nốt ${p} không có trong màn ${level.id}`);
    return n;
  });
}

export const FINGER_NAME: Record<Finger, string> = { 1: 'ngón cái', 2: 'ngón trỏ', 3: 'ngón giữa', 4: 'ngón áp út', 5: 'ngón út' };
