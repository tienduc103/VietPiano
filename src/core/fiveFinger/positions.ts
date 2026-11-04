/**
 * Vị trí bàn tay 5 ngón: 5 phím liền nhau theo một giọng (ngũ âm đầu của gam trưởng / thứ).
 * Tay phải: ngón 1 (cái) ở phím thấp nhất → ngón = chỉ số + 1.
 * Tay trái: ngón 5 (út) ở phím thấp nhất → ngón = 5 − chỉ số.
 * Chuỗi luyện tập lưu theo CHỈ SỐ phím trong vị trí (0–4) để đổi vị trí / tay không phải sinh lại.
 */

import type { Finger, Hand } from '../lessons/types';
import type { KeySignature } from '../music/keySignature';

export type PositionId = 'C' | 'G' | 'D' | 'F' | 'Am' | 'Dm';

export interface HandPositionDef {
  id: PositionId;
  /** Tên hiển thị (tiếng Việt). */
  label: string;
  /** Hoá biểu dùng khi vẽ khuông nhạc. */
  keySignature: KeySignature;
  /** Tên 5 phím (chữ cái + dấu hoá), từ thấp lên cao. */
  letters: readonly [string, string, string, string, string];
  /** Khoảng cách nửa cung từ phím thấp nhất. */
  offsets: readonly [number, number, number, number, number];
  /** Nốt thấp nhất ở quãng tám 4 (MIDI). */
  baseMidi4: number;
}

export const HAND_POSITIONS: readonly HandPositionDef[] = [
  { id: 'C', label: 'Thế Đô (Đô – Sol)', keySignature: 'C', letters: ['C', 'D', 'E', 'F', 'G'], offsets: [0, 2, 4, 5, 7], baseMidi4: 60 },
  { id: 'G', label: 'Thế Sol (Sol – Rê)', keySignature: 'G', letters: ['G', 'A', 'B', 'C', 'D'], offsets: [0, 2, 4, 5, 7], baseMidi4: 67 },
  { id: 'D', label: 'Thế Rê trưởng (Fa thăng)', keySignature: 'D', letters: ['D', 'E', 'F#', 'G', 'A'], offsets: [0, 2, 4, 5, 7], baseMidi4: 62 },
  { id: 'F', label: 'Thế Fa (Si giáng)', keySignature: 'F', letters: ['F', 'G', 'A', 'Bb', 'C'], offsets: [0, 2, 4, 5, 7], baseMidi4: 65 },
  { id: 'Am', label: 'Thế La thứ (La – Mi)', keySignature: 'Am', letters: ['A', 'B', 'C', 'D', 'E'], offsets: [0, 2, 3, 5, 7], baseMidi4: 69 },
  { id: 'Dm', label: 'Thế Rê thứ (Rê – La)', keySignature: 'Dm', letters: ['D', 'E', 'F', 'G', 'A'], offsets: [0, 2, 3, 5, 7], baseMidi4: 62 },
];

export function positionDef(id: PositionId): HandPositionDef {
  return HAND_POSITIONS.find((p) => p.id === id) ?? HAND_POSITIONS[0];
}

export function isPositionId(v: unknown): v is PositionId {
  return HAND_POSITIONS.some((p) => p.id === v);
}

/** Vị trí bàn tay cụ thể: thế + quãng tám của phím thấp nhất. */
export interface HandPlacement {
  position: PositionId;
  /** Quãng tám của phím thấp nhất (tay phải mặc định 4, tay trái 3). */
  octave: number;
}

export const DEFAULT_PLACEMENT: Record<Hand, HandPlacement> = {
  right: { position: 'C', octave: 4 },
  left: { position: 'C', octave: 3 },
};

/** Quãng tám có thể chọn theo tay (tay phải khoá Sol, tay trái khoá Fa). */
export const OCTAVE_CHOICES: Record<Hand, readonly number[]> = { right: [4, 5], left: [2, 3] };

/** Tầm micro nhận được (như thư viện bài: MIDI 36–84). */
export const MIN_MIDI = 36;
export const MAX_MIDI = 84;

/** Quãng tám hợp lệ của một thế cho một tay: mọi phím nằm trong tầm micro. */
export function validOctaves(hand: Hand, position: PositionId): number[] {
  return OCTAVE_CHOICES[hand].filter((octave) => {
    const keys = placementKeys({ position, octave });
    return keys[0] >= MIN_MIDI && keys[4] <= MAX_MIDI;
  });
}

/** 5 phím (MIDI) của một vị trí bàn tay. */
export function placementKeys(p: HandPlacement): number[] {
  const def = positionDef(p.position);
  const base = def.baseMidi4 + (p.octave - 4) * 12;
  return def.offsets.map((o) => base + o);
}

/** Tên khoa học của phím thứ `index` (vd "F#4", "Bb3") — đúng cách viết theo giọng. */
export function placementPitch(p: HandPlacement, index: number): string {
  const def = positionDef(p.position);
  const midi = placementKeys(p)[index];
  const letter = def.letters[index];
  // Quãng tám theo chữ cái (B#/Cb không xuất hiện ở các thế trên nên chỉ cần MIDI / 12).
  return `${letter}${Math.floor(midi / 12) - 1}`;
}

/** Ngón tay được hướng dẫn cho phím thứ `index` của vị trí. */
export function fingerFor(hand: Hand, index: number): Finger {
  return (hand === 'right' ? index + 1 : 5 - index) as Finger;
}

export function placementLabel(hand: Hand, p: HandPlacement): string {
  return `${positionDef(p.position).label} · ${hand === 'right' ? 'tay phải' : 'tay trái'} từ ${placementPitch(p, 0)}`;
}

export function sanitizePlacement(raw: unknown, hand: Hand): HandPlacement {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Partial<HandPlacement>;
  const position = isPositionId(r.position) ? r.position : DEFAULT_PLACEMENT[hand].position;
  const valid = validOctaves(hand, position);
  const wanted = typeof r.octave === 'number' ? r.octave : DEFAULT_PLACEMENT[hand].octave;
  const octave = valid.includes(wanted) ? wanted : valid.includes(DEFAULT_PLACEMENT[hand].octave) ? DEFAULT_PLACEMENT[hand].octave : valid[0];
  return { position, octave };
}

/**
 * Hai tay không được chồng phím (tay trái phải thấp hơn hẳn tay phải): nếu chồng thì hạ tay trái một quãng tám
 * (nếu còn trong tầm), không được nữa thì nâng tay phải.
 */
export function separateHands(left: HandPlacement, right: HandPlacement): { left: HandPlacement; right: HandPlacement } {
  const overlap = (l: HandPlacement, r: HandPlacement) => placementKeys(l)[4] >= placementKeys(r)[0];
  if (!overlap(left, right)) return { left, right };
  for (const octave of [...validOctaves('left', left.position)].sort((a, b) => b - a)) {
    const l = { ...left, octave };
    if (!overlap(l, right)) return { left: l, right };
  }
  for (const octave of validOctaves('right', right.position)) {
    const r = { ...right, octave };
    if (!overlap(left, r)) return { left, right: r };
  }
  return { left: DEFAULT_PLACEMENT.left, right: DEFAULT_PLACEMENT.right };
}
