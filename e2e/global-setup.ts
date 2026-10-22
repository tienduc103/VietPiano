/**
 * Sinh file WAV mô phỏng tiếng piano đánh gam Đô trưởng đi lên (C4 → C5),
 * dùng làm "micro giả" cho Chromium (--use-file-for-fake-audio-capture).
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const FIXTURE_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '.fixtures');
export const SCALE_WAV = path.join(FIXTURE_DIR, 'c-major-scale.wav');

const SR = 48000;

function synthNote(midi: number, seconds: number): Float32Array {
  const f0 = 440 * Math.pow(2, (midi - 69) / 12);
  const n = Math.floor(seconds * SR);
  const out = new Float32Array(n);
  const partials = [1, 0.7, 0.45, 0.3, 0.2, 0.12, 0.08];
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    // Attack 5 ms, tắt dần hàm mũ, nhả phím (damper) ở 80% thời lượng.
    const attack = Math.min(1, t / 0.005);
    const release = t > seconds * 0.8 ? Math.exp(-(t - seconds * 0.8) * 40) : 1;
    const env = attack * Math.exp(-t * 1.5) * release;
    let s = 0;
    partials.forEach((g, k) => {
      const h = k + 1;
      s += g * Math.sin(2 * Math.PI * f0 * h * Math.sqrt(1 + 0.0003 * h * h) * t);
    });
    out[i] = 0.25 * env * s;
  }
  return out;
}

function encodeWav(samples: Float32Array): Buffer {
  const buf = Buffer.alloc(44 + samples.length * 2);
  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + samples.length * 2, 4);
  buf.write('WAVE', 8);
  buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20); // PCM
  buf.writeUInt16LE(1, 22); // mono
  buf.writeUInt32LE(SR, 24);
  buf.writeUInt32LE(SR * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write('data', 36);
  buf.writeUInt32LE(samples.length * 2, 40);
  samples.forEach((v, i) => buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, v)) * 32767), 44 + i * 2));
  return buf;
}

export default function globalSetup() {
  mkdirSync(FIXTURE_DIR, { recursive: true });
  const silence = new Float32Array(SR); // 1 giây im lặng đầu file
  const notes = [60, 62, 64, 65, 67, 69, 71, 72].map((m) => synthNote(m, 0.7));
  const total = silence.length + notes.reduce((a, n) => a + n.length, 0);
  const all = new Float32Array(total);
  let off = 0;
  for (const part of [silence, ...notes]) {
    all.set(part, off);
    off += part.length;
  }
  writeFileSync(SCALE_WAV, encodeWav(all));
}
