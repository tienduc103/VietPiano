/**
 * "Săn phím" — máy trạng thái thuần: mỗi lượt một yêu cầu ("Bấm một nốt Đô"), có giới hạn thời gian.
 * Đúng càng nhanh càng nhiều điểm; sai thì mất chuỗi nhưng vẫn thử tiếp tới khi hết giờ lượt đó.
 */
import { COMBO_BONUS, type GameStatus } from './NoteCatchGame';

export interface KeyHuntConfig {
  /** Thời gian mỗi lượt (ms). */
  roundMs: number;
  /** Bỏ sự kiện quá sát lần chuyển lượt (micro phát lặp nốt vừa đánh). */
  minIntervalMs: number;
}

export const DEFAULT_KEY_HUNT_CONFIG: KeyHuntConfig = { roundMs: 6000, minIntervalMs: 250 };
export const KIDS_KEY_HUNT_CONFIG: Partial<KeyHuntConfig> = { roundMs: 9000 };

export type HuntResult = 'pending' | 'hit' | 'miss';

export interface KeyHuntState {
  readonly status: GameStatus;
  readonly index: number;
  readonly roundStartedAt: number;
  readonly results: readonly HuntResult[];
  readonly hits: number;
  readonly misses: number;
  readonly wrongs: number;
  readonly score: number;
  readonly combo: number;
  readonly bestCombo: number;
  readonly lastOutcome: 'hit' | 'wrong' | 'miss' | null;
  readonly lastMidi: number | null;
  readonly lastEventTime: number;
}

/** Điểm một lượt đúng: 50 cơ bản + tới 50 theo thời gian còn lại. */
const BASE_POINTS = 50;
const SPEED_POINTS = 50;
const MAX_COMBO_BONUS = 5;

export class KeyHuntGame {
  readonly config: KeyHuntConfig;
  private state: KeyHuntState;
  private readonly listeners = new Set<(s: KeyHuntState) => void>();
  private lastAdvance = -Infinity;

  constructor(
    private readonly checks: readonly ((midi: number) => boolean)[],
    config: Partial<KeyHuntConfig> = {},
  ) {
    if (checks.length === 0) throw new Error('Trò chơi cần ít nhất một lượt');
    this.config = { ...DEFAULT_KEY_HUNT_CONFIG, ...config };
    this.state = this.initialState();
  }

  private initialState(): KeyHuntState {
    return {
      status: 'ready',
      index: 0,
      roundStartedAt: 0,
      results: this.checks.map(() => 'pending'),
      hits: 0,
      misses: 0,
      wrongs: 0,
      score: 0,
      combo: 0,
      bestCombo: 0,
      lastOutcome: null,
      lastMidi: null,
      lastEventTime: 0,
    };
  }

  getState(): KeyHuntState {
    return this.state;
  }

  get total(): number {
    return this.checks.length;
  }

  get accuracy(): number {
    return this.state.hits / this.checks.length;
  }

  subscribe(listener: (s: KeyHuntState) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private setState(patch: Partial<KeyHuntState>): void {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((l) => l(this.state));
  }

  start(now: number): void {
    this.lastAdvance = -Infinity;
    this.state = { ...this.initialState(), status: 'playing', roundStartedAt: now };
    this.listeners.forEach((l) => l(this.state));
  }

  /** Phần thời gian còn lại của lượt hiện tại (0–1). */
  remaining(now: number): number {
    return Math.max(0, Math.min(1, 1 - (now - this.state.roundStartedAt) / this.config.roundMs));
  }

  private advance(result: HuntResult, now: number, patch: Partial<KeyHuntState>): void {
    const s = this.state;
    const results = s.results.slice();
    results[s.index] = result;
    const next = s.index + 1;
    const finished = next >= this.checks.length;
    this.lastAdvance = now;
    this.setState({ ...patch, results, index: finished ? s.index : next, status: finished ? 'finished' : 'playing', roundStartedAt: now });
  }

  answer(midi: number, now: number): 'hit' | 'wrong' | 'ignored' {
    const s = this.state;
    if (s.status !== 'playing') return 'ignored';
    if (now - this.lastAdvance < this.config.minIntervalMs) return 'ignored';
    if (!this.checks[s.index](midi)) {
      this.setState({ wrongs: s.wrongs + 1, combo: 0, lastOutcome: 'wrong', lastMidi: midi, lastEventTime: now });
      return 'wrong';
    }
    const points = BASE_POINTS + Math.round(SPEED_POINTS * this.remaining(now)) + COMBO_BONUS * Math.min(s.combo, MAX_COMBO_BONUS);
    const combo = s.combo + 1;
    this.advance('hit', now, {
      hits: s.hits + 1,
      score: s.score + points,
      combo,
      bestCombo: Math.max(s.bestCombo, combo),
      lastOutcome: 'hit',
      lastMidi: midi,
      lastEventTime: now,
    });
    return 'hit';
  }

  /** Gọi mỗi khung hình: hết giờ lượt → tính trượt, sang lượt sau. */
  tick(now: number): void {
    const s = this.state;
    if (s.status !== 'playing' || now - s.roundStartedAt < this.config.roundMs) return;
    this.advance('miss', now, { misses: s.misses + 1, combo: 0, lastOutcome: 'miss', lastMidi: null, lastEventTime: now });
  }
}
