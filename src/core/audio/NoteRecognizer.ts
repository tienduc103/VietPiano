/**
 * NoteRecognizer — biến chuỗi khung cao độ (PitchFrame) thành sự kiện "nốt mới được đánh".
 *
 * Vấn đề cần giải quyết với micro + piano:
 *  - Cao độ phải ổn định một khoảng thời gian mới được chấp nhận (lọc nhiễu, tiếng gõ).
 *  - Âm ngân (sustain) của nốt trước KHÔNG được tính là nốt mới, kể cả khi
 *    nốt tiếp theo trong bài trùng cao độ (vd C C G G).
 *  - Hoạ âm (quãng 8, quãng 12...) nổi lên khi âm tắt dần không được tính là nốt mới.
 *
 * Cơ chế: mỗi lần phát sự kiện, bộ nhận "tháo kíp" (disarm). Chỉ "lên kíp" (arm) lại khi:
 *  1. Có khoảng lặng (RMS dưới noise gate), hoặc
 *  2. Có onset: RMS tăng vọt so với mức thấp nhất của vài khung ngay trước đó
 *     (tiếng gõ phím tăng nhanh; dao động chậm của âm ngân thì không).
 *     Bỏ qua trong thời gian refractory ngay sau khi phát, vì pha attack vẫn đang lên.
 * Ngoại lệ legato: nếu cao độ đổi sang nốt KHÁC và không có quan hệ hoạ âm với nốt trước,
 * ổn định đủ lâu (legatoStableMs), vẫn được chấp nhận dù không phát hiện onset.
 */

import { frequencyToNearestNote } from '../music/notes';
import type { PitchFrame } from './PitchDetector';

export interface NoteRecognizerConfig {
  /** Tần số chuẩn A4. */
  a4: number;
  /** RMS tối thiểu để coi là có âm thanh (noise gate). */
  noiseGate: number;
  /** Độ tin cậy YIN tối thiểu của một khung. */
  minConfidence: number;
  /** Sai lệch tối đa (cents) so với nốt gần nhất. */
  maxCentsDeviation: number;
  /** Thời gian cao độ phải giữ ổn định trước khi chấp nhận (ms). */
  stableMs: number;
  /** Số khung liên tiếp tối thiểu (bên cạnh stableMs). */
  minStableFrames: number;
  /** RMS tăng gấp bao nhiêu lần so với vài khung trước thì coi là onset (nốt được đánh lại). */
  onsetRatio: number;
  /** Số khung quá khứ dùng để so sánh khi phát hiện onset. */
  onsetLookbackFrames: number;
  /** Bỏ qua phát hiện onset trong khoảng này sau khi phát sự kiện (ms). */
  refractoryMs: number;
  /** Thời gian ổn định cần có để chấp nhận đổi nốt kiểu legato không có onset (ms). */
  legatoStableMs: number;
  /** Phạm vi MIDI chấp nhận. */
  minMidi: number;
  maxMidi: number;
}

export const DEFAULT_RECOGNIZER_CONFIG: NoteRecognizerConfig = {
  a4: 440,
  noiseGate: 0.008,
  minConfidence: 0.85,
  maxCentsDeviation: 45,
  stableMs: 70,
  minStableFrames: 3,
  onsetRatio: 1.35,
  onsetLookbackFrames: 2,
  refractoryMs: 180,
  legatoStableMs: 250,
  minMidi: 33,
  maxMidi: 96,
};

export interface TimedPitchFrame extends PitchFrame {
  /** Thời điểm của khung (ms, đơn điệu tăng). */
  time: number;
}

export interface LivePitch {
  midi: number;
  cents: number;
  frequency: number;
  confidence: number;
}

export interface RecognizerOutput {
  /** Cao độ đang nghe được (để hiển thị realtime), null nếu im lặng/không rõ. */
  live: LivePitch | null;
  /** Mức âm lượng hiện tại (RMS). */
  rms: number;
  /** Có sự kiện nốt mới ở khung này. */
  noteOn: { midi: number; time: number } | null;
}

/** Các quãng (nửa cung) thường gặp giữa hoạ âm và âm cơ bản. */
const HARMONIC_INTERVALS = new Set([12, 19, 24, 28, 31, 36]);

export function isHarmonicallyRelated(a: number, b: number): boolean {
  return HARMONIC_INTERVALS.has(Math.abs(a - b));
}

export class NoteRecognizer {
  private config: NoteRecognizerConfig;

  private candidateMidi: number | null = null;
  private candidateSince = 0;
  private candidateFrames = 0;

  private armed = true;
  private lastEmittedMidi: number | null = null;
  private lastEmitTime = -Infinity;
  /** RMS của các khung gần nhất (cũ → mới), dùng để phát hiện onset. */
  private rmsHistory: number[] = [];

  constructor(config: Partial<NoteRecognizerConfig> = {}) {
    this.config = { ...DEFAULT_RECOGNIZER_CONFIG, ...config };
  }

  updateConfig(config: Partial<NoteRecognizerConfig>): void {
    this.config = { ...this.config, ...config };
  }

  getConfig(): Readonly<NoteRecognizerConfig> {
    return this.config;
  }

  reset(): void {
    this.candidateMidi = null;
    this.candidateFrames = 0;
    this.armed = true;
    this.lastEmittedMidi = null;
    this.lastEmitTime = -Infinity;
    this.rmsHistory = [];
  }

  /** Có đang chờ onset mới không (true = đã sẵn sàng nhận nốt mới). */
  isArmed(): boolean {
    return this.armed;
  }

  process(frame: TimedPitchFrame): RecognizerOutput {
    const c = this.config;
    const { time, rms } = frame;

    const history = this.rmsHistory;
    const recentMin = history.length ? Math.min(...history) : 0;
    history.push(rms);
    if (history.length > c.onsetLookbackFrames) history.shift();

    // 1. Im lặng → sẵn sàng cho nốt tiếp theo.
    if (rms < c.noiseGate) {
      this.candidateMidi = null;
      this.candidateFrames = 0;
      this.armed = true;
      return { live: null, rms, noteOn: null };
    }

    // 2. Phát hiện onset (không xét trong pha attack ngay sau khi phát sự kiện).
    const inRefractory = time - this.lastEmitTime < c.refractoryMs;
    if (!inRefractory && !this.armed && rms > recentMin * c.onsetRatio) {
      this.armed = true;
      // Onset mới → bắt đầu đếm ổn định lại từ đầu.
      this.candidateMidi = null;
      this.candidateFrames = 0;
    }

    // 3. Cao độ của khung.
    const live = this.toLivePitch(frame);
    if (!live) {
      this.candidateMidi = null;
      this.candidateFrames = 0;
      return { live: null, rms, noteOn: null };
    }

    if (live.midi !== this.candidateMidi) {
      this.candidateMidi = live.midi;
      this.candidateSince = time;
      this.candidateFrames = 1;
    } else {
      this.candidateFrames++;
    }

    const stableFor = time - this.candidateSince;
    const isStable = this.candidateFrames >= c.minStableFrames && stableFor >= c.stableMs;
    if (!isStable) return { live, rms, noteOn: null };

    // 4. Quyết định có phát sự kiện không.
    let accept = this.armed;
    if (!accept && this.lastEmittedMidi !== null && live.midi !== this.lastEmittedMidi) {
      // Legato: đổi sang nốt khác hẳn (không phải hoạ âm) và giữ đủ lâu.
      accept = !isHarmonicallyRelated(live.midi, this.lastEmittedMidi) && stableFor >= c.legatoStableMs;
    }
    if (!accept) return { live, rms, noteOn: null };

    this.armed = false;
    this.lastEmittedMidi = live.midi;
    this.lastEmitTime = time;
    return { live, rms, noteOn: { midi: live.midi, time } };
  }

  private toLivePitch(frame: TimedPitchFrame): LivePitch | null {
    const c = this.config;
    if (frame.frequency === null || frame.confidence < c.minConfidence) return null;
    const note = frequencyToNearestNote(frame.frequency, c.a4);
    if (!note) return null;
    if (note.midi < c.minMidi || note.midi > c.maxMidi) return null;
    if (Math.abs(note.cents) > c.maxCentsDeviation) return null;
    return { midi: note.midi, cents: note.cents, frequency: frame.frequency, confidence: frame.confidence };
  }
}
