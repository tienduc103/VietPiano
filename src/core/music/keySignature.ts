/**
 * Hoá biểu (key signature) và quy tắc hiển thị dấu hoá bất thường.
 * Tên giọng theo định dạng VexFlow: "C", "G", "Bb", "Em", "Dm", ...
 */

/** Số dấu hoá của mỗi giọng: dương = số dấu thăng, âm = số dấu giáng. */
export const KEY_SIGNATURES = {
  C: 0, Am: 0,
  G: 1, Em: 1,
  D: 2, Bm: 2,
  A: 3, 'F#m': 3,
  E: 4, 'C#m': 4,
  B: 5, 'G#m': 5,
  'F#': 6, 'D#m': 6,
  'C#': 7, 'A#m': 7,
  F: -1, Dm: -1,
  Bb: -2, Gm: -2,
  Eb: -3, Cm: -3,
  Ab: -4, Fm: -4,
  Db: -5, Bbm: -5,
  Gb: -6, Ebm: -6,
  Cb: -7, Abm: -7,
} as const;

export type KeySignature = keyof typeof KEY_SIGNATURES;

/** Dấu hoá hiển thị cạnh nốt: thăng, giáng, hoàn, hoặc không có. */
export type DisplayAccidental = '#' | 'b' | 'n' | null;

type Alter = '' | '#' | 'b';

const SHARP_ORDER = 'FCGDAEB';
const FLAT_ORDER = 'BEADGCF';

/** Dấu hoá mà hoá biểu áp cho từng chữ cái nốt, vd Dm → { B: 'b' }. */
export function keyAlterations(key: KeySignature): Record<string, Alter> {
  const count = KEY_SIGNATURES[key];
  const result: Record<string, Alter> = {};
  const letters = count > 0 ? SHARP_ORDER.slice(0, count) : FLAT_ORDER.slice(0, -count);
  for (const letter of letters) result[letter] = count > 0 ? '#' : 'b';
  return result;
}

/**
 * Dấu hoá cần vẽ cho từng nốt của MỘT ô nhịp.
 * Nốt đúng theo hoá biểu thì không vẽ dấu; dấu hoá bất thường giữ hiệu lực tới hết ô nhịp
 * cho cùng cao độ (chữ cái + quãng tám), nên khi trở lại cao độ theo hoá biểu phải vẽ dấu hoàn.
 */
export function measureAccidentals(pitches: string[], key: KeySignature = 'C'): DisplayAccidental[] {
  const fromKey = keyAlterations(key);
  const inEffect = new Map<string, Alter>();
  return pitches.map((pitch) => {
    const m = /^([A-G])([#b]?)(-?\d)$/.exec(pitch);
    if (!m) throw new Error(`Tên nốt không hợp lệ: "${pitch}"`);
    const [, letter, alter, octave] = m as unknown as [string, string, Alter, string];
    const slot = letter + octave;
    const current = inEffect.get(slot) ?? fromKey[letter] ?? '';
    if (current === alter) return null;
    inEffect.set(slot, alter);
    return alter === '' ? 'n' : alter;
  });
}
