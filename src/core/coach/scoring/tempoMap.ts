/**
 * Bản đồ tempo: phách (nốt đen) ↔ thời gian biểu diễn (ms), tuyến tính từng đoạn qua các mốc neo đơn điệu.
 * Ngoài khoảng mốc: ngoại suy theo độ dốc của đoạn đầu / cuối (hoặc tempo dự phòng khi chỉ có ≤ 1 mốc).
 * Dùng cho: cửa sổ khớp nốt, trường độ kỳ vọng theo tempo thật của người chơi, đổi pedal sang trục phách, con trỏ phát lại.
 */

export type MapPoint = [beat: number, ms: number];

export class TempoMap {
  readonly points: MapPoint[];
  private readonly fallbackMsPerBeat: number;

  /** `points` phải tăng ngặt theo cả phách lẫn ms (dùng `monotonicAnchors` trước). */
  constructor(points: readonly MapPoint[], fallbackMsPerBeat: number, origin: MapPoint = [0, 0]) {
    this.fallbackMsPerBeat = fallbackMsPerBeat;
    this.points = points.length ? points.map((p) => [p[0], p[1]] as MapPoint) : [origin];
  }

  private slope(i: number): number {
    const p = this.points;
    if (p.length < 2) return this.fallbackMsPerBeat;
    const a = p[Math.max(0, Math.min(i, p.length - 2))];
    const b = p[Math.max(1, Math.min(i + 1, p.length - 1))];
    const s = (b[1] - a[1]) / (b[0] - a[0]);
    return Number.isFinite(s) && s > 0 ? s : this.fallbackMsPerBeat;
  }

  msAt(beat: number): number {
    const p = this.points;
    if (p.length === 1) return p[0][1] + (beat - p[0][0]) * this.fallbackMsPerBeat;
    if (beat <= p[0][0]) return p[0][1] + (beat - p[0][0]) * this.slope(0);
    const last = p.length - 1;
    if (beat >= p[last][0]) return p[last][1] + (beat - p[last][0]) * this.slope(last - 1);
    let lo = 0;
    let hi = last;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (p[mid][0] <= beat) lo = mid;
      else hi = mid;
    }
    const [b0, m0] = p[lo];
    const [b1, m1] = p[hi];
    return m0 + ((beat - b0) / (b1 - b0)) * (m1 - m0);
  }

  beatAt(ms: number): number {
    const p = this.points;
    if (p.length === 1) return p[0][0] + (ms - p[0][1]) / this.fallbackMsPerBeat;
    if (ms <= p[0][1]) return p[0][0] + (ms - p[0][1]) / this.slope(0);
    const last = p.length - 1;
    if (ms >= p[last][1]) return p[last][0] + (ms - p[last][1]) / this.slope(last - 1);
    let lo = 0;
    let hi = last;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (p[mid][1] <= ms) lo = mid;
      else hi = mid;
    }
    const [b0, m0] = p[lo];
    const [b1, m1] = p[hi];
    return b0 + ((ms - m0) / (m1 - m0)) * (b1 - b0);
  }

  /**
   * Các thời điểm có thể của `beat` khi nó nằm giữa hai mốc: nội suy, ngoại suy từ mốc trái theo tempo trước đó, và từ mốc phải
   * theo tempo sau đó. Đoạn bình thường ba giá trị gần như trùng nhau; đoạn có chỗ ngắt / đổi tempo đột ngột (khoảng giữa hai mốc
   * dài bất thường) thì nốt có thể ở sát mốc trái hoặc sát mốc phải — cửa sổ khớp phủ cả hai.
   */
  candidates(beat: number): number[] {
    const p = this.points;
    const interp = this.msAt(beat);
    if (p.length < 2 || beat <= p[0][0] || beat >= p[p.length - 1][0]) return [interp];
    let lo = 0;
    while (lo + 1 < p.length - 1 && p[lo + 1][0] <= beat) lo++;
    const hi = lo + 1;
    if (Math.abs(p[lo][0] - beat) < 1e-9) return [p[lo][1]];
    const left = lo > 0 ? this.slope(lo - 1) : this.fallbackMsPerBeat;
    const right = hi < p.length - 1 ? this.slope(hi) : this.fallbackMsPerBeat;
    return [interp, p[lo][1] + (beat - p[lo][0]) * left, p[hi][1] - (p[hi][0] - beat) * right];
  }

  /** Độ dài một phách quanh `beat` (trung bình hai đoạn kề nhau → mượt hơn ở mốc). */
  msPerBeatAt(beat: number): number {
    const p = this.points;
    if (p.length < 2) return this.fallbackMsPerBeat;
    let i = 0;
    while (i + 1 < p.length - 1 && p[i + 1][0] <= beat) i++;
    const here = this.slope(i);
    const atPoint = p.findIndex((q) => Math.abs(q[0] - beat) < 1e-9);
    if (atPoint > 0 && atPoint < p.length - 1) return (this.slope(atPoint - 1) + this.slope(atPoint)) / 2;
    return here;
  }
}

/**
 * Giữ dãy con dài nhất tăng ngặt theo ms (mốc đã xếp theo phách tăng dần) — bỏ mốc khớp nhầm làm bản đồ đi lùi.
 * O(n log n).
 */
export function monotonicAnchors<T extends { beat: number; ms: number }>(anchors: readonly T[]): T[] {
  const sorted = [...anchors].sort((a, b) => a.beat - b.beat || a.ms - b.ms);
  // Bỏ trùng phách (giữ mốc đầu).
  const uniq = sorted.filter((a, i) => i === 0 || a.beat > sorted[i - 1].beat + 1e-9);
  const tails: number[] = [];
  const prev: number[] = new Array(uniq.length).fill(-1);
  const tailIdx: number[] = [];
  uniq.forEach((a, i) => {
    let lo = 0;
    let hi = tails.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (tails[mid] < a.ms) lo = mid + 1;
      else hi = mid;
    }
    tails[lo] = a.ms;
    tailIdx[lo] = i;
    prev[i] = lo > 0 ? tailIdx[lo - 1] : -1;
  });
  const out: T[] = [];
  let k = tailIdx[tails.length - 1] ?? -1;
  while (k >= 0) {
    out.push(uniq[k]);
    k = prev[k];
  }
  return out.reverse();
}

export function median(xs: readonly number[]): number {
  if (!xs.length) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** Hồi quy tuyến tính bình phương nhỏ nhất y = a + b·x; null khi < 2 điểm hoặc x trùng hết. */
export function linearFit(xs: readonly number[], ys: readonly number[]): { a: number; b: number } | null {
  const n = xs.length;
  if (n < 2) return null;
  let sx = 0;
  let sy = 0;
  for (let i = 0; i < n; i++) {
    sx += xs[i];
    sy += ys[i];
  }
  const mx = sx / n;
  const my = sy / n;
  let sxx = 0;
  let sxy = 0;
  for (let i = 0; i < n; i++) {
    sxx += (xs[i] - mx) ** 2;
    sxy += (xs[i] - mx) * (ys[i] - my);
  }
  if (sxx < 1e-12) return null;
  const b = sxy / sxx;
  return { a: my - b * mx, b };
}

/** Độ dốc Theil–Sen (trung vị độ dốc từng cặp) — bền với vài điểm lệch. Quá nhiều điểm → lấy mẫu đều. */
export function theilSenSlope(xs: readonly number[], ys: readonly number[], maxPairs = 60_000): number | null {
  const n = xs.length;
  if (n < 2) return null;
  const slopes: number[] = [];
  const step = Math.max(1, Math.ceil((n * (n - 1)) / 2 / maxPairs));
  let k = 0;
  for (let i = 0; i < n; i++)
    for (let j = i + 1; j < n; j++) {
      if (k++ % step) continue;
      const dx = xs[j] - xs[i];
      if (Math.abs(dx) > 1e-9) slopes.push((ys[j] - ys[i]) / dx);
    }
  return slopes.length ? median(slopes) : null;
}

/**
 * Hồi quy bậc hai quanh x0 (y = a + b·u + c·u², u = x − x0) → giá trị và độ dốc tại x0. Dùng cho tempo cục bộ khi tempo đổi dần
 * (nhanh dần / chậm dần): hồi quy tuyến tính trên cửa sổ rộng bị lệch theo độ cong. null khi < 3 điểm hoặc suy biến.
 */
export function quadraticAt(xs: readonly number[], ys: readonly number[], x0: number): { value: number; slope: number } | null {
  const n = xs.length;
  if (n < 3) return null;
  let s1 = 0, s2 = 0, s3 = 0, s4 = 0, t0 = 0, t1 = 0, t2 = 0;
  for (let i = 0; i < n; i++) {
    const u = xs[i] - x0;
    const u2 = u * u;
    s1 += u;
    s2 += u2;
    s3 += u2 * u;
    s4 += u2 * u2;
    t0 += ys[i];
    t1 += u * ys[i];
    t2 += u2 * ys[i];
  }
  const m = [
    [n, s1, s2, t0],
    [s1, s2, s3, t1],
    [s2, s3, s4, t2],
  ];
  for (let c = 0; c < 3; c++) {
    let piv = c;
    for (let r = c + 1; r < 3; r++) if (Math.abs(m[r][c]) > Math.abs(m[piv][c])) piv = r;
    if (Math.abs(m[piv][c]) < 1e-9) return null;
    [m[c], m[piv]] = [m[piv], m[c]];
    for (let r = 0; r < 3; r++) {
      if (r === c) continue;
      const f = m[r][c] / m[c][c];
      for (let k = c; k < 4; k++) m[r][k] -= f * m[c][k];
    }
  }
  return { value: m[0][3] / m[0][0], slope: m[1][3] / m[1][1] };
}
