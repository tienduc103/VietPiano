/**
 * "Giai điệu bí ẩn" (luyện tai) — máy trạng thái thuần. App phát một đoạn nhạc, người học đánh lại đúng thứ tự.
 * Qua vòng thì đoạn dài thêm một nốt (đoạn mới = đoạn cũ + 1 nốt). Sai một nốt → mất một mạng, nghe lại từ đầu.
 * Trong lúc app phát (`listen`) mọi nốt bị bỏ qua — micro không lấy tiếng loa làm câu trả lời.
 */
import type { Random } from './random';

export interface EchoMelodyConfig {
  rounds: number;
  /** Số nốt của vòng đầu. */
  startLength: number;
  lives: number;
  minIntervalMs: number;
  /** Điểm trừ mỗi lần bấm "Nghe lại" / xem gợi ý trong một vòng. */
  replayPenalty: number;
  hintPenalty: number;
}

export const DEFAULT_ECHO_CONFIG: EchoMelodyConfig = { rounds: 5, startLength: 3, lives: 3, minIntervalMs: 150, replayPenalty: 30, hintPenalty: 40 };
export const KIDS_ECHO_CONFIG: Partial<EchoMelodyConfig> = { rounds: 4, startLength: 2, lives: 5 };

export type EchoStatus = 'listen' | 'answer' | 'finished';

export interface EchoMelodyState {
  readonly status: EchoStatus;
  /** Vòng hiện tại (từ 0). */
  readonly round: number;
  /** Số nốt đã đánh đúng trong lần thử này. */
  readonly pos: number;
  readonly lives: number;
  readonly score: number;
  readonly roundsCleared: number;
  /** Tăng mỗi lần bước vào `listen` (UI phát lại đoạn nhạc). */
  readonly listenId: number;
  readonly replaysThisRound: number;
  readonly hintedThisRound: boolean;
  readonly lastOutcome: 'correct' | 'wrong' | 'round' | null;
  readonly lastMidi: number | null;
  readonly lastEventTime: number;
}

export const NOTE_POINTS = 100;
const MIN_ROUND_POINTS = 20;

/**
 * Giai điệu đi chủ yếu theo bậc liền (dễ nhớ): bước ±1 (60%), ±2 (40%) trong dãy `notes` đã sắp xếp;
 * không lặp nốt liền nhau (micro cần nhận lại tiếng gõ mới), chạm biên thì đổi hướng.
 */
export function makeMelody(notes: readonly number[], length: number, random: Random = Math.random): number[] {
  const sorted = [...new Set(notes)].sort((a, b) => a - b);
  if (sorted.length < 2) throw new Error('Giai điệu cần ít nhất hai nốt');
  let i = Math.floor(sorted.length / 2 - 0.5 + random());
  const out = [sorted[i]];
  while (out.length < length) {
    const fits = (j: number) => j >= 0 && j < sorted.length;
    let size = random() < 0.6 ? 1 : 2;
    let dir = random() < 0.5 ? -1 : 1;
    if (!fits(i + dir * size)) dir = -dir;
    if (!fits(i + dir * size)) size = 1;
    if (!fits(i + dir * size)) dir = -dir;
    i += dir * size;
    out.push(sorted[i]);
  }
  return out;
}

export class EchoMelodyGame {
  readonly config: EchoMelodyConfig;
  private state: EchoMelodyState;
  private readonly listeners = new Set<(s: EchoMelodyState) => void>();
  private readonly base: number[];
  private lastAccepted = -Infinity;

  constructor(notes: readonly number[], config: Partial<EchoMelodyConfig> = {}, random: Random = Math.random) {
    this.config = { ...DEFAULT_ECHO_CONFIG, ...config };
    this.base = makeMelody(notes, this.config.startLength + this.config.rounds - 1, random);
    this.state = {
      status: 'listen',
      round: 0,
      pos: 0,
      lives: this.config.lives,
      score: 0,
      roundsCleared: 0,
      listenId: 1,
      replaysThisRound: 0,
      hintedThisRound: false,
      lastOutcome: null,
      lastMidi: null,
      lastEventTime: 0,
    };
  }

  getState(): EchoMelodyState {
    return this.state;
  }

  subscribe(listener: (s: EchoMelodyState) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private setState(patch: Partial<EchoMelodyState>): void {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((l) => l(this.state));
  }

  /** Đoạn nhạc của vòng hiện tại. */
  get melody(): number[] {
    return this.base.slice(0, this.config.startLength + this.state.round);
  }

  get accuracy(): number {
    return this.state.roundsCleared / this.config.rounds;
  }

  /** App phát xong đoạn nhạc → tới lượt người học. */
  listenDone(): void {
    if (this.state.status === 'listen') this.setState({ status: 'answer', pos: 0 });
  }

  /** Nghe lại đoạn nhạc (trừ điểm vòng này), đánh lại từ đầu. */
  replay(): void {
    if (this.state.status !== 'answer') return;
    this.setState({ status: 'listen', pos: 0, listenId: this.state.listenId + 1, replaysThisRound: this.state.replaysThisRound + 1 });
  }

  /** Gợi ý nốt đầu tiên (trừ điểm vòng này). */
  hint(): number | null {
    if (this.state.status === 'finished') return null;
    if (!this.state.hintedThisRound) this.setState({ hintedThisRound: true });
    return this.melody[0];
  }

  answer(midi: number, now: number): 'correct' | 'wrong' | 'round' | 'ignored' {
    const s = this.state;
    if (s.status !== 'answer') return 'ignored';
    if (now - this.lastAccepted < this.config.minIntervalMs) return 'ignored';
    this.lastAccepted = now;
    const melody = this.melody;
    const base = { lastMidi: midi, lastEventTime: now };
    if (midi !== melody[s.pos]) {
      const lives = s.lives - 1;
      this.setState({ ...base, lastOutcome: 'wrong', lives, pos: 0, ...(lives <= 0 ? { status: 'finished' as const } : { status: 'listen' as const, listenId: s.listenId + 1 }) });
      return 'wrong';
    }
    const pos = s.pos + 1;
    if (pos < melody.length) {
      this.setState({ ...base, lastOutcome: 'correct', pos });
      return 'correct';
    }
    const { replayPenalty, hintPenalty, rounds } = this.config;
    const points = Math.max(MIN_ROUND_POINTS, NOTE_POINTS * melody.length - replayPenalty * s.replaysThisRound - (s.hintedThisRound ? hintPenalty : 0));
    const cleared = s.roundsCleared + 1;
    const done = cleared >= rounds;
    this.setState({
      ...base,
      lastOutcome: 'round',
      pos,
      score: s.score + points,
      roundsCleared: cleared,
      ...(done
        ? { status: 'finished' as const }
        : { status: 'listen' as const, round: s.round + 1, pos: 0, listenId: s.listenId + 1, replaysThisRound: 0, hintedThisRound: false }),
    });
    return 'round';
  }
}
