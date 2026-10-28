/**
 * "Hứng nốt rơi" — máy trạng thái thuần (thời gian truyền vào, không tự hẹn giờ).
 * Nốt rơi theo lịch định trước, càng về sau rơi càng nhanh và dày hơn. Đánh đúng nốt đang rơi trước khi
 * nó chạm đáy (+ `graceMs` bù độ trễ micro) thì hứng được; để rơi xuống đáy thì mất một mạng.
 * Chỉ một nốt mỗi lần đánh: một sự kiện hứng tối đa MỘT nốt (nốt sắp chạm đáy nhất cùng cao độ).
 */
import { shuffle, type Random } from './random';

export interface NoteCatchConfig {
  /** Số nốt rơi trong một ván. */
  count: number;
  /** Thời gian rơi của nốt đầu / nốt cuối (ms) — nhanh dần tuyến tính. */
  fallMs: number;
  minFallMs: number;
  /** Khoảng cách giữa hai nốt xuất hiện liên tiếp, đầu / cuối ván (ms). */
  gapMs: number;
  minGapMs: number;
  /** Chờ trước nốt đầu tiên (ms). */
  leadInMs: number;
  /** Chạm đáy rồi vẫn tính hứng được trong chừng này (độ trễ nhận diện micro). */
  graceMs: number;
  lives: number;
  /** Bỏ sự kiện quá sát sự kiện được nhận trước (micro phát lặp). */
  minIntervalMs: number;
}

export const DEFAULT_NOTE_CATCH_CONFIG: NoteCatchConfig = {
  count: 16,
  fallMs: 4200,
  minFallMs: 2600,
  gapMs: 1900,
  minGapMs: 1150,
  leadInMs: 800,
  graceMs: 350,
  lives: 3,
  minIntervalMs: 120,
};

/** Bé chơi chậm hơn, nhiều mạng hơn. */
export const KIDS_NOTE_CATCH_CONFIG: Partial<NoteCatchConfig> = { count: 12, fallMs: 5600, minFallMs: 3800, gapMs: 2500, minGapMs: 1700, lives: 5 };

export type DropState = 'pending' | 'hit' | 'missed';

export interface Drop {
  readonly id: number;
  readonly midi: number;
  readonly spawnAt: number;
  readonly landAt: number;
  readonly state: DropState;
  readonly hitAt: number | null;
}

export type GameStatus = 'ready' | 'playing' | 'finished';

export interface NoteCatchState {
  readonly status: GameStatus;
  readonly drops: readonly Drop[];
  readonly hits: number;
  readonly misses: number;
  /** Số lần đánh nốt không có trên màn hình. */
  readonly wrongs: number;
  readonly lives: number;
  readonly score: number;
  readonly combo: number;
  readonly bestCombo: number;
  readonly lastOutcome: 'hit' | 'wrong' | null;
  readonly lastMidi: number | null;
  readonly lastEventTime: number;
}

export type AnswerOutcome = 'hit' | 'wrong' | 'ignored';

export const HIT_POINTS = 100;
export const COMBO_BONUS = 10;
const MAX_COMBO_BONUS = 10;

/** Dãy nốt rơi: lần lượt mọi nốt (trộn), không nốt nào xuất hiện ba lần liên tiếp. */
export function makeNoteSequence(notes: readonly number[], count: number, random: Random = Math.random): number[] {
  if (notes.length === 0) throw new Error('Trò chơi cần ít nhất một nốt');
  const out: number[] = [];
  while (out.length < count) {
    for (const m of shuffle(notes, random)) {
      const n = out.length;
      if (notes.length > 1 && n >= 2 && out[n - 1] === m && out[n - 2] === m) continue;
      out.push(m);
      if (out.length === count) break;
    }
  }
  return out;
}

/** Sao theo tỉ lệ hứng được: 3 ≥ 90%, 2 ≥ 70%, 1 khi hứng được ít nhất một nốt. */
export function gameStars(accuracy: number): 0 | 1 | 2 | 3 {
  if (accuracy >= 0.9) return 3;
  if (accuracy >= 0.7) return 2;
  return accuracy > 0 ? 1 : 0;
}

export class NoteCatchGame {
  readonly config: NoteCatchConfig;
  private state: NoteCatchState;
  private readonly listeners = new Set<(s: NoteCatchState) => void>();
  private lastAccepted = -Infinity;

  constructor(
    private readonly sequence: readonly number[],
    config: Partial<NoteCatchConfig> = {},
  ) {
    if (sequence.length === 0) throw new Error('Trò chơi cần ít nhất một nốt');
    this.config = { ...DEFAULT_NOTE_CATCH_CONFIG, ...config };
    this.state = this.initialState();
  }

  private initialState(): NoteCatchState {
    return {
      status: 'ready',
      drops: [],
      hits: 0,
      misses: 0,
      wrongs: 0,
      lives: this.config.lives,
      score: 0,
      combo: 0,
      bestCombo: 0,
      lastOutcome: null,
      lastMidi: null,
      lastEventTime: 0,
    };
  }

  getState(): NoteCatchState {
    return this.state;
  }

  get total(): number {
    return this.sequence.length;
  }

  subscribe(listener: (s: NoteCatchState) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private setState(patch: Partial<NoteCatchState>): void {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((l) => l(this.state));
  }

  start(now: number): void {
    const { fallMs, minFallMs, gapMs, minGapMs, leadInMs } = this.config;
    const n = this.sequence.length;
    let spawn = now + leadInMs;
    const drops = this.sequence.map((midi, i) => {
      const k = n > 1 ? i / (n - 1) : 0;
      const fall = fallMs + (minFallMs - fallMs) * k;
      const drop: Drop = { id: i, midi, spawnAt: spawn, landAt: spawn + fall, state: 'pending', hitAt: null };
      spawn += gapMs + (minGapMs - gapMs) * k;
      return drop;
    });
    this.lastAccepted = -Infinity;
    this.state = { ...this.initialState(), status: 'playing', drops };
    this.listeners.forEach((l) => l(this.state));
  }

  /** Nốt đang rơi trên màn hình (đã xuất hiện, chưa hứng, chưa quá đáy + grace). */
  activeDrops(now: number): Drop[] {
    return this.state.drops.filter((d) => d.state === 'pending' && d.spawnAt <= now && now <= d.landAt + this.config.graceMs);
  }

  answer(midi: number, now: number): AnswerOutcome {
    const s = this.state;
    if (s.status !== 'playing') return 'ignored';
    if (now - this.lastAccepted < this.config.minIntervalMs) return 'ignored';
    this.lastAccepted = now;
    const target = this.activeDrops(now)
      .filter((d) => d.midi === midi)
      .sort((a, b) => a.landAt - b.landAt)[0];
    if (!target) {
      this.setState({ wrongs: s.wrongs + 1, combo: 0, lastOutcome: 'wrong', lastMidi: midi, lastEventTime: now });
      return 'wrong';
    }
    const combo = s.combo + 1;
    const drops = s.drops.map((d) => (d === target ? { ...d, state: 'hit' as const, hitAt: now } : d));
    this.setState({
      drops,
      hits: s.hits + 1,
      score: s.score + HIT_POINTS + COMBO_BONUS * Math.min(s.combo, MAX_COMBO_BONUS),
      combo,
      bestCombo: Math.max(s.bestCombo, combo),
      lastOutcome: 'hit',
      lastMidi: midi,
      lastEventTime: now,
    });
    this.finishIfDone();
    return 'hit';
  }

  /** Gọi mỗi khung hình: nốt rơi quá đáy → mất mạng; hết mạng / hết nốt → kết thúc. */
  tick(now: number): void {
    const s = this.state;
    if (s.status !== 'playing') return;
    let lost = 0;
    const drops = s.drops.map((d) => {
      if (d.state !== 'pending' || now <= d.landAt + this.config.graceMs) return d;
      lost++;
      return { ...d, state: 'missed' as const };
    });
    if (lost > 0) this.setState({ drops, misses: s.misses + lost, lives: Math.max(0, s.lives - lost), combo: 0 });
    this.finishIfDone();
  }

  private finishIfDone(): void {
    const s = this.state;
    if (s.lives <= 0 || s.drops.every((d) => d.state !== 'pending')) this.setState({ status: 'finished' });
  }

  get accuracy(): number {
    return this.state.hits / this.sequence.length;
  }
}
