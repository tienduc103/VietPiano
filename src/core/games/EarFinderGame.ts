/**
 * "Nghe nốt đoán phím" (luyện tai cao độ) — máy trạng thái thuần. Mỗi vòng app phát một nốt đơn, người học tìm phím.
 * Sai thì được gợi ý "cao hơn / thấp hơn" và thử tiếp; dùng hết `maxTries` lần thì app chỉ ra phím đúng, sang vòng sau.
 * Đúng ở lần thử thứ k được `HIT_POINTS − TRY_PENALTY·(k−1)` điểm. Trong lúc app phát (`listen`) mọi nốt bị bỏ qua.
 */
import type { Random } from './random';

export interface EarFinderConfig {
  rounds: number;
  maxTries: number;
  minIntervalMs: number;
}

export const DEFAULT_EAR_FINDER_CONFIG: EarFinderConfig = { rounds: 8, maxTries: 4, minIntervalMs: 200 };
export const KIDS_EAR_FINDER_CONFIG: Partial<EarFinderConfig> = { rounds: 6, maxTries: 5 };

export type EarFinderStatus = 'listen' | 'answer' | 'finished';
export type EarFinderOutcome = 'hit' | 'higher' | 'lower' | 'reveal';

export interface EarFinderState {
  readonly status: EarFinderStatus;
  readonly round: number;
  readonly tries: number;
  readonly hits: number;
  /** Số vòng đúng ngay lần đầu. */
  readonly firstTry: number;
  readonly score: number;
  readonly combo: number;
  readonly bestCombo: number;
  /** Tăng mỗi lần bước vào `listen` (UI phát nốt). */
  readonly listenId: number;
  /** 'higher' = nốt cần tìm cao hơn phím vừa đánh. */
  readonly lastOutcome: EarFinderOutcome | null;
  readonly lastMidi: number | null;
  /** Nốt cần tìm của vòng vừa xong (đúng / app chỉ ra) — để UI hiện lại sau khi sang vòng mới. */
  readonly lastTarget: number | null;
  readonly lastEventTime: number;
}

export const EAR_HIT_POINTS = 100;
export const EAR_TRY_PENALTY = 25;

/** Dãy nốt cần tìm: ngẫu nhiên trong `notes`, không lặp liền nhau. */
export function makeTargets(notes: readonly number[], count: number, random: Random = Math.random): number[] {
  const pool = [...new Set(notes)];
  if (pool.length < 2) throw new Error('Trò chơi cần ít nhất hai nốt');
  const out: number[] = [];
  while (out.length < count) {
    const m = pool[Math.floor(random() * pool.length)];
    if (m !== out[out.length - 1]) out.push(m);
  }
  return out;
}

export class EarFinderGame {
  readonly config: EarFinderConfig;
  readonly targets: readonly number[];
  private state: EarFinderState;
  private readonly listeners = new Set<(s: EarFinderState) => void>();
  private lastAccepted = -Infinity;

  constructor(notes: readonly number[], config: Partial<EarFinderConfig> = {}, random: Random = Math.random) {
    this.config = { ...DEFAULT_EAR_FINDER_CONFIG, ...config };
    this.targets = makeTargets(notes, this.config.rounds, random);
    this.state = {
      status: 'listen',
      round: 0,
      tries: 0,
      hits: 0,
      firstTry: 0,
      score: 0,
      combo: 0,
      bestCombo: 0,
      listenId: 1,
      lastOutcome: null,
      lastMidi: null,
      lastTarget: null,
      lastEventTime: 0,
    };
  }

  getState(): EarFinderState {
    return this.state;
  }

  subscribe(listener: (s: EarFinderState) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private setState(patch: Partial<EarFinderState>): void {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((l) => l(this.state));
  }

  get target(): number {
    return this.targets[this.state.round];
  }

  get accuracy(): number {
    return this.state.hits / this.config.rounds;
  }

  /** App phát xong nốt → tới lượt người học. */
  listenDone(): void {
    if (this.state.status === 'listen') this.setState({ status: 'answer' });
  }

  /** Nghe lại nốt cần tìm (không trừ điểm, không tính lượt thử). */
  replay(): void {
    if (this.state.status === 'answer') this.setState({ status: 'listen', listenId: this.state.listenId + 1 });
  }

  private nextRound(patch: Partial<EarFinderState>): void {
    const round = this.state.round + 1;
    if (round >= this.config.rounds) this.setState({ ...patch, status: 'finished' });
    else this.setState({ ...patch, status: 'listen', round, tries: 0, listenId: this.state.listenId + 1 });
  }

  answer(midi: number, now: number): EarFinderOutcome | 'ignored' {
    const s = this.state;
    if (s.status !== 'answer') return 'ignored';
    if (now - this.lastAccepted < this.config.minIntervalMs) return 'ignored';
    this.lastAccepted = now;
    const tries = s.tries + 1;
    const base = { lastMidi: midi, lastEventTime: now, tries };
    if (midi === this.target) {
      const combo = s.combo + 1;
      this.nextRound({
        ...base,
        lastOutcome: 'hit',
        lastTarget: this.target,
        hits: s.hits + 1,
        firstTry: s.firstTry + (tries === 1 ? 1 : 0),
        score: s.score + Math.max(0, EAR_HIT_POINTS - EAR_TRY_PENALTY * (tries - 1)),
        combo,
        bestCombo: Math.max(s.bestCombo, combo),
      });
      return 'hit';
    }
    if (tries >= this.config.maxTries) {
      this.nextRound({ ...base, lastOutcome: 'reveal', lastTarget: this.target, combo: 0 });
      return 'reveal';
    }
    const outcome = this.target > midi ? 'higher' : 'lower';
    this.setState({ ...base, lastOutcome: outcome, combo: 0 });
    return outcome;
  }
}
