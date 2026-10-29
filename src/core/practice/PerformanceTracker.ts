/**
 * PerformanceTracker — chế độ Biểu diễn / Kiểm tra tiết tấu của giáo trình.
 *
 * Khác TempoFollower (đồng hồ chạy THEO người chơi, không xét cao độ): ở đây đồng hồ nhịp CỐ ĐỊNH
 * theo metronome, người chơi phải theo đồng hồ. Mỗi nốt có một cửa sổ quanh phách của nó:
 *  - Onset trong cửa sổ của nốt chưa chấm gần nhất → nốt đó được chấm MỘT lần:
 *    đúng cao độ (hoặc bài tiết tấu `checkPitch = false`) → 'correct', sai cao độ → 'wrong'.
 *    Độ lệch thời điểm được ghi cho cả hai trường hợp (đúng nhịp vẫn là đúng nhịp).
 *  - Onset không rơi vào cửa sổ nốt nào (vd gõ trong dấu lặng, gõ thừa) → `extras`, trừ điểm nhịp.
 *  - Đồng hồ đi quá cửa sổ mà chưa có onset → nốt bị lỡ ('skipped').
 *  - Note Off (chỉ MIDI / bàn phím ảo có) → đo thời gian giữ phím so với trường độ.
 * Nốt `midi = null` là dấu lặng hoặc nốt của tay không luyện: không chấm, không có cửa sổ.
 * Bài có dấu sắc thái (`TimedNote.dynamic`): độ to từng nốt (dB, truyền vào `handleNoteOn`) → điểm mạnh nhẹ
 * tương đối giữa các đoạn (`music/dynamics.ts`).
 */

import { dynamicsQuality, type DynamicMark, type DynamicSection } from '../music/dynamics';
import type { NoteResult } from './PracticeEngine';

export interface TimedNote {
  /** Vị trí bắt đầu, tính bằng nốt đen từ đầu bài. */
  startBeat: number;
  durationBeats: number;
  /** null = dấu lặng / nốt không chấm. */
  midi: number | null;
  /** Sắc thái đang có hiệu lực (bài có dấu p / f…). */
  dynamic?: DynamicMark;
}

export type PerformanceStatus = 'idle' | 'countIn' | 'running' | 'paused' | 'finished';
export type PerformanceOutcome = 'hit' | 'wrong' | 'extra' | 'ignored';

export interface PerformanceConfig {
  /** Nốt đen mỗi phút. */
  bpm: number;
  /** Số phách đếm vào trước nốt đầu (và trước khi chạy tiếp sau tạm dừng). */
  countInBeats: number;
  /** false = bài tiết tấu: nốt nào cũng được, chỉ chấm thời điểm. */
  checkPitch: boolean;
  /** Chấp nhận đúng tên nốt sai quãng tám. */
  octaveTolerant: boolean;
  /** Nửa cửa sổ khớp tối đa (nốt đen); nốt dày thì cửa sổ = nửa khoảng cách tới nốt kề. */
  maxWindowBeats: number;
  /** Lệch tối đa vẫn được trọn điểm nhịp (ms). */
  onTimeMs: number;
  /** Onset sát onset trước hơn khoảng này bị bỏ qua (micro đôi khi phát lặp). */
  minOnsetIntervalMs: number;
}

export const DEFAULT_PERFORMANCE_CONFIG: PerformanceConfig = {
  bpm: 72,
  countInBeats: 4,
  checkPitch: true,
  octaveTolerant: false,
  maxWindowBeats: 0.5,
  onTimeMs: 150,
  minOnsetIntervalMs: 80,
};

export interface PerformanceState {
  readonly status: PerformanceStatus;
  /** Vị trí đồng hồ (nốt đen); âm khi đang đếm vào. */
  readonly beat: number;
  /** Nốt (kể cả dấu lặng) đang ở dưới con trỏ. */
  readonly index: number;
  readonly results: readonly NoteResult[];
  /** Độ lệch thời điểm (ms, âm = sớm) của từng nốt đã chấm. */
  readonly offsetsMs: readonly (number | null)[];
  /** Thời gian giữ phím / trường độ của từng nốt (khi đo được Note Off). */
  readonly heldRatios: readonly (number | null)[];
  /** Nốt người chơi đánh cho từng nốt đã chấm. */
  readonly playedMidis: readonly (number | null)[];
  /** Độ to (dB tương đối) từng nốt đã chấm; null = nguồn không đo được (bàn phím ảo). */
  readonly loudness: readonly (number | null)[];
  readonly extras: number;
  readonly lastOffsetMs: number | null;
  readonly lastOutcome: PerformanceOutcome | null;
  /** Đổi mỗi khi có kết quả mới (để UI hiện hiệu ứng). */
  readonly lastEventTime: number;
}

export interface PerformanceResult {
  /** Số nốt cần chấm (không tính dấu lặng). */
  notes: number;
  correct: number;
  wrong: number;
  missed: number;
  extras: number;
  /** Đúng cao độ / số nốt (nốt lỡ tính là sai). */
  pitchAccuracy: number;
  /** 0..1: điểm thời điểm trung bình, chia cho (số nốt + số lần gõ thừa). */
  timing: number;
  /** 0..1 hoặc null khi nguồn vào không báo thả phím (micro). */
  duration: number | null;
  /** Tỉ lệ nốt có đánh (đúng hoặc sai cao độ). */
  completion: number;
  /** Tỉ lệ nốt đã đánh nằm trong `onTimeMs`. */
  onTimeRatio: number;
  /** 0..1 mạnh nhẹ đúng sắc thái; null = không đo được; undefined = bài không có dấu sắc thái. */
  dynamics?: number | null;
}

interface Window {
  lo: number;
  hi: number;
}

export class PerformanceTracker {
  private config: PerformanceConfig;
  private state: PerformanceState;
  private readonly listeners = new Set<(s: PerformanceState) => void>();
  private readonly windows: (Window | null)[];
  private readonly endBeat: number;
  /** performance.now() tương ứng phách 0. */
  private originTime = 0;
  private pausedBeat = 0;
  private lastOnsetTime = -Infinity;
  /** Lúc gõ của từng nốt đã chấm (để tính thời gian giữ khi thả phím). */
  private readonly onsetTimes: (number | null)[];

  constructor(
    private readonly notes: readonly TimedNote[],
    config: Partial<PerformanceConfig> = {},
  ) {
    if (!notes.some((n) => n.midi !== null)) throw new Error('Bài phải có ít nhất một nốt cần chơi');
    this.config = { ...DEFAULT_PERFORMANCE_CONFIG, ...config };
    const playable = notes.map((n, i) => (n.midi === null ? -1 : i)).filter((i) => i >= 0);
    this.windows = notes.map(() => null);
    playable.forEach((i, k) => {
      const start = notes[i].startBeat;
      const prev = k > 0 ? notes[playable[k - 1]].startBeat : -Infinity;
      const next = k < playable.length - 1 ? notes[playable[k + 1]].startBeat : Infinity;
      const max = this.config.maxWindowBeats;
      this.windows[i] = { lo: start - Math.min(max, (start - prev) / 2), hi: start + Math.min(max, (next - start) / 2) };
    });
    const last = notes[notes.length - 1];
    this.endBeat = last.startBeat + last.durationBeats;
    this.onsetTimes = notes.map(() => null);
    this.state = this.initialState();
  }

  private initialState(): PerformanceState {
    return {
      status: 'idle',
      beat: -this.config.countInBeats,
      index: 0,
      results: this.notes.map(() => 'pending'),
      offsetsMs: this.notes.map(() => null),
      heldRatios: this.notes.map(() => null),
      playedMidis: this.notes.map(() => null),
      loudness: this.notes.map(() => null),
      extras: 0,
      lastOffsetMs: null,
      lastOutcome: null,
      lastEventTime: 0,
    };
  }

  getState(): PerformanceState {
    return this.state;
  }

  get bpm(): number {
    return this.config.bpm;
  }

  /** Độ dài một nốt đen (ms). */
  get beatMs(): number {
    return 60000 / this.config.bpm;
  }

  /** Tổng độ dài bài (nốt đen). */
  get totalBeats(): number {
    return this.endBeat;
  }

  subscribe(listener: (s: PerformanceState) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private setState(patch: Partial<PerformanceState>): void {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((l) => l(this.state));
  }

  private beatAt(time: number): number {
    return (time - this.originTime) / this.beatMs;
  }

  /** Bắt đầu (đếm vào `countInBeats` phách) hoặc chạy tiếp sau tạm dừng (đếm vào lại). */
  start(now: number): void {
    const s = this.state;
    if (s.status === 'running' || s.status === 'countIn' || s.status === 'finished') return;
    const from = s.status === 'paused' ? this.pausedBeat : 0;
    this.pausedBeat = from;
    this.originTime = now + (this.config.countInBeats - from) * this.beatMs;
    this.setState({ status: 'countIn', beat: from - this.config.countInBeats });
  }

  pause(now: number): void {
    const s = this.state;
    if (s.status !== 'running' && s.status !== 'countIn') return;
    // Đang đếm vào thì giữ nguyên chỗ sẽ chạy tiếp (`pausedBeat` đặt lúc start).
    if (s.status === 'running') this.pausedBeat = this.beatAt(now);
    this.setState({ status: 'paused', beat: this.pausedBeat });
  }

  /** Đổi nhịp độ giữ nguyên vị trí hiện tại. */
  setBpm(bpm: number, now: number): void {
    if (bpm <= 0 || bpm === this.config.bpm) return;
    const running = this.state.status === 'running' || this.state.status === 'countIn';
    const beat = running ? this.beatAt(now) : this.state.beat;
    this.config = { ...this.config, bpm };
    if (running) this.originTime = now - beat * this.beatMs;
  }

  restart(): void {
    this.pausedBeat = 0;
    this.lastOnsetTime = -Infinity;
    this.onsetTimes.fill(null);
    this.state = this.initialState();
    this.listeners.forEach((l) => l(this.state));
  }

  /** Đẩy đồng hồ tới `now`: đánh dấu nốt bị lỡ, kết thúc khi hết bài. */
  tick(now: number): void {
    const s = this.state;
    if (s.status !== 'running' && s.status !== 'countIn') return;
    const beat = this.beatAt(now);
    let results = s.results;
    this.windows.forEach((w, i) => {
      if (w && results[i] === 'pending' && beat > w.hi) {
        if (results === s.results) results = results.slice();
        (results as NoteResult[])[i] = 'skipped';
      }
    });
    const index = this.indexAt(beat);
    // Mọi cửa sổ đều kết thúc trước mốc này nên lúc đó không còn nốt nào đang chờ.
    const finished = beat >= this.endBeat + this.config.maxWindowBeats;
    const status = finished ? 'finished' : beat >= 0 ? 'running' : 'countIn';
    if (results === s.results && index === s.index && status === s.status && Math.floor(beat * 4) === Math.floor(s.beat * 4)) return;
    this.setState({ status, beat, index, results });
  }

  private indexAt(beat: number): number {
    let idx = 0;
    for (let i = 0; i < this.notes.length; i++) if (this.notes[i].startBeat <= beat + 1e-9) idx = i;
    return idx;
  }

  private matches(played: number, expected: number): boolean {
    if (!this.config.checkPitch || played === expected) return true;
    return this.config.octaveTolerant && (played - expected) % 12 === 0;
  }

  /** `loudness`: độ to nốt (dB tương đối, `loudnessDb`) — chỉ dùng cho điểm sắc thái. */
  handleNoteOn(midi: number, time: number, loudness: number | null = null): PerformanceOutcome {
    const s = this.state;
    if (s.status !== 'running' && s.status !== 'countIn') return 'ignored';
    if (time - this.lastOnsetTime < this.config.minOnsetIntervalMs) return 'ignored';
    this.lastOnsetTime = time;
    this.tick(time);
    const beat = this.beatAt(time);

    let best = -1;
    let bestDist = Infinity;
    this.windows.forEach((w, i) => {
      if (!w || this.state.results[i] !== 'pending' || beat < w.lo || beat > w.hi) return;
      const d = Math.abs(beat - this.notes[i].startBeat);
      if (d < bestDist) {
        best = i;
        bestDist = d;
      }
    });

    if (best < 0) {
      // Gõ lúc đang đếm vào (chưa tới nốt nào) không tính là thừa.
      if (this.state.status === 'countIn') return 'ignored';
      this.setState({ extras: this.state.extras + 1, lastOutcome: 'extra', lastOffsetMs: null, lastEventTime: time });
      return 'extra';
    }

    const ok = this.matches(midi, this.notes[best].midi!);
    const offsetMs = (beat - this.notes[best].startBeat) * this.beatMs;
    const results = this.state.results.slice();
    const offsetsMs = this.state.offsetsMs.slice();
    const playedMidis = this.state.playedMidis.slice();
    const loudnessArr = this.state.loudness.slice();
    results[best] = ok ? 'correct' : 'wrong';
    offsetsMs[best] = offsetMs;
    playedMidis[best] = midi;
    loudnessArr[best] = loudness;
    this.onsetTimes[best] = time;
    const outcome = ok ? 'hit' : 'wrong';
    this.setState({ results, offsetsMs, playedMidis, loudness: loudnessArr, lastOffsetMs: offsetMs, lastOutcome: outcome, lastEventTime: time });
    return outcome;
  }

  /** Thả phím: gán cho nốt gần nhất đã đánh bằng phím đó mà chưa có thời gian giữ. */
  handleNoteOff(midi: number, time: number): void {
    const s = this.state;
    if (s.status === 'idle') return;
    for (let i = this.notes.length - 1; i >= 0; i--) {
      const on = this.onsetTimes[i];
      if (on === null || s.playedMidis[i] !== midi || s.heldRatios[i] !== null || time < on) continue;
      const heldRatios = s.heldRatios.slice();
      heldRatios[i] = (time - on) / this.beatMs / this.notes[i].durationBeats;
      this.setState({ heldRatios });
      return;
    }
  }

  result(): PerformanceResult {
    return scorePerformanceState(this.notes, this.state, this.config.onTimeMs, this.windowMs());
  }

  private windowMs(): number {
    return this.config.maxWindowBeats * this.beatMs;
  }
}

/** Điểm thời điểm của một nốt: trọn điểm trong `onTimeMs`, giảm tuyến tính tới 0 ở mép cửa sổ. */
export function timingQuality(offsetMs: number, onTimeMs: number, windowMs: number): number {
  const d = Math.abs(offsetMs);
  if (d <= onTimeMs) return 1;
  if (windowMs <= onTimeMs) return 0;
  return Math.max(0, 1 - (d - onTimeMs) / (windowMs - onTimeMs));
}

/**
 * Điểm trường độ từ tỉ lệ giữ phím / trường độ. Người chơi legato thường nhả hơi sớm trước nốt sau,
 * nên 0.6–1.25 là trọn điểm; giảm dần tới 0 ở 0.1 và 1.75.
 */
export function durationQuality(ratio: number): number {
  if (ratio >= 0.6 && ratio <= 1.25) return 1;
  if (ratio < 0.6) return Math.max(0, (ratio - 0.1) / 0.5);
  return Math.max(0, 1 - (ratio - 1.25) / 0.5);
}

export function scorePerformanceState(
  notes: readonly TimedNote[],
  state: PerformanceState,
  onTimeMs: number,
  windowMs: number,
): PerformanceResult {
  let total = 0;
  let correct = 0;
  let wrong = 0;
  let missed = 0;
  let timingSum = 0;
  let onTime = 0;
  const durations: number[] = [];
  notes.forEach((n, i) => {
    if (n.midi === null) return;
    total++;
    const r = state.results[i];
    if (r === 'correct') correct++;
    else if (r === 'wrong') wrong++;
    else missed++;
    const off = state.offsetsMs[i];
    if (off !== null && (r === 'correct' || r === 'wrong')) {
      timingSum += timingQuality(off, onTimeMs, windowMs);
      if (Math.abs(off) <= onTimeMs) onTime++;
      const held = state.heldRatios[i];
      if (held !== null) durations.push(durationQuality(held));
    }
  });
  const played = correct + wrong;
  const sections = timedSections(notes);
  return {
    notes: total,
    correct,
    wrong,
    missed,
    extras: state.extras,
    pitchAccuracy: total ? correct / total : 0,
    timing: total ? timingSum / (total + state.extras) : 0,
    duration: durations.length ? durations.reduce((a, b) => a + b, 0) / durations.length : null,
    completion: total ? played / total : 0,
    onTimeRatio: played ? onTime / played : 0,
    ...(sections.length
      ? {
          dynamics: dynamicsQuality(
            sections,
            // Nốt lỡ không có độ to; độ to của nốt sai cao độ vẫn tính (sắc thái độc lập với cao độ).
            state.loudness.map((v, i) => (state.results[i] === 'correct' || state.results[i] === 'wrong' ? v : null)),
            notes.map((n) => n.midi !== null),
          ),
        }
      : {}),
  };
}

/** Các đoạn sắc thái liền nhau từ `TimedNote.dynamic` (nốt không có sắc thái không thuộc đoạn nào). */
export function timedSections(notes: readonly TimedNote[]): DynamicSection[] {
  const out: DynamicSection[] = [];
  notes.forEach((n, i) => {
    const last = out[out.length - 1];
    if (!n.dynamic) return;
    if (last && last.mark === n.dynamic && last.to === i) last.to = i + 1;
    else out.push({ mark: n.dynamic, from: i, to: i + 1 });
  });
  return out;
}
