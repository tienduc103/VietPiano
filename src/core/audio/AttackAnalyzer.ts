/**
 * AttackAnalyzer — tìm cao độ của nốt VỪA được gõ khi các nốt trước vẫn đang ngân
 * (đạp pedal, giữ phím, legato).
 *
 * YIN chỉ ước lượng một cao độ cho cả khung; khi nốt cũ còn ngân mạnh (≥ ~40% nốt mới)
 * thì hỗn hợp hai nốt cho kết quả sai (E4+D4 → không ra gì, A4+D4 → D3).
 * Cách làm ở đây:
 *  1. Phổ biên độ mỗi khung (Hann + FFT).
 *  2. Onset phổ: tổng phần phổ MỚI so với "nền" (max của 2 khung không chồng lên khung hiện tại)
 *     chiếm ≥ `onsetFluxRatio` tổng phổ. Chỉ tính bin tăng ≥ `noveltyRatio` lần: nốt mới làm xuất
 *     hiện năng lượng ở chỗ trước đó gần như trống, còn dao động biên độ (beating) của âm ngân
 *     chỉ làm hoạ âm sẵn có to/nhỏ đi một chút.
 *  3. Khi có onset, đóng băng phổ nền trước lúc gõ trong `holdMs`; phần chênh lệch dương
 *     (hiện tại − nền) chủ yếu là nốt mới vì nốt cũ chỉ tắt dần.
 *  4. Cao độ của phần chênh lệch: tổng biên độ các hoạ âm 1..H trên lưới tần số 20 cents
 *     (trọng số bằng nhau, cùng số hoạ âm cho mọi ứng viên → hạn chế nhầm quãng 8 lên/xuống).
 *
 * Hàm thuần, không phụ thuộc Web Audio.
 */

import { MagnitudeSpectrum, hannWindow } from './fft';

export interface AttackAnalyzerOptions {
  sampleRate: number;
  frameSize: number;
  /** Phạm vi tần số cơ bản tìm kiếm (Hz). */
  minFrequency: number;
  maxFrequency: number;
  /** Số hoạ âm cộng cho mỗi ứng viên. */
  harmonics: number;
  /** Phần phổ mới (so với nền) tối thiểu để coi là có nốt được gõ, 0..1. */
  onsetFluxRatio: number;
  /** Khoảng cách tối thiểu giữa hai onset (ms) — các khung ngay sau onset vẫn còn pha attack. */
  minOnsetGapMs: number;
  /** Giữ phổ nền trước lúc gõ bao lâu (ms). */
  holdMs: number;
  /** Phần phổ mới tối thiểu (trong lúc giữ) để vẫn báo cao độ. */
  minNewRatio: number;
  /** Bin phổ phải tăng ít nhất bấy nhiêu lần so với nền mới được tính là năng lượng mới. */
  noveltyRatio: number;
  /** Độ rõ tối thiểu để báo cao độ. */
  minClarity: number;
  /**
   * Hoạ âm 1 hoặc 2 của ứng viên phải đạt tỉ lệ này so với hoạ âm mạnh nhất. Nốt piano thật
   * (MIDI 36–108) luôn có hoạ âm thấp rõ; kết quả "rác" (vd gõ lại nốt đang ngân, hai sóng cùng
   * tần số cộng lệch pha) thường là một ứng viên rất trầm gom các đỉnh rải rác.
   */
  minLowPartialRatio: number;
}

export const DEFAULT_ATTACK_OPTIONS: Omit<AttackAnalyzerOptions, 'sampleRate' | 'frameSize'> = {
  minFrequency: 60,
  maxFrequency: 4500, // tới C8, cùng dải với PitchDetector
  harmonics: 8,
  // Pedal giữ nhiều nốt cùng ngân → phần năng lượng mới của mỗi lần gõ chỉ còn ~15–30% tổng phổ.
  onsetFluxRatio: 0.12,
  minOnsetGapMs: 60,
  holdMs: 300,
  minNewRatio: 0.08,
  noveltyRatio: 1.6,
  minClarity: 0.8,
  minLowPartialRatio: 0.25,
};

export interface AttackFrame {
  /** Khung này là lúc bắt đầu một lần gõ. */
  onset: boolean;
  /** Tần số cơ bản của phần âm mới (Hz), null nếu không ở trong pha attack hoặc không rõ. */
  frequency: number | null;
  /** Phần phổ mới so với tổng phổ hiện tại, 0..1. */
  newRatio: number;
  /** Âm nền (nốt cũ còn ngân) so với tổng phổ hiện tại: ~0 khi gõ từ im lặng. */
  background: number;
  /** Phần phổ mới nằm trên các hoạ âm của ứng viên tốt nhất, 0..1 (thấp = phần mới không giống một nốt). */
  clarity: number;
}

const NO_ATTACK: AttackFrame = { onset: false, frequency: null, newRatio: 0, background: 0, clarity: 0 };

/** Bước lưới ứng viên tần số cơ bản. */
const GRID_CENTS = 20;
/** Cửa sổ tìm mỗi hoạ âm: ±1.5% quanh vị trí lý thuyết, nới thêm phía trên cho độ lệch hoạ âm của dây đàn. */
const PARTIAL_TOLERANCE = 0.015;
/**
 * Độ lệch hoạ âm tối đa cho ứng viên tần số `f`. Dây piano càng cao càng lệch (≈0.0004 ở C4 tới
 * ~0.01 ở C8); nếu cửa sổ quá hẹp ở quãng cao thì hoạ âm 3, 4 của nốt thật rơi ra ngoài, còn
 * ứng viên quãng 8 dưới (cửa sổ bậc cao rộng hơn) lại bắt được → nhận nhầm xuống quãng 8.
 */
function maxInharmonicity(f: number): number {
  return Math.min(0.02, Math.max(0.001, 0.001 * (f / 1000) ** 2));
}
/**
 * Từ tần số này trở lên, báo tần số theo đỉnh phổ của hoạ âm 1 thay vì giá trị lưới 20 cents:
 * cửa sổ hoạ âm chỉ nới về phía trên nên ứng viên cao hơn ~nửa cung vẫn bắt đủ hoạ âm của nốt
 * lên dây stretch (C7 +25 cents → C#7). Ở quãng cao một bin phổ chỉ ~10 cents nên đỉnh đủ chính xác.
 */
const PEAK_FREQUENCY_ABOVE_HZ = 1000;
/**
 * Từ tần số này trở lên (~D5), nốt piano luôn có âm cơ bản mạnh → ứng viên mà hoạ âm 1 không có
 * năng lượng mới thì không phải nốt vừa gõ. Cần ở quãng cao: hoạ âm bậc cao vượt Nyquist nên
 * ứng viên thật (C8) và ứng viên quãng 8 dưới (C7, gom đúng các hoạ âm chẵn) có cùng số hoạ âm, hoà điểm.
 */
const STRONG_FUNDAMENTAL_ABOVE_HZ = 600;
/** Bỏ phần phổ dưới tần số này (tiếng ù, rung bàn). */
const LOW_CUT_HZ = 50;
/** Nửa độ rộng búp chính của cửa sổ Hann khi zero-padding gấp đôi (số bin). */
const LOBE_BINS = 4;

export class AttackAnalyzer {
  readonly options: AttackAnalyzerOptions;
  private readonly fft: MagnitudeSpectrum;
  private readonly window: Float32Array;
  private readonly binHz: number;
  private readonly lowBin: number;
  private readonly highBin: number;
  /** Phổ của 3 khung trước (cũ → mới). */
  private history: Float32Array[] = [];
  private frozen: Float32Array | null = null;
  private onsetTime = -Infinity;
  private readonly candidates: { frequency: number; bins: [number, number][] }[] = [];
  private readonly diff: Float32Array;

  constructor(options: Partial<AttackAnalyzerOptions> & { sampleRate: number; frameSize: number }) {
    this.options = { ...DEFAULT_ATTACK_OPTIONS, ...options };
    const { sampleRate, frameSize, minFrequency, maxFrequency, harmonics } = this.options;
    const size = 2 * frameSize;
    this.fft = new MagnitudeSpectrum(size);
    this.window = hannWindow(frameSize);
    this.binHz = sampleRate / size;
    const topHz = Math.min(sampleRate / 2 - this.binHz, maxFrequency * harmonics * 1.1);
    this.lowBin = Math.ceil(LOW_CUT_HZ / this.binHz);
    this.highBin = Math.floor(topHz / this.binHz);
    this.diff = new Float32Array(size / 2 + 1);

    for (let f = minFrequency; f <= maxFrequency; f *= Math.pow(2, GRID_CENTS / 1200)) {
      const bins: [number, number][] = [];
      for (let h = 1; h <= harmonics; h++) {
        const lo = Math.max(this.lowBin, Math.floor((h * f * (1 - PARTIAL_TOLERANCE)) / this.binHz));
        const hi = Math.ceil((h * f * (1 + PARTIAL_TOLERANCE) * Math.sqrt(1 + maxInharmonicity(f) * h * h)) / this.binHz);
        if (hi > this.highBin) break;
        bins.push([lo, Math.max(lo, hi)]);
      }
      this.candidates.push({ frequency: f, bins });
    }
  }

  reset(): void {
    this.history = [];
    this.frozen = null;
    this.onsetTime = -Infinity;
  }

  /** Phân tích một khung. `time` tính bằng ms, tăng đơn điệu. */
  process(buffer: Float32Array, time: number): AttackFrame {
    const spectrum = this.fft.compute(buffer, this.window, new Float32Array(this.fft.size / 2 + 1));
    const prev = this.history;
    const result = this.analyze(spectrum, time);
    prev.push(spectrum);
    if (prev.length > 3) prev.shift();
    return result;
  }

  private analyze(cur: Float32Array, time: number): AttackFrame {
    const o = this.options;
    const total = this.sum(cur);
    if (total <= 0) return NO_ATTACK;

    // Nền cuộn: max của khung t-2 và t-3 (không chồng mẫu với khung hiện tại; lấy max để
    // dao động biên độ của âm ngân — beating — không bị tính là năng lượng mới).
    let onset = false;
    if (this.history.length >= 2 && time - this.onsetTime >= o.minOnsetGapMs) {
      const [a, b] = this.history.length === 3 ? [this.history[0], this.history[1]] : [this.history[0], this.history[0]];
      let rising = 0;
      for (let k = this.lowBin; k <= this.highBin; k++) rising += this.novel(cur[k], Math.max(a[k], b[k]));
      if (rising / total >= o.onsetFluxRatio) {
        onset = true;
        this.onsetTime = time;
        const base = new Float32Array(cur.length);
        for (let k = 0; k < base.length; k++) base[k] = Math.max(a[k], b[k]);
        this.frozen = base;
      }
    }

    if (!this.frozen || time - this.onsetTime > o.holdMs) {
      this.frozen = null;
      return onset ? { ...NO_ATTACK, onset } : NO_ATTACK;
    }

    const base = this.frozen;
    const d = this.diff;
    let fresh = 0;
    let background = 0;
    for (let k = this.lowBin; k <= this.highBin; k++) {
      d[k] = this.novel(cur[k], base[k]);
      fresh += d[k];
      background += Math.min(cur[k], base[k]);
    }
    const newRatio = fresh / total;
    if (newRatio < o.minNewRatio) return { onset, frequency: null, newRatio, background: background / total, clarity: 0 };

    let best = -1;
    let bestScore = 0;
    for (let c = 0; c < this.candidates.length; c++) {
      let score = 0;
      let first = 0;
      let strongest = 0;
      this.candidates[c].bins.forEach(([lo, hi], h) => {
        let peak = 0;
        for (let k = lo; k <= hi; k++) if (d[k] > peak) peak = d[k];
        score += peak;
        if (h === 0) first = peak;
        if (peak > strongest) strongest = peak;
      });
      if (this.candidates[c].frequency >= STRONG_FUNDAMENTAL_ABOVE_HZ && first < o.minLowPartialRatio * strongest) continue;
      if (score > bestScore) {
        bestScore = score;
        best = c;
      }
    }
    if (best === -1) return { onset, frequency: null, newRatio, background: background / total, clarity: 0 };

    // Độ rõ: tổng phổ mới trong các cửa sổ hoạ âm của ứng viên thắng / tổng phổ mới.
    let explained = 0;
    let last = -1;
    let strongest = 0;
    let low = 0;
    this.candidates[best].bins.forEach(([lo, hi], h) => {
      let peak = 0;
      for (let k = lo; k <= hi; k++) if (d[k] > peak) peak = d[k];
      strongest = Math.max(strongest, peak);
      if (h < 2) low = Math.max(low, peak);
      for (let k = Math.max(lo - LOBE_BINS, last + 1); k <= hi + LOBE_BINS; k++) explained += d[k];
      last = hi + LOBE_BINS;
    });
    const clarity = Math.min(1, explained / fresh);
    const plausible = clarity >= o.minClarity && low >= o.minLowPartialRatio * strongest;
    return {
      onset,
      // Khung onset chỉ chứa một phần nốt (và tiếng gõ) → không dùng để kết luận cao độ.
      frequency: !onset && plausible ? this.candidateFrequency(best) : null,
      newRatio,
      background: background / total,
      clarity,
    };
  }

  /** Tần số của ứng viên thắng; ở quãng cao lấy theo đỉnh phổ mới trong cửa sổ hoạ âm 1. */
  private candidateFrequency(index: number): number {
    const { frequency, bins } = this.candidates[index];
    if (frequency < PEAK_FREQUENCY_ABOVE_HZ || bins.length === 0) return frequency;
    const d = this.diff;
    const [lo, hi] = bins[0];
    let k = lo;
    for (let i = lo + 1; i <= hi; i++) if (d[i] > d[k]) k = i;
    if (k <= this.lowBin || k >= this.highBin || d[k] <= 0) return frequency;
    const [a, b, c] = [d[k - 1], d[k], d[k + 1]];
    const denom = a - 2 * b + c;
    const offset = denom < 0 ? Math.max(-0.5, Math.min(0.5, (0.5 * (a - c)) / denom)) : 0;
    return (k + offset) * this.binHz;
  }

  private novel(cur: number, base: number): number {
    return cur > base * this.options.noveltyRatio ? cur - base : 0;
  }

  private sum(spec: Float32Array): number {
    let s = 0;
    for (let k = this.lowBin; k <= this.highBin; k++) s += spec[k];
    return s;
  }
}
