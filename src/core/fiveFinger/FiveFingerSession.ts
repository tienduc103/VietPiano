/**
 * FiveFingerSession — buổi luyện liên tục "5 ngón – 8 nốt" (máy trạng thái thuần, thời gian truyền vào).
 *
 *   ready → playing ⇄ paused
 *   playing → (đánh đúng đủ chuỗi) → celebrating (1,5 s) → playing với chuỗi MỚI … → finished
 *
 *  - Chỉ sinh chuỗi mới sau khi chuỗi hiện tại hoàn thành; chuỗi mới tránh trùng chuỗi vừa xong.
 *  - Seed chuỗi thứ n = mixSeed(seed buổi tập, n) → tái tạo được cả buổi.
 *  - Số chuỗi mỗi buổi: 5 / 10 / 20 / 0 = không giới hạn (chỉ dừng khi bấm Kết thúc).
 *  - Hai tay cùng lúc + "luyện từng tay trước": mỗi chuỗi chơi tay phải → tay trái → hai tay.
 *  - Luyện lại: chơi lại chuỗi hiện tại từ đầu (kể cả lúc đang ăn mừng chuỗi vừa xong).
 */

import { DEFAULT_DRILL_CONFIG, FiveFingerDrill, type DrillOutcome, type DrillState, type DrillSummary } from './FiveFingerDrill';
import { chainKey, chainSteps, generateChain, mixSeed, nextChain, singleHandSteps, type ChainStep, type FiveFingerDifficulty, type GeneratedChain, type HandMode, type Movement, type Placements } from './generator';
import type { Hand } from '../lessons/types';
import type { PositionId } from './positions';
import type { ChainResultInput } from './stats';

export type ChainsPerSession = 5 | 10 | 20 | 0;
export const CHAINS_PER_SESSION: readonly ChainsPerSession[] = [5, 10, 20, 0];

export interface SessionSettings {
  handMode: HandMode;
  difficulty: FiveFingerDifficulty;
  position: PositionId;
  rightOctave: number;
  leftOctave: number;
  chainsPerSession: ChainsPerSession;
  /** Chấm nhịp theo máy đếm nhịp (Wait Mode vẫn chờ nốt đúng). */
  rhythm: boolean;
  bpm: number;
  /** Hai tay cùng lúc: luyện tay phải, rồi tay trái, rồi hai tay cho mỗi chuỗi. */
  handsFirst: boolean;
  /** Ngưỡng coi hai tay là cùng lúc (ms). */
  syncToleranceMs: number;
}

export const DEFAULT_SESSION_SETTINGS: SessionSettings = {
  handMode: 'right',
  difficulty: 'easy',
  position: 'C',
  rightOctave: 4,
  leftOctave: 3,
  chainsPerSession: 10,
  rhythm: false,
  bpm: 60,
  handsFirst: false,
  syncToleranceMs: 250,
};

export type SessionStatus = 'ready' | 'playing' | 'paused' | 'celebrating' | 'finished';
/** Giai đoạn trong một chuỗi: 'main' = chơi đúng cách tay đã chọn; 'right'/'left' = luyện từng tay trước. */
export type ChainPhase = 'main' | Hand;

export const CELEBRATE_MS = 1500;
export const PHASE_PAUSE_MS = 900;

export interface ChainOutcome extends ChainResultInput {
  chainNumber: number;
}

export interface SessionState {
  readonly status: SessionStatus;
  /** Trạng thái sẽ quay lại khi bấm Tiếp tục. */
  readonly resumeTo: 'playing' | 'celebrating' | null;
  readonly seed: number;
  /** Chuỗi đang chơi, đếm từ 1. */
  readonly chainNumber: number;
  readonly chainsDone: number;
  readonly chain: GeneratedChain;
  readonly phase: ChainPhase;
  readonly steps: readonly ChainStep[];
  readonly drill: DrillState;
  /** Đang ăn mừng: hết giờ thì làm gì. */
  readonly celebrate: { until: number; next: 'phase' | 'chain' | 'finish'; summary: DrillSummary } | null;
  /** Tổng số nốt đúng / sai cả buổi. */
  readonly correctNotes: number;
  readonly wrongNotes: number;
  readonly startedAt: number | null;
  readonly endedAt: number | null;
}

export interface SessionOptions {
  seed: number;
  /** Chuyển động cần ưu tiên cho chuỗi sắp sinh (gọi lại mỗi chuỗi → cập nhật theo kết quả trong buổi). */
  focus?: () => readonly Movement[];
  /** Mỗi lần xong một chuỗi (và mỗi giai đoạn luyện từng tay) — để lưu thống kê. */
  onChainDone?: (outcome: ChainOutcome) => void;
  /** Chuỗi trước buổi tập (tránh lặp lại ngay chuỗi đầu). */
  avoid?: readonly string[];
  /** Mở lại một chuỗi đã lưu: chuỗi đầu tiên sinh đúng từ seed (+ focus) này. */
  replay?: { seed: number; focus?: readonly Movement[] };
}

export function placementsOf(s: Pick<SessionSettings, 'position' | 'rightOctave' | 'leftOctave'>): Placements {
  return { position: s.position, rightOctave: s.rightOctave, leftOctave: s.leftOctave };
}

function phasesFor(s: SessionSettings): ChainPhase[] {
  return s.handMode === 'together' && s.handsFirst ? ['right', 'left', 'main'] : ['main'];
}

export class FiveFingerSession {
  private state: SessionState;
  private drill: FiveFingerDrill;
  private unsubDrill: () => void = () => {};
  private readonly listeners = new Set<(s: SessionState) => void>();
  private pausedAt: number | null = null;
  private focusUsed: readonly Movement[] = [];

  constructor(
    readonly settings: SessionSettings,
    private readonly options: SessionOptions,
  ) {
    const chain = this.makeChain(1, options.avoid ?? []);
    const phase = phasesFor(settings)[0];
    const steps = this.stepsFor(chain, phase);
    this.drill = this.makeDrill(steps);
    this.state = {
      status: 'ready',
      resumeTo: null,
      seed: options.seed >>> 0,
      chainNumber: 1,
      chainsDone: 0,
      chain,
      phase,
      steps,
      drill: this.drill.getState(),
      celebrate: null,
      correctNotes: 0,
      wrongNotes: 0,
      startedAt: null,
      endedAt: null,
    };
  }

  private makeChain(n: number, avoid: readonly string[]): GeneratedChain {
    const replay = this.options.replay;
    if (n === 1 && replay) {
      this.focusUsed = replay.focus ?? [];
      return generateChain({ handMode: this.settings.handMode, difficulty: this.settings.difficulty, focus: this.focusUsed }, replay.seed);
    }
    const focus = this.options.focus?.() ?? [];
    const hands: Hand[] = this.settings.handMode === 'right' ? ['right'] : this.settings.handMode === 'left' ? ['left'] : ['right', 'left'];
    this.focusUsed = focus.filter((m) => hands.includes(m.hand));
    return nextChain({ handMode: this.settings.handMode, difficulty: this.settings.difficulty, focus: this.focusUsed }, mixSeed(this.options.seed >>> 0, n), avoid);
  }

  private stepsFor(chain: GeneratedChain, phase: ChainPhase): ChainStep[] {
    const all = chainSteps(chain, placementsOf(this.settings));
    return phase === 'main' ? all : singleHandSteps(all, phase);
  }

  private makeDrill(steps: readonly ChainStep[]): FiveFingerDrill {
    this.unsubDrill();
    const drill = new FiveFingerDrill(steps, {
      ...DEFAULT_DRILL_CONFIG,
      syncToleranceMs: this.settings.syncToleranceMs,
      rhythmBpm: this.settings.rhythm ? this.settings.bpm : null,
    });
    this.unsubDrill = drill.subscribe((d) => this.setState({ drill: d }));
    return drill;
  }

  getState(): SessionState {
    return this.state;
  }

  subscribe(listener: (s: SessionState) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private setState(patch: Partial<SessionState>): void {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((l) => l(this.state));
  }

  /** Nốt còn chờ của bước hiện tại. */
  pendingNotes() {
    return this.state.status === 'playing' ? this.drill.pendingNotes() : [];
  }

  start(now: number): void {
    if (this.state.status !== 'ready') return;
    this.drill.start(now);
    this.setState({ status: 'playing', startedAt: now });
  }

  handleNote(midi: number, now: number): DrillOutcome {
    if (this.state.status !== 'playing') return 'ignored';
    const outcome = this.drill.handleNote(midi, now);
    if (outcome === 'wrong') this.setState({ wrongNotes: this.state.wrongNotes + 1 });
    if (outcome === 'finished') this.completePhase(now);
    return outcome;
  }

  private completePhase(now: number): void {
    const s = this.state;
    const summary = this.drill.summary();
    const phases = phasesFor(this.settings);
    const last = phases.indexOf(s.phase) === phases.length - 1;
    this.options.onChainDone?.({
      chainNumber: s.chainNumber,
      at: now,
      seed: s.chain.seed,
      handMode: this.settings.handMode,
      difficulty: this.settings.difficulty,
      position: this.settings.position,
      ...(s.phase !== 'main' ? { phase: s.phase } : {}),
      steps: s.steps,
      records: this.drill.getRecords(),
      attempts: this.drill.getAttempts(),
      summary,
      ...(this.focusUsed.length ? { focus: this.focusUsed } : {}),
    });
    const chainsDone = s.chainsDone + (last ? 1 : 0);
    const limit = this.settings.chainsPerSession;
    const next = !last ? 'phase' : limit > 0 && chainsDone >= limit ? 'finish' : 'chain';
    this.setState({
      status: 'celebrating',
      chainsDone,
      correctNotes: s.correctNotes + summary.correctNotes,
      celebrate: { until: now + (last ? CELEBRATE_MS : PHASE_PAUSE_MS), next, summary },
    });
  }

  /** Gọi mỗi khung hình: hết thời gian ăn mừng → sang giai đoạn / chuỗi kế. */
  tick(now: number): void {
    const s = this.state;
    if (s.status !== 'celebrating' || !s.celebrate || now < s.celebrate.until) return;
    if (s.celebrate.next === 'finish') {
      this.setState({ status: 'finished', celebrate: null, endedAt: now });
      return;
    }
    if (s.celebrate.next === 'phase') {
      const phases = phasesFor(this.settings);
      const phase = phases[phases.indexOf(s.phase) + 1] ?? 'main';
      this.beginSteps(s.chain, phase, s.chainNumber, now);
      return;
    }
    const chainNumber = s.chainNumber + 1;
    const chain = this.makeChain(chainNumber, [chainKey(s.chain)]);
    this.beginSteps(chain, phasesFor(this.settings)[0], chainNumber, now);
  }

  private beginSteps(chain: GeneratedChain, phase: ChainPhase, chainNumber: number, now: number): void {
    const steps = this.stepsFor(chain, phase);
    this.drill = this.makeDrill(steps);
    this.drill.start(now);
    this.setState({ status: 'playing', celebrate: null, chain, phase, steps, chainNumber, drill: this.drill.getState() });
  }

  pause(now: number): void {
    const s = this.state;
    if (s.status !== 'playing' && s.status !== 'celebrating') return;
    this.pausedAt = now;
    if (s.status === 'playing') this.drill.pause(now);
    this.setState({ status: 'paused', resumeTo: s.status });
  }

  resume(now: number): void {
    const s = this.state;
    if (s.status !== 'paused') return;
    const gap = this.pausedAt === null ? 0 : Math.max(0, now - this.pausedAt);
    this.pausedAt = null;
    if (s.resumeTo === 'celebrating' && s.celebrate) {
      this.setState({ status: 'celebrating', resumeTo: null, celebrate: { ...s.celebrate, until: s.celebrate.until + gap } });
      return;
    }
    this.drill.resume(now);
    this.setState({ status: 'playing', resumeTo: null });
  }

  /** Luyện lại chuỗi hiện tại từ đầu (từ giai đoạn đầu nếu luyện từng tay trước). */
  retry(now: number): void {
    const s = this.state;
    if (s.status === 'ready' || s.status === 'finished') return;
    // Chuỗi vừa xong là chuỗi cuối của buổi → luyện lại vẫn tính thêm chuỗi đó, không kết thúc buổi.
    const chainsDone = s.celebrate && s.celebrate.next !== 'phase' ? s.chainsDone - 1 : s.chainsDone;
    this.pausedAt = null;
    this.setState({ resumeTo: null, chainsDone });
    this.beginSteps(s.chain, phasesFor(this.settings)[0], s.chainNumber, now);
  }

  end(now: number): void {
    if (this.state.status === 'finished') return;
    this.pausedAt = null;
    this.setState({ status: 'finished', celebrate: null, resumeTo: null, endedAt: now, startedAt: this.state.startedAt ?? now });
  }

  dispose(): void {
    this.unsubDrill();
    this.listeners.clear();
  }
}
