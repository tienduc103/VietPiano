/**
 * TempoFollower — chế độ "chạy theo nhịp": khuông nhạc tự chạy theo đồng hồ nhịp,
 * mỗi lần người chơi gõ phím (onset) thì đồng hồ được kéo về khớp với nốt gần nhất.
 * KHÔNG xét cao độ: đánh nốt nào cũng được, chỉ quan tâm thời điểm.
 *
 * Mô hình: vị trí (tính bằng nốt đen) = anchorPos + (t − anchorTime) × rate.
 *  - Onset gần một nốt chưa đánh (trong cửa sổ khớp) → nốt đó được tính là "đã đánh";
 *    chỉnh pha (kéo vị trí về phía nốt, hệ số phaseGain) và chỉnh nhịp độ theo khoảng
 *    cách giữa hai nốt đã khớp gần nhất (hệ số tempoGain, giới hạn minRate–maxRate).
 *  - Đồng hồ trôi qua nốt mà không có onset → nốt đó "bị lỡ".
 *  - Mỗi onset khớp tối đa MỘT nốt; onset quá sát onset trước bị bỏ qua.
 */

import type { NoteResult } from './PracticeEngine';

export type TempoStatus = 'idle' | 'countIn' | 'running' | 'paused' | 'finished';
export type OnsetOutcome = 'hit' | 'extra' | 'ignored';

export interface TempoFollowerConfig {
  /** Nhịp độ gốc, số nốt đen mỗi phút. */
  bpm: number;
  /** Số phách đếm vào trước nốt đầu khi bấm "Bắt đầu". */
  countInBeats: number;
  /** Cửa sổ khớp = tỉ lệ này × khoảng cách tới nốt kề bên phía onset. */
  matchWindowRatio: number;
  /** Cửa sổ khớp tối đa (nốt đen). */
  maxMatchBeats: number;
  /** 0–1: kéo vị trí về nốt vừa khớp bao nhiêu phần. */
  phaseGain: number;
  /** 0–1: nhịp độ hiện tại dịch về nhịp độ đo được bao nhiêu phần. */
  tempoGain: number;
  /** Giới hạn nhịp độ theo người chơi, tỉ lệ so với bpm gốc. */
  minRate: number;
  maxRate: number;
  /** Bỏ qua onset đến sớm hơn khoảng này sau onset được nhận trước đó (ms). */
  minOnsetIntervalMs: number;
  /** Lệch nhịp tối đa vẫn coi là "đúng nhịp" (ms). */
  onTimeMs: number;
}

export const DEFAULT_TEMPO_CONFIG: TempoFollowerConfig = {
  bpm: 72,
  countInBeats: 4,
  matchWindowRatio: 0.5,
  maxMatchBeats: 1,
  phaseGain: 0.6,
  tempoGain: 0.3,
  minRate: 0.5,
  maxRate: 1.6,
  minOnsetIntervalMs: 80,
  onTimeMs: 120,
};

export interface TempoState {
  readonly status: TempoStatus;
  /** Nốt đang ở vị trí con trỏ. */
  readonly index: number;
  /** 'correct' = đã đánh, 'skipped' = bị lỡ. */
  readonly results: readonly NoteResult[];
  readonly hits: number;
  readonly missed: number;
  /** Số onset không khớp nốt nào. */
  readonly extra: number;
  readonly onTime: number;
  /** Phách hiện tại (làm tròn xuống); âm khi đang đếm vào. */
  readonly beat: number;
  /** Nhịp độ đang theo người chơi (nốt đen/phút). */
  readonly currentBpm: number;
  /** Lệch nhịp của lần đánh gần nhất (ms, dương = muộn). */
  readonly lastOffsetMs: number | null;
  readonly lastEventTime: number;
  readonly startedAt: number | null;
  readonly finishedAt: number | null;
}

/** Vị trí bắt đầu (nốt đen) của từng nốt, tính từ trường độ. */
export function noteOnsets(beats: readonly number[]): number[] {
  let pos = 0;
  return beats.map((b) => {
    const at = pos;
    pos += b;
    return at;
  });
}

export class TempoFollower {
  private state: TempoState;
  private readonly listeners = new Set<(s: TempoState) => void>();
  private readonly onsets: number[];
  private readonly total: number;
  private config: TempoFollowerConfig;
  private anchorTime = 0;
  private anchorPos = 0;
  /** Nốt đen mỗi ms. */
  private rate = 0;
  private lastOnsetTime = -Infinity;
  private lastHit: { index: number; time: number } | null = null;

  constructor(
    private readonly beats: readonly number[],
    config: Partial<TempoFollowerConfig> = {},
  ) {
    if (beats.length === 0) throw new Error('Bài học phải có ít nhất một nốt');
    this.config = { ...DEFAULT_TEMPO_CONFIG, ...config };
    this.onsets = noteOnsets(beats);
    this.total = this.onsets[this.onsets.length - 1] + beats[beats.length - 1];
    this.rate = this.baseRate;
    this.state = this.initialState();
  }

  private get baseRate(): number {
    return this.config.bpm / 60_000;
  }

  private initialState(): TempoState {
    return {
      status: 'idle',
      index: 0,
      results: this.beats.map(() => 'pending'),
      hits: 0,
      missed: 0,
      extra: 0,
      onTime: 0,
      beat: 0,
      currentBpm: this.config.bpm,
      lastOffsetMs: null,
      lastEventTime: 0,
      startedAt: null,
      finishedAt: null,
    };
  }

  getState(): TempoState {
    return this.state;
  }

  subscribe(listener: (s: TempoState) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private setState(patch: Partial<TempoState>): void {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((l) => l(this.state));
  }

  /** Đổi nhịp độ gốc; nếu đang chạy thì giữ nguyên vị trí hiện tại. */
  setBpm(bpm: number, time: number): void {
    const running = this.state.status === 'running' || this.state.status === 'countIn';
    if (running) this.reanchor(time, this.positionAt(time));
    const ratio = this.rate / this.baseRate;
    this.config = { ...this.config, bpm };
    this.rate = this.baseRate * ratio;
    this.setState({ currentBpm: this.rate * 60_000 });
  }

  positionAt(time: number): number {
    const s = this.state.status;
    if (s === 'idle') return 0;
    if (s === 'paused' || s === 'finished') return this.anchorPos;
    return this.anchorPos + (time - this.anchorTime) * this.rate;
  }

  private reanchor(time: number, pos: number): void {
    this.anchorTime = time;
    this.anchorPos = pos;
  }

  /** Bắt đầu với phần đếm vào (hoặc tiếp tục nếu đang tạm dừng). */
  start(time: number): void {
    const s = this.state.status;
    if (s === 'paused') {
      this.anchorTime = time;
      this.setState({ status: this.anchorPos < 0 ? 'countIn' : 'running', lastEventTime: time });
      return;
    }
    if (s !== 'idle') return;
    this.reanchor(time, -this.config.countInBeats);
    this.setState({ status: 'countIn', beat: -this.config.countInBeats, startedAt: time, lastEventTime: time });
  }

  pause(time: number): void {
    const s = this.state.status;
    if (s !== 'running' && s !== 'countIn') return;
    this.reanchor(time, this.positionAt(time));
    this.setState({ status: 'paused', lastEventTime: time });
  }

  /** Gọi mỗi khung hình: cập nhật con trỏ, đánh dấu nốt bị lỡ, kết thúc bài. */
  tick(time: number): void {
    const s = this.state;
    if (s.status !== 'running' && s.status !== 'countIn') return;
    const pos = this.positionAt(time);
    const results = s.results.slice();
    let missed = s.missed;
    for (let i = 0; i < results.length; i++) {
      if (results[i] === 'pending' && pos > this.onsets[i] + this.windowAfter(i)) {
        results[i] = 'skipped';
        missed++;
      }
    }
    const finished = pos >= this.total;
    if (finished) this.reanchor(time, this.total);
    const index = this.indexAt(pos);
    const status: TempoStatus = finished ? 'finished' : pos >= 0 || s.status === 'running' ? 'running' : 'countIn';
    const beat = Math.floor(pos);
    if (missed === s.missed && index === s.index && status === s.status && beat === s.beat) return;
    this.setState({
      status,
      index,
      beat,
      results: missed === s.missed ? s.results : results,
      missed,
      finishedAt: finished ? time : null,
    });
  }

  /** Xử lý một lần gõ phím; cao độ không quan trọng. */
  handleOnset(time: number): OnsetOutcome {
    const s = this.state;
    if (s.status === 'finished' || s.status === 'paused') return 'ignored';
    if (time - this.lastOnsetTime < this.config.minOnsetIntervalMs) return 'ignored';
    this.lastOnsetTime = time;

    // Chưa bắt đầu: nốt đầu tiên được đánh chính là lúc bắt đầu.
    if (s.status === 'idle') {
      this.reanchor(time, 0);
      this.rate = this.baseRate;
      return this.markHit(0, time, 0, { status: 'running', startedAt: time, beat: 0 });
    }

    const pos = this.positionAt(time);
    const k = this.findMatch(pos);
    if (k === null) {
      this.setState({ extra: s.extra + 1, lastEventTime: time });
      return 'extra';
    }

    // Lệch nhịp đo theo đồng hồ hiện tại (trước khi chỉnh nhịp độ).
    const offsetMs = (pos - this.onsets[k]) / this.rate;
    // Nhịp độ: từ khoảng cách giữa nốt khớp trước và nốt này.
    if (this.lastHit && k > this.lastHit.index && time > this.lastHit.time) {
      const observed = (this.onsets[k] - this.onsets[this.lastHit.index]) / (time - this.lastHit.time);
      const next = this.rate + this.config.tempoGain * (observed - this.rate);
      this.rate = Math.min(this.baseRate * this.config.maxRate, Math.max(this.baseRate * this.config.minRate, next));
    }
    this.reanchor(time, pos + this.config.phaseGain * (this.onsets[k] - pos));
    return this.markHit(k, time, offsetMs, pos < 0 ? { status: 'running', beat: 0 } : {});
  }

  private markHit(k: number, time: number, offsetMs: number, extra: Partial<TempoState>): OnsetOutcome {
    const s = this.state;
    const results = s.results.slice();
    let missed = s.missed;
    // Nốt trước nốt vừa khớp mà chưa đánh → coi như bị lỡ.
    for (let i = 0; i < k; i++) {
      if (results[i] === 'pending') {
        results[i] = 'skipped';
        missed++;
      }
    }
    results[k] = 'correct';
    this.lastHit = { index: k, time };
    this.setState({
      ...extra,
      results,
      missed,
      index: Math.max(k, this.indexAt(this.anchorPos)),
      hits: s.hits + 1,
      onTime: s.onTime + (Math.abs(offsetMs) <= this.config.onTimeMs ? 1 : 0),
      currentBpm: this.rate * 60_000,
      lastOffsetMs: offsetMs,
      lastEventTime: time,
    });
    return 'hit';
  }

  /** Nốt chưa đánh gần vị trí nhất, nằm trong cửa sổ khớp. */
  private findMatch(pos: number): number | null {
    let best: number | null = null;
    let bestDist = Infinity;
    for (let i = 0; i < this.onsets.length; i++) {
      if (this.state.results[i] !== 'pending') continue;
      const d = this.onsets[i] - pos;
      const window = d >= 0 ? this.windowBefore(i) : this.windowAfter(i);
      if (Math.abs(d) <= window && Math.abs(d) < bestDist) {
        best = i;
        bestDist = Math.abs(d);
      }
      if (d > this.config.maxMatchBeats) break;
    }
    return best;
  }

  private windowBefore(i: number): number {
    const gap = i === 0 ? this.config.countInBeats : this.onsets[i] - this.onsets[i - 1];
    return Math.min(this.config.maxMatchBeats, gap * this.config.matchWindowRatio);
  }

  private windowAfter(i: number): number {
    return Math.min(this.config.maxMatchBeats, this.beats[i] * this.config.matchWindowRatio);
  }

  /** Nốt cuối cùng đã bắt đầu tại vị trí `pos`. */
  private indexAt(pos: number): number {
    let i = 0;
    while (i + 1 < this.onsets.length && this.onsets[i + 1] <= pos + 1e-9) i++;
    return i;
  }

  restart(): void {
    this.rate = this.baseRate;
    this.anchorTime = 0;
    this.anchorPos = 0;
    this.lastOnsetTime = -Infinity;
    this.lastHit = null;
    this.state = this.initialState();
    this.listeners.forEach((l) => l(this.state));
  }
}
