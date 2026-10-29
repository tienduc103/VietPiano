/**
 * "Đua đọc nốt 60 giây" — máy trạng thái thuần (thời gian truyền vào). Mỗi lúc hiện một nốt trên khuông;
 * đánh đúng → được điểm, sang nốt mới; đánh sai → bị trừ giây (đồng hồ rút ngắn), vẫn ở nốt đó.
 * Hết giờ thì kết thúc. Sao tính theo số nốt đọc đúng (`starHits`), không theo tỉ lệ.
 */
import { COMBO_BONUS, type GameStatus } from './NoteCatchGame';
import type { Random } from './random';

export interface NoteSprintConfig {
  durationMs: number;
  /** Đánh sai bị trừ chừng này (ms). */
  penaltyMs: number;
  /** Số nốt đúng cần cho 1 / 2 / 3 sao. */
  starHits: readonly [number, number, number];
  /** Bỏ sự kiện quá sát lần chuyển nốt (micro phát lặp nốt vừa đánh). */
  minIntervalMs: number;
}

export const DEFAULT_NOTE_SPRINT_CONFIG: NoteSprintConfig = { durationMs: 60_000, penaltyMs: 3000, starHits: [10, 18, 26], minIntervalMs: 200 };
export const KIDS_NOTE_SPRINT_CONFIG: Partial<NoteSprintConfig> = { penaltyMs: 1000, starHits: [6, 11, 16] };

export interface NoteSprintState {
  readonly status: GameStatus;
  readonly endsAt: number;
  /** Nốt đang hiện. */
  readonly current: number;
  readonly hits: number;
  readonly wrongs: number;
  readonly score: number;
  readonly combo: number;
  readonly bestCombo: number;
  readonly lastOutcome: 'hit' | 'wrong' | null;
  readonly lastMidi: number | null;
  readonly lastEventTime: number;
}

const HIT_POINTS = 100;
const MAX_COMBO_BONUS = 10;

/** Số sao theo số nốt đúng. */
export function sprintStars(hits: number, starHits: readonly [number, number, number]): 0 | 1 | 2 | 3 {
  return hits >= starHits[2] ? 3 : hits >= starHits[1] ? 2 : hits >= starHits[0] ? 1 : 0;
}

export class NoteSprintGame {
  readonly config: NoteSprintConfig;
  private state: NoteSprintState;
  private readonly listeners = new Set<(s: NoteSprintState) => void>();
  private readonly notes: number[];
  private lastAdvance = -Infinity;

  constructor(
    notes: readonly number[],
    config: Partial<NoteSprintConfig> = {},
    private readonly random: Random = Math.random,
  ) {
    this.notes = [...new Set(notes)];
    if (this.notes.length < 2) throw new Error('Trò chơi cần ít nhất hai nốt');
    this.config = { ...DEFAULT_NOTE_SPRINT_CONFIG, ...config };
    this.state = {
      status: 'ready',
      endsAt: 0,
      current: this.pick(null),
      hits: 0,
      wrongs: 0,
      score: 0,
      combo: 0,
      bestCombo: 0,
      lastOutcome: null,
      lastMidi: null,
      lastEventTime: 0,
    };
  }

  /** Nốt ngẫu nhiên, khác nốt vừa hiện. */
  private pick(prev: number | null): number {
    for (;;) {
      const m = this.notes[Math.floor(this.random() * this.notes.length)];
      if (m !== prev) return m;
    }
  }

  getState(): NoteSprintState {
    return this.state;
  }

  subscribe(listener: (s: NoteSprintState) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private setState(patch: Partial<NoteSprintState>): void {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((l) => l(this.state));
  }

  get stars(): 0 | 1 | 2 | 3 {
    return sprintStars(this.state.hits, this.config.starHits);
  }

  start(now: number): void {
    this.lastAdvance = -Infinity;
    this.setState({ status: 'playing', endsAt: now + this.config.durationMs });
  }

  /** Phần thời gian còn lại (0–1). */
  remaining(now: number): number {
    if (this.state.status === 'ready') return 1;
    return Math.max(0, Math.min(1, (this.state.endsAt - now) / this.config.durationMs));
  }

  answer(midi: number, now: number): 'hit' | 'wrong' | 'ignored' {
    const s = this.state;
    if (s.status !== 'playing') return 'ignored';
    if (now >= s.endsAt) {
      this.tick(now);
      return 'ignored';
    }
    if (now - this.lastAdvance < this.config.minIntervalMs) return 'ignored';
    const base = { lastMidi: midi, lastEventTime: now };
    if (midi !== s.current) {
      this.setState({ ...base, wrongs: s.wrongs + 1, combo: 0, lastOutcome: 'wrong', endsAt: s.endsAt - this.config.penaltyMs });
      this.tick(now);
      return 'wrong';
    }
    const combo = s.combo + 1;
    this.lastAdvance = now;
    this.setState({
      ...base,
      hits: s.hits + 1,
      score: s.score + HIT_POINTS + COMBO_BONUS * Math.min(s.combo, MAX_COMBO_BONUS),
      combo,
      bestCombo: Math.max(s.bestCombo, combo),
      lastOutcome: 'hit',
      current: this.pick(s.current),
    });
    return 'hit';
  }

  /** Gọi mỗi khung hình: hết giờ → kết thúc. */
  tick(now: number): void {
    if (this.state.status === 'playing' && now >= this.state.endsAt) this.setState({ status: 'finished' });
  }
}
