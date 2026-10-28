/**
 * "Đèn giao thông tiết tấu" — máy trạng thái thuần, KHÔNG xét cao độ (gõ phím nào cũng được).
 * Mẫu tiết tấu của buổi chạy `loops` vòng, mỗi vòng nhanh hơn `tempoStep`; trước mỗi vòng đếm vào một ô nhịp.
 * Gõ lệch ≤ `perfectMs` → Perfect, ≤ `goodMs` → Good; gõ trong ô dấu lặng → "phanh gấp" (mất chuỗi, trừ điểm).
 * Thời điểm gõ truyền vào đã trừ độ trễ nhận diện (micro) — engine không tự bù.
 */
import { COMBO_BONUS, type GameStatus } from './NoteCatchGame';

export interface RhythmBeat {
  startBeat: number;
  durationBeats: number;
  rest: boolean;
}

export interface RhythmTrainConfig {
  /** Nhịp độ vòng đầu (phách/phút). */
  bpm: number;
  loops: number;
  /** Mỗi vòng nhanh thêm bao nhiêu (0.15 = 15%). */
  tempoStep: number;
  /** Số phách đếm vào trước mỗi vòng (= số phách một ô nhịp). */
  countInBeats: number;
  perfectMs: number;
  goodMs: number;
  /** Bỏ lần gõ quá sát lần trước (micro phát lặp). */
  minIntervalMs: number;
}

export const DEFAULT_RHYTHM_TRAIN_CONFIG: RhythmTrainConfig = { bpm: 72, loops: 2, tempoStep: 0.15, countInBeats: 4, perfectMs: 120, goodMs: 250, minIntervalMs: 90 };

export type WagonResult = 'pending' | 'perfect' | 'good' | 'miss' | 'clean' | 'broken';

export interface Wagon {
  readonly id: number;
  readonly loop: number;
  /** Thời điểm bắt đầu (ms, cùng đồng hồ với `now`). */
  readonly at: number;
  readonly durationMs: number;
  readonly beatMs: number;
  readonly durationBeats: number;
  readonly rest: boolean;
  readonly result: WagonResult;
}

export interface BeatTick {
  readonly at: number;
  readonly accent: boolean;
  readonly countIn: boolean;
  readonly loop: number;
}

export interface RhythmTrainState {
  readonly status: GameStatus;
  readonly wagons: readonly Wagon[];
  readonly beats: readonly BeatTick[];
  readonly perfect: number;
  readonly good: number;
  readonly misses: number;
  /** Số lần gõ trong ô dấu lặng. */
  readonly broken: number;
  /** Số lần gõ không gần nốt nào (ngoài dấu lặng). */
  readonly strays: number;
  readonly score: number;
  readonly combo: number;
  readonly bestCombo: number;
  readonly lastOutcome: 'perfect' | 'good' | 'miss' | 'rest' | 'stray' | null;
  /** Độ lệch lần gõ trúng gần nhất (ms, âm = sớm). */
  readonly lastOffset: number | null;
  readonly lastEventTime: number;
}

const PERFECT_POINTS = 100;
const GOOD_POINTS = 50;
const REST_PENALTY = 30;
const MAX_COMBO_BONUS = 10;

export class RhythmTrainGame {
  readonly config: RhythmTrainConfig;
  private state: RhythmTrainState;
  private readonly listeners = new Set<(s: RhythmTrainState) => void>();
  private lastAccepted = -Infinity;
  private readonly patternBeats: number;

  constructor(
    private readonly pattern: readonly RhythmBeat[],
    config: Partial<RhythmTrainConfig> = {},
  ) {
    if (!pattern.some((b) => !b.rest)) throw new Error('Mẫu tiết tấu cần ít nhất một nốt');
    this.config = { ...DEFAULT_RHYTHM_TRAIN_CONFIG, ...config };
    this.patternBeats = Math.max(...pattern.map((b) => b.startBeat + b.durationBeats));
    this.state = this.initialState();
  }

  private initialState(): RhythmTrainState {
    return {
      status: 'ready',
      wagons: [],
      beats: [],
      perfect: 0,
      good: 0,
      misses: 0,
      broken: 0,
      strays: 0,
      score: 0,
      combo: 0,
      bestCombo: 0,
      lastOutcome: null,
      lastOffset: null,
      lastEventTime: 0,
    };
  }

  getState(): RhythmTrainState {
    return this.state;
  }

  subscribe(listener: (s: RhythmTrainState) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private setState(patch: Partial<RhythmTrainState>): void {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((l) => l(this.state));
  }

  /** Số nốt cần gõ trong cả ván. */
  get total(): number {
    return this.pattern.filter((b) => !b.rest).length * this.config.loops;
  }

  /** Nhịp độ của vòng `loop`. */
  bpmOf(loop: number): number {
    return this.config.bpm * (1 + this.config.tempoStep * loop);
  }

  start(now: number): void {
    const { loops, countInBeats } = this.config;
    const wagons: Wagon[] = [];
    const beats: BeatTick[] = [];
    let t = now;
    for (let loop = 0; loop < loops; loop++) {
      const beatMs = 60000 / this.bpmOf(loop);
      for (let b = 0; b < countInBeats; b++) beats.push({ at: t + b * beatMs, accent: b === 0, countIn: true, loop });
      const t0 = t + countInBeats * beatMs;
      for (let b = 0; b < this.patternBeats; b++) beats.push({ at: t0 + b * beatMs, accent: b % countInBeats === 0, countIn: false, loop });
      for (const p of this.pattern) {
        wagons.push({
          id: wagons.length,
          loop,
          at: t0 + p.startBeat * beatMs,
          durationMs: p.durationBeats * beatMs,
          beatMs,
          durationBeats: p.durationBeats,
          rest: p.rest,
          result: 'pending',
        });
      }
      t = t0 + this.patternBeats * beatMs;
    }
    this.lastAccepted = -Infinity;
    this.state = { ...this.initialState(), status: 'playing', wagons, beats };
    this.listeners.forEach((l) => l(this.state));
  }

  private update(wagon: Wagon, result: WagonResult): Wagon[] {
    return this.state.wagons.map((w) => (w === wagon ? { ...w, result } : w));
  }

  /** Một lần gõ (thời điểm đã bù độ trễ). */
  answer(time: number): 'perfect' | 'good' | 'rest' | 'stray' | 'ignored' {
    const s = this.state;
    if (s.status !== 'playing') return 'ignored';
    if (time - this.lastAccepted < this.config.minIntervalMs) return 'ignored';
    this.lastAccepted = time;
    const target = s.wagons
      .filter((w) => !w.rest && w.result === 'pending' && Math.abs(time - w.at) <= this.config.goodMs)
      .sort((a, b) => Math.abs(time - a.at) - Math.abs(time - b.at))[0];
    if (target) {
      const offset = time - target.at;
      const kind = Math.abs(offset) <= this.config.perfectMs ? 'perfect' : 'good';
      const combo = s.combo + 1;
      this.setState({
        wagons: this.update(target, kind),
        perfect: s.perfect + (kind === 'perfect' ? 1 : 0),
        good: s.good + (kind === 'good' ? 1 : 0),
        score: s.score + (kind === 'perfect' ? PERFECT_POINTS : GOOD_POINTS) + COMBO_BONUS * Math.min(s.combo, MAX_COMBO_BONUS),
        combo,
        bestCombo: Math.max(s.bestCombo, combo),
        lastOutcome: kind,
        lastOffset: Math.round(offset),
        lastEventTime: time,
      });
      this.finishIfDone();
      return kind;
    }
    const rest = s.wagons.find((w) => w.rest && time >= w.at && time < w.at + w.durationMs);
    if (rest) {
      this.setState({
        wagons: rest.result === 'pending' ? this.update(rest, 'broken') : s.wagons,
        broken: s.broken + 1,
        score: Math.max(0, s.score - REST_PENALTY),
        combo: 0,
        lastOutcome: 'rest',
        lastOffset: null,
        lastEventTime: time,
      });
      return 'rest';
    }
    this.setState({ strays: s.strays + 1, combo: 0, lastOutcome: 'stray', lastOffset: null, lastEventTime: time });
    return 'stray';
  }

  /** Gọi mỗi khung hình: nốt quá cửa sổ Good → trượt; ô lặng qua hết mà không bị gõ → giữ được. */
  tick(now: number): void {
    const s = this.state;
    if (s.status !== 'playing') return;
    let missed = 0;
    let changed = false;
    const wagons = s.wagons.map((w) => {
      if (w.result !== 'pending') return w;
      if (!w.rest && now > w.at + this.config.goodMs) {
        missed++;
        changed = true;
        return { ...w, result: 'miss' as const };
      }
      if (w.rest && now >= w.at + w.durationMs) {
        changed = true;
        return { ...w, result: 'clean' as const };
      }
      return w;
    });
    if (changed) this.setState({ wagons, misses: s.misses + missed, ...(missed ? { combo: 0, lastOutcome: 'miss' as const, lastEventTime: now } : {}) });
    this.finishIfDone();
  }

  private finishIfDone(): void {
    if (this.state.wagons.every((w) => w.result !== 'pending')) this.setState({ status: 'finished' });
  }

  /** 0–1: Perfect = 1, Good = ½, mỗi lần gõ vào dấu lặng trừ ½. */
  get accuracy(): number {
    const s = this.state;
    return Math.max(0, (s.perfect + 0.5 * s.good - 0.5 * s.broken) / this.total);
  }
}
