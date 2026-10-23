/**
 * PitchDetector — ước lượng tần số cơ bản (F0) bằng thuật toán YIN
 * (de Cheveigné & Kawahara, 2002).
 *
 * Hàm thuần, không phụ thuộc Web Audio → kiểm thử được bằng tín hiệu tổng hợp.
 */

export interface PitchDetectorOptions {
  sampleRate: number;
  /** Kích thước khung phân tích (số mẫu). */
  frameSize: number;
  /** Tần số thấp nhất cần nhận (Hz). Càng thấp càng tốn CPU. */
  minFrequency: number;
  /** Tần số cao nhất cần nhận (Hz). */
  maxFrequency: number;
  /** Ngưỡng tuyệt đối của YIN, thường 0.1–0.2. Thấp hơn = khắt khe hơn. */
  threshold: number;
}

export interface PitchFrame {
  /** Tần số ước lượng (Hz), null nếu không có cao độ rõ ràng. */
  frequency: number | null;
  /** Độ tin cậy 0..1 (1 - giá trị CMNDF tại chu kỳ chọn). */
  confidence: number;
  /** Năng lượng RMS của khung. */
  rms: number;
}

export const DEFAULT_PITCH_OPTIONS: Omit<PitchDetectorOptions, 'sampleRate'> = {
  frameSize: 2048,
  minFrequency: 60,
  // Tới C7 (2093 Hz) — khớp maxMidi 96 của NoteRecognizer. 1600 Hz cũ làm A6/B6/C7 bị nhận thành quãng 8 dưới.
  maxFrequency: 2200,
  threshold: 0.15,
};

export function computeRms(buffer: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < buffer.length; i++) sum += buffer[i] * buffer[i];
  return Math.sqrt(sum / buffer.length);
}

export class PitchDetector {
  readonly options: PitchDetectorOptions;
  private readonly tauMin: number;
  private readonly tauMax: number;
  private readonly window: number;
  private readonly diff: Float32Array;

  constructor(options: Partial<PitchDetectorOptions> & { sampleRate: number }) {
    this.options = { ...DEFAULT_PITCH_OPTIONS, ...options };
    const { sampleRate, frameSize, minFrequency, maxFrequency } = this.options;
    this.tauMin = Math.max(2, Math.floor(sampleRate / maxFrequency));
    this.tauMax = Math.min(Math.ceil(sampleRate / minFrequency), Math.floor(frameSize / 2));
    this.window = frameSize - this.tauMax;
    if (this.tauMax <= this.tauMin + 2) {
      throw new Error('frameSize quá nhỏ so với minFrequency');
    }
    this.diff = new Float32Array(this.tauMax + 1);
  }

  /** Phân tích một khung âm thanh. `buffer.length` phải ≥ frameSize. */
  detect(buffer: Float32Array): PitchFrame {
    const rms = computeRms(buffer);
    if (rms < 1e-5) return { frequency: null, confidence: 0, rms };

    const { tauMin, tauMax, window: w, diff: d } = this;

    // Bước 1–2: hàm sai phân d(τ)
    for (let tau = 1; tau <= tauMax; tau++) {
      let sum = 0;
      for (let j = 0; j < w; j++) {
        const delta = buffer[j] - buffer[j + tau];
        sum += delta * delta;
      }
      d[tau] = sum;
    }

    // Bước 3: chuẩn hoá trung bình tích luỹ (CMNDF) d'(τ)
    d[0] = 1;
    let running = 0;
    for (let tau = 1; tau <= tauMax; tau++) {
      running += d[tau];
      d[tau] = running > 0 ? (d[tau] * tau) / running : 1;
    }

    // Bước 4: τ đầu tiên dưới ngưỡng, rồi đi tới cực tiểu cục bộ
    let tauEstimate = -1;
    for (let tau = tauMin; tau <= tauMax; tau++) {
      if (d[tau] < this.options.threshold) {
        while (tau + 1 <= tauMax && d[tau + 1] < d[tau]) tau++;
        tauEstimate = tau;
        break;
      }
    }

    if (tauEstimate === -1) {
      // Không có điểm nào dưới ngưỡng → coi là vô thanh, vẫn báo độ tin cậy tốt nhất.
      let best = 1;
      for (let tau = tauMin; tau <= tauMax; tau++) if (d[tau] < best) best = d[tau];
      return { frequency: null, confidence: Math.max(0, 1 - best), rms };
    }

    // Bước 5: nội suy parabol để có độ phân giải dưới một mẫu
    let betterTau = tauEstimate;
    if (tauEstimate > 1 && tauEstimate < tauMax) {
      const s0 = d[tauEstimate - 1];
      const s1 = d[tauEstimate];
      const s2 = d[tauEstimate + 1];
      const denom = 2 * (2 * s1 - s2 - s0);
      if (denom !== 0) betterTau = tauEstimate + (s2 - s0) / denom;
    }

    return {
      frequency: this.options.sampleRate / betterTau,
      confidence: Math.max(0, Math.min(1, 1 - d[tauEstimate])),
      rms,
    };
  }
}
