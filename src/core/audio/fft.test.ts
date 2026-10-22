import { describe, expect, it } from 'vitest';
import { MagnitudeSpectrum, hannWindow } from './fft';
import { sine } from './testSignals';

describe('MagnitudeSpectrum', () => {
  it('khớp với DFT trực tiếp', () => {
    const n = 64;
    const x = Array.from({ length: n }, (_, i) => Math.sin(i * 0.37) + 0.5 * Math.cos(i * 1.9) + (i % 7) / 10);
    const out = new MagnitudeSpectrum(n).compute(x, null, new Float32Array(n / 2 + 1));
    for (let k = 0; k <= n / 2; k++) {
      let re = 0;
      let im = 0;
      for (let i = 0; i < n; i++) {
        re += x[i] * Math.cos((2 * Math.PI * k * i) / n);
        im -= x[i] * Math.sin((2 * Math.PI * k * i) / n);
      }
      expect(out[k]).toBeCloseTo(Math.hypot(re, im), 4);
    }
  });

  it('đỉnh phổ nằm đúng tần số (có cửa sổ Hann + zero-padding)', () => {
    const sr = 48000;
    const fft = new MagnitudeSpectrum(4096);
    const out = fft.compute(sine(1000, sr, 2048), hannWindow(2048), new Float32Array(2049));
    let peak = 0;
    for (let k = 1; k < out.length; k++) if (out[k] > out[peak]) peak = k;
    expect(Math.abs((peak * sr) / 4096 - 1000)).toBeLessThan(sr / 4096);
  });

  it('từ chối kích thước không phải luỹ thừa của 2', () => {
    expect(() => new MagnitudeSpectrum(1000)).toThrow();
  });
});
