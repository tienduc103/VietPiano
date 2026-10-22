/** Tín hiệu tổng hợp dùng cho unit test (không dùng trong ứng dụng). */

import { midiToFrequency } from '../music/notes';

export function sine(frequency: number, sampleRate: number, length: number, amplitude = 0.5): Float32Array {
  const out = new Float32Array(length);
  for (let i = 0; i < length; i++) out[i] = amplitude * Math.sin((2 * Math.PI * frequency * i) / sampleRate);
  return out;
}

/**
 * Âm gần giống piano: nhiều hoạ âm, hoạ âm hơi lệch (inharmonicity) và
 * hoạ âm cơ bản có thể yếu hơn hoạ âm bậc 2 (đặc trưng nốt trầm).
 */
export function pianoLike(
  frequency: number,
  sampleRate: number,
  length: number,
  { fundamentalGain = 1, inharmonicity = 0.0004, amplitude = 0.3 } = {},
): Float32Array {
  const gains = [fundamentalGain, 0.8, 0.5, 0.35, 0.25, 0.15, 0.1, 0.06];
  const out = new Float32Array(length);
  gains.forEach((g, idx) => {
    const n = idx + 1;
    const fn = n * frequency * Math.sqrt(1 + inharmonicity * n * n);
    if (fn >= sampleRate / 2) return;
    const phase = idx * 0.7;
    for (let i = 0; i < length; i++) out[i] += g * Math.sin((2 * Math.PI * fn * i) / sampleRate + phase);
  });
  let peak = 0;
  for (let i = 0; i < length; i++) peak = Math.max(peak, Math.abs(out[i]));
  for (let i = 0; i < length; i++) out[i] = (out[i] / peak) * amplitude;
  return out;
}

/** Nhiễu trắng giả ngẫu nhiên có seed để test tái lập được. */
export function noise(length: number, amplitude: number, seed = 1): Float32Array {
  const out = new Float32Array(length);
  let s = seed;
  for (let i = 0; i < length; i++) {
    s = (s * 1664525 + 1013904223) >>> 0;
    out[i] = ((s / 0xffffffff) * 2 - 1) * amplitude;
  }
  return out;
}

export function mix(a: Float32Array, b: Float32Array): Float32Array {
  const out = new Float32Array(a.length);
  for (let i = 0; i < a.length; i++) out[i] = a[i] + b[i];
  return out;
}

export interface MelodyOptions {
  /** Khoảng cách giữa hai lần gõ (ms). */
  noteMs?: number;
  /** Hằng số thời gian tắt dần (giây). */
  decaySec?: number;
  /** Đạp pedal: nốt ngân tới hết, chỉ dừng khi chính phím đó được gõ lại (búa đánh lại dây). */
  pedal?: boolean;
  /** Lực gõ từng nốt (mặc định 1). */
  velocities?: number[];
  /** Thêm im lặng ở cuối (ms). */
  tailMs?: number;
}

/**
 * Giai điệu giống piano. Không pedal: thả phím khi nốt sau bắt đầu (tắt trong ~60 ms).
 */
export function melody(midis: number[], sampleRate: number, options: MelodyOptions = {}): Float32Array {
  const { noteMs = 600, decaySec = 1.5, pedal = false, velocities = [], tailMs = 500 } = options;
  const step = Math.round((sampleRate * noteMs) / 1000);
  const total = step * midis.length + Math.round((sampleRate * tailMs) / 1000);
  const out = new Float32Array(total);
  midis.forEach((midi, k) => {
    const start = k * step;
    const nextSame = midis.indexOf(midi, k + 1);
    const end = Math.min(total, start + sampleRate * 5, nextSame === -1 ? total : nextSame * step + sampleRate / 100);
    const tone = pianoLike(midiToFrequency(midi), sampleRate, end - start);
    const vel = velocities[k] ?? 1;
    for (let i = 0; i < end - start; i++) {
      let env = Math.min(1, i / (sampleRate * 0.005)) * Math.exp(-i / sampleRate / decaySec) * vel;
      if (!pedal && i > step) env *= Math.exp(-(i - step) / (sampleRate * 0.06));
      out[start + i] += tone[i] * env;
    }
  });
  return out;
}
