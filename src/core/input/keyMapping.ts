/**
 * Ánh xạ bàn phím máy tính → nốt cho demo mode (Windows, không cần đàn):
 *   hàng giữa  A S D F G H J K L ;  = phím trắng từ Đô
 *   hàng trên  W E   T Y U   O P    = phím đen
 *   Z / X = dịch xuống / lên một quãng tám.
 */
const KEY_OFFSETS: Record<string, number> = {
  a: 0, w: 1, s: 2, e: 3, d: 4, f: 5, t: 6, g: 7, y: 8, h: 9, u: 10, j: 11,
  k: 12, o: 13, l: 14, p: 15, ';': 16,
};

export function keyToMidi(key: string, baseC: number): number | null {
  const off = KEY_OFFSETS[key.toLowerCase()];
  return off === undefined ? null : baseC + off;
}

export function keyHintsFor(baseC: number): Map<number, string> {
  return new Map(Object.entries(KEY_OFFSETS).map(([k, off]) => [baseC + off, k]));
}

/** Chọn nốt Đô gốc sao cho cửa sổ 17 nửa cung bao được nhiều nốt của bài nhất. */
export function chooseBaseC(midis: number[]): number {
  const lowest = Math.min(...midis);
  const c0 = lowest - (((lowest % 12) + 12) % 12);
  const candidates = [c0, c0 + 12];
  const covered = (base: number) => midis.filter((m) => m >= base && m <= base + 16).length;
  return candidates.reduce((best, c) => (covered(c) > covered(best) ? c : best), c0);
}

/** Phạm vi bàn phím ảo: từ Đô của nốt thấp nhất tới Si của nốt cao nhất, tối thiểu 2 quãng tám. */
export function keyboardRange(midis: number[]): { from: number; to: number } {
  const lo = Math.min(...midis);
  const hi = Math.max(...midis);
  const from = lo - (((lo % 12) + 12) % 12);
  const to = Math.max(hi - (((hi % 12) + 12) % 12) + 11, from + 23);
  return { from, to };
}
