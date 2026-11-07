/**
 * Ký hiệu hợp âm kiểu lead sheet: "C", "G7/B", "Fm/Ab", "C6", "G9", "C7/Bb".
 * Dùng để hiển thị (dấu hoá ♭ ♯) và để test kiểm tra phần đệm đúng hợp âm ghi trên khuông.
 */

const LETTER_PC: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

/** Quãng (nửa cung từ nốt gốc) của từng loại hợp âm hỗ trợ. */
const QUALITY: Record<string, number[]> = {
  '': [0, 4, 7],
  m: [0, 3, 7],
  '7': [0, 4, 7, 10],
  m7: [0, 3, 7, 10],
  maj7: [0, 4, 7, 11],
  '6': [0, 4, 7, 9],
  m6: [0, 3, 7, 9],
  '9': [0, 4, 7, 10, 2],
  add9: [0, 4, 7, 2],
  sus4: [0, 5, 7],
  dim: [0, 3, 6],
};

export interface ParsedChord {
  /** Lớp cao độ (0 = Đô) của nốt gốc. */
  root: number;
  /** Lớp cao độ của nốt trầm (có "/" thì là nốt sau "/", không thì là nốt gốc). */
  bass: number;
  /** Mọi lớp cao độ của hợp âm (gồm cả nốt trầm). */
  tones: number[];
}

function pitchClass(name: string): number {
  const m = /^([A-G])([#b]?)$/.exec(name);
  if (!m) throw new Error(`Tên nốt không hợp lệ trong ký hiệu hợp âm: "${name}"`);
  return (LETTER_PC[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0) + 12) % 12;
}

export function parseChordSymbol(symbol: string): ParsedChord {
  const m = /^([A-G][#b]?)([a-z0-9]*)(?:\/([A-G][#b]?))?$/.exec(symbol);
  if (!m) throw new Error(`Ký hiệu hợp âm không hợp lệ: "${symbol}"`);
  const intervals = QUALITY[m[2]];
  if (!intervals) throw new Error(`Chưa hỗ trợ loại hợp âm "${m[2]}" (${symbol})`);
  const root = pitchClass(m[1]);
  const bass = m[3] ? pitchClass(m[3]) : root;
  const tones = [...new Set([...intervals.map((i) => (root + i) % 12), bass])];
  return { root, bass, tones };
}

/** Hiển thị: "Bb" → "B♭", "F#m" → "F♯m". */
export function displayChordSymbol(symbol: string): string {
  return symbol.replace(/([A-G])b/g, '$1♭').replace(/([A-G])#/g, '$1♯');
}
