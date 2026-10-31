export type TomatoDifficulty = 'easy' | 'medium' | 'hard';
export type TomatoKind = 'red' | 'golden' | 'giant';
export type TomatoGameStatus = 'ready' | 'playing' | 'waitingForRegrowth' | 'paused' | 'won';

export interface Tomato {
  id: number;
  kind: TomatoKind;
}
export interface TomatoPlant {
  tomatoes: Tomato[];
  regrowAt: number | null;
}

export type TomatoEvent =
  | { type: 'started' }
  | { type: 'correct'; midi: number; kind: TomatoKind; plantIndex: number; points: number }
  | { type: 'wrong'; midi: number }
  | { type: 'regrown'; plantIndexes: number[] }
  | { type: 'rain'; milestone: number }
  | { type: 'butterfly'; milestone: number; points: 3 }
  | { type: 'shield-earned'; milestone: number }
  | { type: 'worms'; plantIndex: number; blocked: boolean; eaten: number }
  | { type: 'won' };

export interface TomatoHarvestState {
  gameStatus: TomatoGameStatus;
  difficulty: TomatoDifficulty;
  score: number;
  harvestedCount: number;
  activePlantIndex: number;
  plants: TomatoPlant[];
  targetNote: number;
  wrongAttemptsForCurrentNote: number;
  attackTriggeredForCurrentNote: boolean;
  correctStreak: number;
  shieldCount: number;
  goldenTomatoQuota: 3 | 4;
  goldenTomatoesSpawned: number;
  goldenTomatoesHarvested: number;
  goldenTomatoesLost: number;
  giantTomatoTriggered: boolean;
  giantTomatoHarvested: boolean;
  triggeredRewardMilestones: string[];
  totalCorrectNotes: number;
  totalWrongNotes: number;
  selectedPlayerProfile: string | null;
  startedAt: number | null;
  completedAt: number | null;
  lastEvent: TomatoEvent | null;
  eventLog: { sequence: number; event: TomatoEvent }[];
  eventSequence: number;
  lastMidi: number | null;
  lastOutcome: 'hit' | 'wrong' | null;
  lastEventTime: number;
}

export interface TomatoHarvestOptions {
  difficulty: TomatoDifficulty;
  profileId?: string | null;
  random?: () => number;
  now?: number;
}

export const TOMATO_NOTES: Record<TomatoDifficulty, readonly number[]> = {
  easy: [60, 62, 64],
  medium: [60, 62, 64, 65, 67],
  hard: [60, 62, 64, 65, 67, 69, 71],
};

const MAX_TOMATOES = 5;
const WIN_COUNT = 50;
const clampRandom = (random: () => number) => Math.min(0.999999, Math.max(0, random()));

/** Máy trạng thái thuần cho game; UI chỉ phản ánh snapshot và không tự cộng điểm. */
export class TomatoHarvestGame {
  private state: TomatoHarvestState;
  private readonly listeners = new Set<() => void>();
  private readonly random: () => number;
  private nextTomatoId = 1;
  private goldenSchedule: number[];
  private goldenScheduleIndex = 0;
  private giantPending = false;
  private pausedAt: number | null = null;
  private lastInput: { midi: number; time: number } | null = null;

  constructor(options: TomatoHarvestOptions) {
    this.random = options.random ?? Math.random;
    const quota: 3 | 4 = clampRandom(this.random) < 0.5 ? 3 : 4;
    this.goldenSchedule = this.makeGoldenSchedule(quota);
    const notes = TOMATO_NOTES[options.difficulty];
    this.state = {
      gameStatus: 'ready',
      difficulty: options.difficulty,
      score: 0,
      harvestedCount: 0,
      activePlantIndex: 0,
      plants: Array.from({ length: 5 }, () => ({ tomatoes: this.redTomatoes(), regrowAt: null })),
      targetNote: notes[this.pick(notes.length)],
      wrongAttemptsForCurrentNote: 0,
      attackTriggeredForCurrentNote: false,
      correctStreak: 0,
      shieldCount: 0,
      goldenTomatoQuota: quota,
      goldenTomatoesSpawned: 0,
      goldenTomatoesHarvested: 0,
      goldenTomatoesLost: 0,
      giantTomatoTriggered: false,
      giantTomatoHarvested: false,
      triggeredRewardMilestones: [],
      totalCorrectNotes: 0,
      totalWrongNotes: 0,
      selectedPlayerProfile: options.profileId ?? null,
      startedAt: null,
      completedAt: null,
      lastEvent: null,
      eventLog: [],
      eventSequence: 0,
      lastMidi: null,
      lastOutcome: null,
      lastEventTime: options.now ?? 0,
    };
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getState = (): TomatoHarvestState => this.state;

  start(now: number): void {
    if (this.state.gameStatus !== 'ready') return;
    this.update({ gameStatus: 'playing', startedAt: now }, { type: 'started' }, now);
  }

  pause(now: number): void {
    if (this.state.gameStatus !== 'playing' && this.state.gameStatus !== 'waitingForRegrowth') return;
    this.pausedAt = now;
    this.update({ gameStatus: 'paused' });
  }

  resume(now: number): void {
    if (this.state.gameStatus !== 'paused') return;
    const delta = Math.max(0, now - (this.pausedAt ?? now));
    const plants = this.state.plants.map((p) => ({ ...p, regrowAt: p.regrowAt === null ? null : p.regrowAt + delta }));
    this.pausedAt = null;
    const gameStatus = plants.some((p) => p.tomatoes.length > 0) ? 'playing' : 'waitingForRegrowth';
    this.update({ plants, gameStatus, startedAt: this.state.startedAt === null ? null : this.state.startedAt + delta });
  }

  tick(now: number): void {
    if (this.state.gameStatus !== 'playing' && this.state.gameStatus !== 'waitingForRegrowth') return;
    const indexes: number[] = [];
    const plants = this.state.plants.map((p, i) => {
      if (p.regrowAt === null || p.regrowAt > now) return p;
      indexes.push(i);
      return { tomatoes: this.redTomatoes(), regrowAt: null };
    });
    if (indexes.length === 0) return;
    let activePlantIndex = this.state.activePlantIndex;
    if (plants[activePlantIndex].tomatoes.length === 0) activePlantIndex = this.findNextPlant(activePlantIndex, plants) ?? indexes[0];
    this.state = { ...this.state, plants, activePlantIndex, gameStatus: 'playing' };
    this.decorateActivePlant();
    this.emit({ type: 'regrown', plantIndexes: indexes }, now);
  }

  answer(midi: number, now: number): 'correct' | 'wrong' | 'ignored' {
    if (this.state.gameStatus !== 'playing') return 'ignored';
    if (this.lastInput?.midi === midi && this.lastInput.time === now) return 'ignored';
    this.lastInput = { midi, time: now };
    if (midi !== this.state.targetNote) {
      this.handleWrong(midi, now);
      return 'wrong';
    }
    this.handleCorrect(midi, now);
    return 'correct';
  }

  private handleWrong(midi: number, now: number): void {
    const attempts = this.state.wrongAttemptsForCurrentNote + 1;
    const score = this.state.difficulty === 'medium' ? Math.max(0, this.state.score - 2) : this.state.score;
    this.state = {
      ...this.state,
      score,
      wrongAttemptsForCurrentNote: attempts,
      correctStreak: 0,
      totalWrongNotes: this.state.totalWrongNotes + 1,
      lastMidi: midi,
      lastOutcome: 'wrong',
    };
    this.emit({ type: 'wrong', midi }, now);
    if (this.state.difficulty === 'hard' && attempts === 3 && !this.state.attackTriggeredForCurrentNote) {
      this.attackWorms(now, 'most');
    }
  }

  private handleCorrect(midi: number, now: number): void {
    const plantIndex = this.state.activePlantIndex;
    const plant = this.state.plants[plantIndex];
    const tomato = plant.tomatoes[0];
    if (!tomato) return;
    const points = tomato.kind === 'golden' ? 5 : tomato.kind === 'giant' ? 10 : 1;
    const plants = this.state.plants.map((p, i) =>
      i === plantIndex ? { ...p, tomatoes: p.tomatoes.slice(1), regrowAt: p.tomatoes.length === 1 ? now + this.regrowDelay() : p.regrowAt } : p,
    );
    const harvestedCount = Math.min(WIN_COUNT, this.state.harvestedCount + 1);
    const streak = this.state.correctStreak + 1;
    this.state = {
      ...this.state,
      plants,
      score: this.state.score + points,
      harvestedCount,
      totalCorrectNotes: this.state.totalCorrectNotes + 1,
      correctStreak: streak,
      goldenTomatoesHarvested: this.state.goldenTomatoesHarvested + (tomato.kind === 'golden' ? 1 : 0),
      giantTomatoHarvested: this.state.giantTomatoHarvested || tomato.kind === 'giant',
      lastMidi: midi,
      lastOutcome: 'hit',
    };
    if (plants[plantIndex].tomatoes.length === 0) this.advanceActivePlant();
    this.emit({ type: 'correct', midi, kind: tomato.kind, plantIndex, points }, now);

    this.applyStreakRewards(now);
    if (harvestedCount >= WIN_COUNT) {
      this.update({ gameStatus: 'won', completedAt: now }, { type: 'won' }, now);
      return;
    }
    if (this.state.difficulty === 'hard' && this.state.wrongAttemptsForCurrentNote > 0 && this.state.wrongAttemptsForCurrentNote < 3 && !this.state.attackTriggeredForCurrentNote) {
      this.attackWorms(now, 'random');
    }
    if (harvestedCount >= 30 && !this.state.giantTomatoTriggered && !this.state.giantTomatoHarvested) this.giantPending = true;
    const notes = TOMATO_NOTES[this.state.difficulty];
    this.state = {
      ...this.state,
      targetNote: this.nextNote(notes),
      wrongAttemptsForCurrentNote: 0,
      attackTriggeredForCurrentNote: false,
    };
    this.decorateActivePlant();
    this.notify();
  }

  private applyStreakRewards(now: number): void {
    const streak = this.state.correctStreak;
    if (streak % 5 === 0) {
      const key = `shield:${streak}`;
      if (!this.hasMilestone(key)) {
        this.addMilestone(key);
        this.state = { ...this.state, shieldCount: Math.min(2, this.state.shieldCount + 1) };
        this.emit({ type: 'shield-earned', milestone: streak }, now);
      }
    }
    if (streak % 20 === 10) {
      const key = `rain:${streak}`;
      if (!this.hasMilestone(key)) {
        this.addMilestone(key);
        const restored: number[] = [];
        const plants = this.state.plants.map((p, i) => {
          if (p.tomatoes.length !== 0) return p;
          restored.push(i);
          return { tomatoes: this.redTomatoes(), regrowAt: null };
        });
        this.state = { ...this.state, plants };
        if (restored.length > 0 && this.state.gameStatus === 'waitingForRegrowth') {
          this.state = { ...this.state, activePlantIndex: this.findNextPlant(this.state.activePlantIndex, plants) ?? restored[0], gameStatus: 'playing' };
        }
        this.emit({ type: 'rain', milestone: streak }, now);
      }
    }
    if (streak % 20 === 0) {
      const key = `butterfly:${streak}`;
      if (!this.hasMilestone(key)) {
        this.addMilestone(key);
        this.state = { ...this.state, score: this.state.score + 3 };
        this.emit({ type: 'butterfly', milestone: streak, points: 3 }, now);
      }
    }
  }

  private attackWorms(now: number, mode: 'random' | 'most'): void {
    const available = this.state.plants.map((p, i) => ({ p, i })).filter(({ p }) => p.tomatoes.length > 0);
    this.state = { ...this.state, attackTriggeredForCurrentNote: true };
    if (available.length === 0) return;
    let target = available[this.pick(available.length)];
    if (mode === 'most') {
      const max = Math.max(...available.map(({ p }) => p.tomatoes.length));
      const tied = available.filter(({ p }) => p.tomatoes.length === max);
      target = tied[this.pick(tied.length)];
    }
    if (this.state.shieldCount > 0) {
      this.state = { ...this.state, shieldCount: this.state.shieldCount - 1 };
      this.emit({ type: 'worms', plantIndex: target.i, blocked: true, eaten: 0 }, now);
      return;
    }
    const eaten = target.p.tomatoes.length;
    const goldenLost = target.p.tomatoes.filter((t) => t.kind === 'golden').length;
    const plants = this.state.plants.map((p, i) => (i === target.i ? { tomatoes: [], regrowAt: now + this.regrowDelay() } : p));
    this.state = { ...this.state, plants, goldenTomatoesLost: this.state.goldenTomatoesLost + goldenLost };
    if (target.i === this.state.activePlantIndex) this.advanceActivePlant();
    this.emit({ type: 'worms', plantIndex: target.i, blocked: false, eaten }, now);
  }

  private advanceActivePlant(): void {
    const next = this.findNextPlant(this.state.activePlantIndex, this.state.plants);
    this.state = {
      ...this.state,
      activePlantIndex: next ?? this.state.activePlantIndex,
      gameStatus: next === null ? 'waitingForRegrowth' : 'playing',
    };
  }

  private findNextPlant(from: number, plants: TomatoPlant[]): number | null {
    for (let step = 1; step <= plants.length; step++) {
      const i = (from + step) % plants.length;
      if (plants[i].tomatoes.length > 0) return i;
    }
    return null;
  }

  private decorateActivePlant(): void {
    if (this.state.gameStatus !== 'playing') return;
    let i = this.state.activePlantIndex;
    let plant = this.state.plants[i];
    if (!plant?.tomatoes.length) return;
    const hasSpecial = this.state.plants.some((p) => p.tomatoes.some((t) => t.kind !== 'red'));
    if (hasSpecial) return;
    let kind: TomatoKind | null = null;
    if (this.giantPending) {
      kind = 'giant';
      this.giantPending = false;
    } else if (this.goldenScheduleIndex < this.goldenSchedule.length && this.state.harvestedCount >= this.goldenSchedule[this.goldenScheduleIndex]) {
      kind = 'golden';
      this.goldenScheduleIndex++;
    }
    if (!kind) return;
    // Thường đặt trên cây đang thu hoạch. Riêng cấp Khó đôi lúc đặt trên một cây đầy
    // để luật "quả vàng bị sâu ăn" có thể xảy ra, nhưng người chơi vẫn sẽ gặp cây đó theo vòng.
    if (kind === 'golden' && this.state.difficulty === 'hard') {
      const max = Math.max(...this.state.plants.map((p) => p.tomatoes.length));
      const full = this.state.plants.map((p, n) => ({ p, n })).filter(({ p }) => p.tomatoes.length === max);
      if (max > plant.tomatoes.length && clampRandom(this.random) < 0.25) {
        i = full[this.pick(full.length)].n;
        plant = this.state.plants[i];
      }
    }
    const tomatoes = plant.tomatoes.map((t, n) => (n === 0 ? { ...t, kind: kind! } : t));
    const plants = this.state.plants.map((p, n) => (n === i ? { ...p, tomatoes } : p));
    this.state = {
      ...this.state,
      plants,
      goldenTomatoesSpawned: this.state.goldenTomatoesSpawned + (kind === 'golden' ? 1 : 0),
      giantTomatoTriggered: this.state.giantTomatoTriggered || kind === 'giant',
    };
  }

  private makeGoldenSchedule(quota: number): number[] {
    const anchors = quota === 3 ? [5, 23, 41] : [4, 16, 29, 43];
    return anchors.map((a) => Math.min(46, Math.max(2, a + Math.floor(clampRandom(this.random) * 5) - 2)));
  }

  private nextNote(notes: readonly number[]): number {
    if (notes.length < 2) return notes[0];
    let note = notes[this.pick(notes.length)];
    if (note === this.state.targetNote) note = notes[(notes.indexOf(note) + 1) % notes.length];
    return note;
  }

  private redTomatoes(): Tomato[] {
    return Array.from({ length: MAX_TOMATOES }, () => ({ id: this.nextTomatoId++, kind: 'red' as const }));
  }

  private regrowDelay(): number {
    return 2000 + Math.floor(clampRandom(this.random) * 1001);
  }

  private pick(length: number): number {
    return Math.floor(clampRandom(this.random) * length);
  }

  private hasMilestone(key: string): boolean {
    return this.state.triggeredRewardMilestones.includes(key);
  }

  private addMilestone(key: string): void {
    this.state = { ...this.state, triggeredRewardMilestones: [...this.state.triggeredRewardMilestones, key] };
  }

  private update(patch: Partial<TomatoHarvestState>, event?: TomatoEvent, now = 0): void {
    this.state = { ...this.state, ...patch };
    if (event) this.emit(event, now);
    else this.notify();
  }

  private emit(event: TomatoEvent, now: number): void {
    const sequence = this.state.eventSequence + 1;
    this.state = {
      ...this.state,
      lastEvent: event,
      eventSequence: sequence,
      eventLog: [...this.state.eventLog, { sequence, event }].slice(-30),
      lastEventTime: now,
    };
    this.notify();
  }

  private notify(): void {
    this.listeners.forEach((listener) => listener());
  }
}

export function tomatoAccuracy(state: Pick<TomatoHarvestState, 'totalCorrectNotes' | 'totalWrongNotes'>): number {
  const total = state.totalCorrectNotes + state.totalWrongNotes;
  return total === 0 ? 0 : state.totalCorrectNotes / total;
}

export function tomatoStars(accuracy: number): 1 | 2 | 3 {
  if (accuracy >= 0.9) return 3;
  if (accuracy >= 0.7) return 2;
  return 1;
}
