/**
 * FFT radix-2 (Cooley–Tukey, tại chỗ) cho tín hiệu thực → phổ biên độ.
 * Đủ nhanh cho một khung 4096 điểm mỗi hop (~47 lần/giây) trên main thread.
 */

export class MagnitudeSpectrum {
  readonly size: number;
  private readonly re: Float64Array;
  private readonly im: Float64Array;
  private readonly cos: Float64Array;
  private readonly sin: Float64Array;
  private readonly rev: Uint32Array;

  constructor(size: number) {
    if (size < 2 || (size & (size - 1)) !== 0) throw new Error('Kích thước FFT phải là luỹ thừa của 2');
    this.size = size;
    this.re = new Float64Array(size);
    this.im = new Float64Array(size);
    this.cos = new Float64Array(size / 2);
    this.sin = new Float64Array(size / 2);
    for (let i = 0; i < size / 2; i++) {
      this.cos[i] = Math.cos((2 * Math.PI * i) / size);
      this.sin[i] = -Math.sin((2 * Math.PI * i) / size);
    }
    this.rev = new Uint32Array(size);
    const bits = Math.log2(size);
    for (let i = 0; i < size; i++) {
      let r = 0;
      for (let b = 0; b < bits; b++) r |= ((i >> b) & 1) << (bits - 1 - b);
      this.rev[i] = r;
    }
  }

  /**
   * Biên độ |X[k]|, k = 0..size/2, của `input` (nhân với `window` nếu có).
   * `input` ngắn hơn `size` thì phần còn lại coi là 0 (zero-padding).
   */
  compute(input: ArrayLike<number>, window: ArrayLike<number> | null, out: Float32Array): Float32Array {
    const { size, re, im, rev } = this;
    re.fill(0);
    im.fill(0);
    const n = Math.min(input.length, size);
    for (let i = 0; i < n; i++) re[rev[i]] = window ? input[i] * window[i] : input[i];

    for (let len = 2; len <= size; len <<= 1) {
      const half = len >> 1;
      const step = size / len;
      for (let start = 0; start < size; start += len) {
        for (let j = 0; j < half; j++) {
          const wr = this.cos[j * step];
          const wi = this.sin[j * step];
          const a = start + j;
          const b = a + half;
          const tr = re[b] * wr - im[b] * wi;
          const ti = re[b] * wi + im[b] * wr;
          re[b] = re[a] - tr;
          im[b] = im[a] - ti;
          re[a] += tr;
          im[a] += ti;
        }
      }
    }

    for (let k = 0; k <= size / 2; k++) out[k] = Math.hypot(re[k], im[k]);
    return out;
  }
}

export function hannWindow(length: number): Float32Array {
  const w = new Float32Array(length);
  for (let i = 0; i < length; i++) w[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (length - 1));
  return w;
}
