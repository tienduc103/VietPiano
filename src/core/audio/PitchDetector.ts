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
  /**
   * Từ tần số này trở lên, tinh chỉnh F0 theo đỉnh phổ của âm cơ bản (Hz). Chu kỳ ở quãng cao chỉ
   * vài chục mẫu và dây đàn lệch hoạ âm mạnh → YIN bị kéo cao (C7 đúng dây đo ra ~+22 cents).
   */
  refineAboveHz: number;
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
  // Tới C8 (4186 Hz) — khớp maxMidi 108 của NoteRecognizer; thấp hơn thì nốt cao bị nhận thành quãng 8 dưới.
  maxFrequency: 4500,
  threshold: 0.15,
  refineAboveHz: 1000,
};

/** Tinh chỉnh F0: tìm đỉnh phổ trong ±REFINE_SPAN_CENTS quanh ước lượng YIN, bước REFINE_STEP_CENTS. */
const REFINE_SPAN_CENTS = 60;
const REFINE_STEP_CENTS = 5;

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
  private readonly hann: Float32Array;

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
    this.hann = new Float32Array(frameSize);
    for (let i = 0; i < frameSize; i++) this.hann[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (frameSize - 1));
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

    let frequency = this.options.sampleRate / betterTau;
    if (frequency >= this.options.refineAboveHz) frequency = this.refine(buffer, frequency);

    return {
      frequency,
      confidence: Math.max(0, Math.min(1, 1 - d[tauEstimate])),
      rms,
    };
  }

  /**
   * Đỉnh phổ (DTFT, cửa sổ Hann) của âm cơ bản quanh `estimate`; nội suy parabol trên log biên độ.
   * Ở quãng cao búp chính rộng ~±80 cents, hoạ âm 2 cách một quãng 8 → không lẫn với hoạ âm khác.
   */
  private refine(buffer: Float32Array, estimate: number): number {
    const { sampleRate, frameSize } = this.options;
    const steps = Math.round(REFINE_SPAN_CENTS / REFINE_STEP_CENTS);
    const mags: number[] = [];
    for (let k = -steps; k <= steps; k++) {
      const f = estimate * Math.pow(2, (k * REFINE_STEP_CENTS) / 1200);
      // Quay pha bằng phép nhân số phức (không gọi sin/cos mỗi mẫu).
      const dc = Math.cos((2 * Math.PI * f) / sampleRate);
      const ds = Math.sin((2 * Math.PI * f) / sampleRate);
      let c = 1;
      let s = 0;
      let re = 0;
      let im = 0;
      for (let i = 0; i < frameSize; i++) {
        const x = buffer[i] * this.hann[i];
        re += x * c;
        im -= x * s;
        const nc = c * dc - s * ds;
        s = s * dc + c * ds;
        c = nc;
      }
      mags.push(Math.log(re * re + im * im + 1e-20));
    }
    let best = 0;
    for (let i = 1; i < mags.length; i++) if (mags[i] > mags[best]) best = i;
    // Đỉnh ở mép khoảng tìm → không chắc là âm cơ bản, giữ ước lượng YIN.
    if (best === 0 || best === mags.length - 1) return estimate;
    const [a, b, c] = [mags[best - 1], mags[best], mags[best + 1]];
    const denom = a - 2 * b + c;
    const offset = denom < 0 ? (0.5 * (a - c)) / denom : 0;
    return estimate * Math.pow(2, ((best - steps + offset) * REFINE_STEP_CENTS) / 1200);
  }
}
