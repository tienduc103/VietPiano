/**
 * AutoCalibrator — chế độ tự căn chỉnh micro (máy thuần trạng thái, không phụ thuộc Web Audio).
 *
 * Quy trình:
 *  1. Giữ yên lặng → đo nhiễu nền (→ noise gate).
 *  2. Ứng dụng hiện lần lượt từng nốt đo; người chơi đánh, máy nghe khung cao độ THÔ
 *     (trước NoteRecognizer, nên không phụ thuộc cài đặt hiện tại) trong `captureMs`.
 *     Nốt nghe không rõ / sai nốt → yêu cầu đánh lại.
 *  3. Đánh một nốt hai lần liên tiếp khi tiếng còn ngân → đo bước nhảy âm lượng khi gõ lại.
 *  4. `computeCalibration` suy ra: noiseGate, a4, minConfidence, stableMs, onsetRatio, octaveTolerant.
 */

import { DEFAULT_RECOGNIZER_CONFIG, type TimedPitchFrame } from '../audio/NoteRecognizer';
import { frequencyToMidiFloat } from '../music/notes';
import { NOISE_GATE_MAX, NOISE_GATE_MIN, noiseGateFromAmbient, type DeviceSettings } from '../settings/DeviceSettings';

export interface AutoCalibrationOptions {
  /** Các nốt đo (MIDI), theo thứ tự hiển thị. */
  notes: number[];
  /** Nốt dùng cho bước "đánh hai lần"; null = bỏ bước này. */
  repeatMidi: number | null;
  silenceMs: number;
  /** Thời gian nghe mỗi nốt kể từ lúc phím được gõ. */
  captureMs: number;
  /** Thời gian nghe ở bước đánh hai lần (tính từ lần gõ đầu). */
  repeatCaptureMs: number;
}

export const DEFAULT_CALIBRATION_OPTIONS: AutoCalibrationOptions = {
  // Trải từ quãng trầm (dễ nhầm quãng 8) tới quãng cao.
  notes: [48, 55, 60, 64, 67, 72],
  repeatMidi: 60,
  silenceMs: 2500,
  captureMs: 1500,
  repeatCaptureMs: 3000,
};

export type CalibrationStep = { kind: 'silence' } | { kind: 'note'; midi: number } | { kind: 'repeat'; midi: number };

export type CalibrationIssue =
  | { kind: 'unclear' }
  | { kind: 'wrong-note'; heardMidi: number }
  | { kind: 'no-restrike' };

export type CalibrationState =
  | { phase: 'silence'; stepIndex: number; progress: number }
  | { phase: 'waiting'; stepIndex: number; step: CalibrationStep & { midi: number }; issue: CalibrationIssue | null }
  | { phase: 'listening'; stepIndex: number; step: CalibrationStep & { midi: number }; progress: number }
  | { phase: 'done'; result: CalibrationResult };

export interface NoteMeasurement {
  midi: number;
  peakRms: number;
  /** Độ lệch cents trung vị so với A4 = 440 Hz. */
  centsMedian: number;
  /** Phân vị 25% độ tin cậy YIN của các khung đúng nốt (kể cả sai quãng 8). */
  confidenceP25: number;
  /** Tỉ lệ khung bị nhận thành quãng 8 khác. */
  octaveRatio: number;
  /** Chuỗi khung dài nhất nhận thành nốt khác hẳn (ms, đo từ khung đầu đến khung cuối). */
  wrongRunMs: number;
  /** Bước nhảy RMS lớn nhất trong lúc âm ngân (không gõ lại). */
  sustainJump: number;
}

export interface CalibrationMeasurements {
  ambientRms: number;
  notes: NoteMeasurement[];
  /** Bước nhảy RMS khi gõ lại cùng phím lúc âm còn ngân; null nếu bỏ qua bước này. */
  restrikeJump: number | null;
  /** Khoảng cách trung vị giữa các khung (ms). */
  frameMs: number;
}

export type CalibrationWarning = 'quiet-signal' | 'noisy-room' | 'onset-conflict' | 'no-notes' | 'tuning-inconsistent';

export type CalibrationPatch = Partial<
  Pick<DeviceSettings, 'noiseGate' | 'a4' | 'minConfidence' | 'stableMs' | 'onsetRatio' | 'octaveTolerant'>
>;

export interface CalibrationResult {
  patch: CalibrationPatch;
  measurements: CalibrationMeasurements;
  warnings: CalibrationWarning[];
}

/** Khung nhạy hơn khi chờ phím: RMS phải tăng gấp chừng này so với 2 khung trước. */
const TRIGGER_JUMP = 1.5;
/** Sau khi gõ phím, bỏ qua pha attack khi đo bước nhảy âm lượng. */
const ATTACK_SKIP_MS = 250;
/** Giới hạn tỉ lệ khi khung trước gần như im lặng. */
const MAX_JUMP = 10;
const MIN_MATCHED_FRAMES = 4;
const A4_DEADBAND_CENTS = 10;

export class AutoCalibrator {
  readonly options: AutoCalibrationOptions;
  readonly steps: readonly CalibrationStep[];

  private state: CalibrationState;
  private readonly listeners = new Set<(s: CalibrationState) => void>();

  private stepStart: number | null = null;
  private captureStart = 0;
  private captured: TimedPitchFrame[] = [];
  private silenceRms: number[] = [];
  private recentRms: number[] = [];
  private frameTimes: number[] = [];
  private ambientRms = 0;
  private readonly notes: NoteMeasurement[] = [];
  private restrikeJump: number | null = null;

  constructor(options: Partial<AutoCalibrationOptions> = {}) {
    this.options = { ...DEFAULT_CALIBRATION_OPTIONS, ...options };
    const steps: CalibrationStep[] = [{ kind: 'silence' }];
    for (const midi of this.options.notes) steps.push({ kind: 'note', midi });
    if (this.options.repeatMidi !== null) steps.push({ kind: 'repeat', midi: this.options.repeatMidi });
    this.steps = steps;
    this.state = { phase: 'silence', stepIndex: 0, progress: 0 };
  }

  getState(): CalibrationState {
    return this.state;
  }

  subscribe(listener: (s: CalibrationState) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Bỏ qua bước hiện tại (nốt không đánh được, hoặc không muốn làm bước đánh hai lần). */
  skip(): void {
    const s = this.state;
    if (s.phase === 'waiting' || s.phase === 'listening') this.advance(s.stepIndex + 1);
  }

  process(frame: TimedPitchFrame): CalibrationState {
    const s = this.state;
    if (s.phase === 'done') return s;

    this.frameTimes.push(frame.time);
    if (this.frameTimes.length > 64) this.frameTimes.shift();
    const recentMin = this.recentRms.length ? Math.min(...this.recentRms) : 0;
    const prevRms = this.recentRms.length ? this.recentRms[this.recentRms.length - 1] : 0;
    this.recentRms.push(frame.rms);
    if (this.recentRms.length > 2) this.recentRms.shift();

    if (s.phase === 'silence') {
      this.stepStart ??= frame.time;
      this.silenceRms.push(frame.rms);
      const elapsed = frame.time - this.stepStart;
      if (elapsed >= this.options.silenceMs) {
        // Phân vị 90% để bỏ qua vài tiếng động đột ngột.
        this.ambientRms = percentile(this.silenceRms, 0.9);
        this.advance(1);
      } else {
        this.set({ phase: 'silence', stepIndex: 0, progress: quantize(elapsed / this.options.silenceMs) });
      }
      return this.state;
    }

    if (s.phase === 'waiting') {
      const trigger = this.triggerLevel();
      const struck = frame.rms >= trigger && (prevRms < trigger || frame.rms > recentMin * TRIGGER_JUMP);
      if (struck) {
        this.captureStart = frame.time;
        this.captured = [frame];
        this.set({ phase: 'listening', stepIndex: s.stepIndex, step: s.step, progress: 0 });
      }
      return this.state;
    }

    // listening
    this.captured.push(frame);
    const duration = s.step.kind === 'repeat' ? this.options.repeatCaptureMs : this.options.captureMs;
    const elapsed = frame.time - this.captureStart;
    if (elapsed < duration) {
      this.set({ ...s, progress: quantize(elapsed / duration) });
      return this.state;
    }
    this.finishCapture(s.stepIndex, s.step);
    return this.state;
  }

  private triggerLevel(): number {
    return Math.max(this.ambientRms * 4, NOISE_GATE_MIN * 4);
  }

  private finishCapture(stepIndex: number, step: CalibrationStep & { midi: number }): void {
    const m = measureNote(step.midi, this.captured, this.captureStart);
    const retry = (issue: CalibrationIssue) => this.set({ phase: 'waiting', stepIndex, step, issue });
    if (m.kind === 'unclear') return retry({ kind: 'unclear' });
    if (m.kind === 'wrong-note') return retry({ kind: 'wrong-note', heardMidi: m.heardMidi });

    if (step.kind === 'repeat') {
      // Bước nhảy lúc gõ lại phải rõ hơn hẳn dao động của âm ngân.
      if (m.value.sustainJump < 1.2) return retry({ kind: 'no-restrike' });
      this.restrikeJump = m.value.sustainJump;
    } else {
      this.notes.push(m.value);
    }
    this.advance(stepIndex + 1);
  }

  private advance(stepIndex: number): void {
    this.captured = [];
    const step = this.steps[stepIndex];
    if (!step) {
      this.set({
        phase: 'done',
        result: computeCalibration({
          ambientRms: this.ambientRms,
          notes: this.notes,
          restrikeJump: this.restrikeJump,
          frameMs: medianInterval(this.frameTimes),
        }),
      });
      return;
    }
    if (step.kind === 'silence') throw new Error('Bước đo im lặng chỉ ở đầu');
    this.set({ phase: 'waiting', stepIndex, step, issue: null });
  }

  private set(next: CalibrationState): void {
    if (sameState(this.state, next)) return;
    this.state = next;
    this.listeners.forEach((l) => l(next));
  }
}

type NoteCapture =
  | { kind: 'ok'; value: NoteMeasurement }
  | { kind: 'unclear' }
  | { kind: 'wrong-note'; heardMidi: number };

/** Phân tích các khung nghe được cho một nốt đo. */
export function measureNote(target: number, frames: readonly TimedPitchFrame[], startTime: number): NoteCapture {
  const matchedCents: number[] = [];
  const confidences: number[] = [];
  const counts = new Map<number, number>();
  let octave = 0;
  let matched = 0;
  let wrongRunMs = 0;
  let runStart: number | null = null;

  for (const f of frames) {
    const midi = f.frequency === null ? null : Math.round(frequencyToMidiFloat(f.frequency));
    // Khung "nhận được nốt khác" chỉ tính khi YIN khá chắc chắn (có thể đánh lừa NoteRecognizer).
    const isWrong = midi !== null && f.confidence >= 0.6 && (midi - target) % 12 !== 0;
    if (isWrong) {
      runStart ??= f.time;
      wrongRunMs = Math.max(wrongRunMs, f.time - runStart);
    } else {
      runStart = null;
    }
    if (midi === null) continue;
    counts.set(midi, (counts.get(midi) ?? 0) + 1);
    if (midi === target) {
      matched++;
      matchedCents.push((frequencyToMidiFloat(f.frequency!) - midi) * 100);
      confidences.push(f.confidence);
    } else if ((midi - target) % 12 === 0) {
      octave++;
      confidences.push(f.confidence);
      if (matched === 0) matchedCents.push((frequencyToMidiFloat(f.frequency!) - midi) * 100);
    }
  }

  if (matched + octave < MIN_MATCHED_FRAMES) {
    let heardMidi: number | null = null;
    let best = 0;
    counts.forEach((n, midi) => {
      if (n > best) [best, heardMidi] = [n, midi];
    });
    return heardMidi !== null && best >= MIN_MATCHED_FRAMES ? { kind: 'wrong-note', heardMidi } : { kind: 'unclear' };
  }

  let sustainJump = 1;
  for (let i = 2; i < frames.length; i++) {
    if (frames[i].time - startTime < ATTACK_SKIP_MS) continue;
    const prevMin = Math.min(frames[i - 1].rms, frames[i - 2].rms);
    const jump = prevMin > 0 ? frames[i].rms / prevMin : MAX_JUMP;
    sustainJump = Math.max(sustainJump, Math.min(MAX_JUMP, jump));
  }

  return {
    kind: 'ok',
    value: {
      midi: target,
      peakRms: Math.max(...frames.map((f) => f.rms)),
      centsMedian: percentile(matchedCents, 0.5),
      confidenceP25: percentile(confidences, 0.25),
      octaveRatio: octave / (matched + octave),
      wrongRunMs,
      sustainJump,
    },
  };
}

/** Suy ra cài đặt nhận diện từ số đo. Hàm thuần. */
export function computeCalibration(m: CalibrationMeasurements): CalibrationResult {
  const warnings: CalibrationWarning[] = [];
  const patch: CalibrationPatch = {};
  const d = DEFAULT_RECOGNIZER_CONFIG;

  // Noise gate: trên nhiễu nền, nhưng phải thấp hơn hẳn tiếng đàn nhỏ nhất.
  let gate = noiseGateFromAmbient(m.ambientRms);
  if (m.notes.length > 0) {
    const ceiling = Math.min(...m.notes.map((n) => n.peakRms)) / 4;
    if (gate > ceiling) {
      gate = Math.max(ceiling, m.ambientRms * 1.5);
      warnings.push(ceiling < m.ambientRms * 1.5 ? 'noisy-room' : 'quiet-signal');
    }
  }
  patch.noiseGate = round(clamp(gate, NOISE_GATE_MIN, NOISE_GATE_MAX), 5);

  if (m.notes.length === 0) {
    warnings.push('no-notes');
    return { patch, measurements: m, warnings };
  }

  // A4: chỉ chỉnh khi đàn lệch đều và rõ (vd đã đổi Tuning). Bỏ qua lệch < 10 cents: dây đàn có
  // inharmonicity nên YIN thường đọc cao vài cents, mà NoteRecognizer đã chấp nhận ±45 cents.
  const cents = m.notes.map((n) => n.centsMedian);
  const centsMedian = percentile(cents, 0.5);
  if (Math.max(...cents) - Math.min(...cents) > 25) {
    warnings.push('tuning-inconsistent');
    patch.a4 = 440;
  } else {
    patch.a4 = Math.abs(centsMedian) < A4_DEADBAND_CENTS ? 440 : clamp(Math.round(440 * Math.pow(2, centsMedian / 1200) * 2) / 2, 430, 450);
  }

  // Độ tin cậy: thấp hơn nốt "khó" nhất một chút để nốt đó vẫn được nhận.
  const conf = Math.min(...m.notes.map((n) => n.confidenceP25)) - 0.05;
  patch.minConfidence = round(clamp(conf, 0.6, 0.9), 2);

  // Thời gian ổn định: dài hơn chuỗi khung nhận nhầm dài nhất (thường ở pha attack).
  const wrongRunMs = Math.max(...m.notes.map((n) => n.wrongRunMs));
  const stable = Math.max(d.stableMs, wrongRunMs + m.frameMs + 20);
  patch.stableMs = clamp(Math.ceil(stable / 10) * 10, d.stableMs, 200);

  // Ngưỡng onset: trên dao động âm ngân, dưới bước nhảy khi gõ lại. Giữ mặc định nếu nằm trong khoảng.
  const lo = Math.max(...m.notes.map((n) => n.sustainJump)) * 1.1;
  let onset = Math.max(lo, d.onsetRatio);
  if (m.restrikeJump !== null) {
    const hi = m.restrikeJump * 0.75;
    if (lo <= hi) onset = clamp(d.onsetRatio, lo, hi);
    else {
      onset = (lo + hi) / 2;
      warnings.push('onset-conflict');
    }
  }
  patch.onsetRatio = round(clamp(onset, 1.15, 2.5), 2);

  // Micro hay nghe nốt trầm thành quãng 8 → bật chấp nhận sai quãng tám (không tự tắt nếu người dùng đã bật).
  if (m.notes.some((n) => n.octaveRatio > 0.5)) patch.octaveTolerant = true;

  return { patch, measurements: m, warnings };
}

function percentile(values: readonly number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))];
}

function medianInterval(times: readonly number[]): number {
  const dt: number[] = [];
  for (let i = 1; i < times.length; i++) dt.push(times[i] - times[i - 1]);
  return dt.length ? percentile(dt, 0.5) : 21;
}

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

function round(v: number, digits: number): number {
  const f = 10 ** digits;
  return Math.round(v * f) / f;
}

/** Tiến độ làm tròn 5% để UI không phải vẽ lại mỗi khung. */
function quantize(p: number): number {
  return Math.min(1, Math.floor(p * 20) / 20);
}

function sameState(a: CalibrationState, b: CalibrationState): boolean {
  if (a.phase !== b.phase) return false;
  if (a.phase === 'done' || b.phase === 'done') return a === b;
  if (a.stepIndex !== b.stepIndex) return false;
  if ('progress' in a && 'progress' in b) return a.progress === b.progress;
  if (a.phase === 'waiting' && b.phase === 'waiting') return a.issue === b.issue;
  return false;
}
