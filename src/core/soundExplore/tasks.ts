/**
 * Nhiệm vụ của bài "Khám phá âm thanh": sinh câu hỏi theo mức độ + chấm TỪNG THÀNH PHẦN (cao độ, trường độ).
 * Không có kết quả "Sai" chung: mỗi thành phần trả về "đạt" hoặc gợi ý cụ thể (cao hơn, giữ lâu hơn…).
 */
import type { Random } from '../games/random';
import { shuffle } from '../games/random';
import { classifyDirection, classifyDuration, classifyRegister, type Thresholds } from './classify';
import { LEVEL_PROFILES, type ExploreLevel } from './config';
import type { Press } from './PressTracker';

export type HighLow = 'high' | 'low';
export type UpDown = 'up' | 'down';
export type ShortLong = 'short' | 'long';

export type ListenPitchTask =
  /** Một nốt ở vùng xa: cao hay thấp? */
  | { kind: 'listen-pitch'; variant: 'register'; notes: [number]; answer: HighLow }
  /** Hai nốt liên tiếp: nốt sau cao hơn (lên) hay thấp hơn (xuống)? */
  | { kind: 'listen-pitch'; variant: 'compare'; notes: [number, number]; answer: UpDown }
  /** Chuỗi ba nốt đi lên hay đi xuống (mức 3). */
  | { kind: 'listen-pitch'; variant: 'run'; notes: [number, number, number]; answer: UpDown };

/** Hai tiếng cùng cao độ, khác trường độ; hỏi tiếng nào ngắn / dài. `order[i]` = trường độ của tiếng thứ i. */
export interface ListenDurationTask {
  kind: 'listen-duration';
  midi: number;
  order: [ShortLong, ShortLong];
  ask: ShortLong;
  /** Chỉ số tiếng đúng (0 | 1). */
  answer: 0 | 1;
}

export interface PlayRegisterTask {
  kind: 'play-register';
  target: HighLow;
}
export interface HoldTask {
  kind: 'hold';
  target: ShortLong;
}
export interface GardenTask {
  kind: 'garden';
  register: HighLow;
  duration: ShortLong;
}
export interface MelodyTask {
  kind: 'melody';
  direction: UpDown;
  /** Số nốt bé tự đánh (2–4). */
  length: number;
}

export type Task = ListenPitchTask | ListenDurationTask | PlayRegisterTask | HoldTask | GardenTask | MelodyTask;

const pick = <T>(items: readonly T[], random: Random): T => items[Math.floor(random() * items.length) % items.length];

export function listenPitchTask(level: ExploreLevel, random: Random): ListenPitchTask {
  const p = LEVEL_PROFILES[level];
  const variants: ListenPitchTask['variant'][] = level === 1 ? ['register'] : level === 2 ? ['register', 'compare', 'compare'] : ['compare', 'run'];
  const variant = pick(variants, random);
  if (variant === 'register' || !p.compareInterval) {
    const answer: HighLow = random() < 0.5 ? 'high' : 'low';
    return { kind: 'listen-pitch', variant: 'register', notes: [pick(answer === 'high' ? p.listenHigh : p.listenLow, random)], answer };
  }
  const answer: UpDown = random() < 0.5 ? 'up' : 'down';
  const sign = answer === 'up' ? 1 : -1;
  if (variant === 'compare') {
    const gap = pick(p.compareInterval, random);
    const start = answer === 'up' ? 60 + Math.floor(random() * 5) - gap / 2 : 64 + Math.floor(random() * 5) + gap / 2;
    const a = Math.round(start);
    return { kind: 'listen-pitch', variant: 'compare', notes: [a, a + sign * gap], answer };
  }
  // Chuỗi 3 nốt bậc liền (Đô–Rê–Mi / Sol–Fa–Mi…): bước 2 nửa cung, dễ nghe.
  const a = answer === 'up' ? 60 : 67;
  return { kind: 'listen-pitch', variant: 'run', notes: [a, a + sign * 2, a + sign * 4], answer };
}

export function listenDurationTask(random: Random): ListenDurationTask {
  const first: ShortLong = random() < 0.5 ? 'short' : 'long';
  const order: [ShortLong, ShortLong] = [first, first === 'short' ? 'long' : 'short'];
  const ask: ShortLong = random() < 0.5 ? 'short' : 'long';
  return { kind: 'listen-duration', midi: pick([60, 64, 67], random), order, ask, answer: order[0] === ask ? 0 : 1 };
}

/** Khu vườn: mục tiêu được dùng. Bắt đầu 2 lựa chọn (khác nhau ở CẢ hai thành phần), quen rồi 4. */
export function gardenTargets(choices: 2 | 4): GardenTask[] {
  const two: GardenTask[] = [
    { kind: 'garden', register: 'high', duration: 'long' },
    { kind: 'garden', register: 'low', duration: 'short' },
  ];
  if (choices === 2) return two;
  return [...two, { kind: 'garden', register: 'high', duration: 'short' }, { kind: 'garden', register: 'low', duration: 'long' }];
}

export function nextGardenTask(choices: 2 | 4, random: Random, previous?: GardenTask): GardenTask {
  const pool = gardenTargets(choices).filter((t) => !previous || t.register !== previous.register || t.duration !== previous.duration);
  return pick(pool, random);
}

/** Chuyến phiêu lưu: 5 (mức 1) · 6 (mức 2) · 7 (mức 3) nhiệm vụ, đủ năm loại, xen kẽ nghe / đánh. */
export function buildAdventure(level: ExploreLevel, random: Random): Task[] {
  const count = level === 1 ? 5 : level === 2 ? 6 : 7;
  const melodyLength = level === 3 ? 3 : 2;
  const listen: Task[] = shuffle([listenPitchTask(level, random), listenDurationTask(random)], random);
  const play: Task[] = shuffle<Task>(
    [
      { kind: 'play-register', target: random() < 0.5 ? 'high' : 'low' },
      { kind: 'hold', target: random() < 0.5 ? 'short' : 'long' },
      { kind: 'melody', direction: random() < 0.5 ? 'up' : 'down', length: melodyLength },
    ],
    random,
  );
  const extra: Task[] = [];
  if (count >= 6) extra.push(level === 1 ? listenPitchTask(level, random) : nextGardenTask(level === 3 ? 4 : 2, random));
  if (count >= 7) extra.push(listenDurationTask(random));
  // Xen kẽ: nghe – đánh – nghe – đánh … rồi tới phần thêm.
  const out: Task[] = [];
  for (let i = 0; out.length < 5; i++) {
    if (listen[i]) out.push(listen[i]);
    if (play[i]) out.push(play[i]);
  }
  return [...out, ...extra].slice(0, count);
}

// ─── Chấm từng thành phần ────────────────────────────────────────────────────────────

export type PitchVerdict = 'ok' | 'needHigher' | 'needLower';
export type DurationVerdict = 'ok' | 'needLonger' | 'needShorter' | 'unclear';

export function judgeRegister(midi: number, target: HighLow, t: Pick<Thresholds, 'lowMax' | 'highMin'>): PitchVerdict {
  const r = classifyRegister(midi, t);
  if (r === target) return 'ok';
  return target === 'high' ? 'needHigher' : 'needLower';
}

/** null = chạm vội (< shortMinMs) → bỏ qua lần nhấn, không nhận xét. */
export function judgeDuration(ms: number, target: ShortLong, t: Pick<Thresholds, 'shortMinMs' | 'shortMaxMs' | 'longMinMs'>): DurationVerdict | null {
  const c = classifyDuration(ms, t);
  if (c === 'tooQuick') return target === 'short' ? null : 'needLonger';
  if (c === 'unclear') return 'unclear';
  if (c === target) return 'ok';
  return target === 'long' ? 'needLonger' : 'needShorter';
}

export type GardenOutcome = 'bloom' | 'fixDuration' | 'fixPitch' | 'retryBoth' | 'retryUnclear';

export interface GardenVerdict {
  pitch: PitchVerdict;
  duration: DurationVerdict;
  outcome: GardenOutcome;
}

/** Khu vườn: chấm cao độ + trường độ riêng. null = lần nhấn bỏ qua (chạm vội / bị ngắt do mất kết nối). */
export function judgeGarden(press: Press, task: GardenTask, t: Thresholds): GardenVerdict | null {
  if (press.aborted) return null;
  const duration = judgeDuration(press.durationMs, task.duration, t);
  if (duration === null) return null;
  const pitch = judgeRegister(press.midi, task.register, t);
  const outcome: GardenOutcome =
    pitch === 'ok' && duration === 'ok'
      ? 'bloom'
      : pitch === 'ok'
        ? duration === 'unclear'
          ? 'retryUnclear'
          : 'fixDuration'
        : duration === 'ok' || duration === 'unclear'
          ? 'fixPitch'
          : 'retryBoth';
  return { pitch, duration, outcome };
}

// ─── Đường bay theo giai điệu ────────────────────────────────────────────────────────

export type PathStep = 'start' | 'step' | 'wrongDirection' | 'same' | 'done';

/**
 * Bé đánh lần lượt các nốt đi lên (hoặc đi xuống): mỗi nốt so với nốt ĐÚNG liền trước (so sánh tương đối).
 * Nốt sai hướng / trùng → nhắc, không tính, mốc vẫn là nốt đúng trước đó. Nốt đầu tiên là bất kỳ.
 */
export class PathFollower {
  private notes: number[] = [];

  constructor(
    readonly direction: UpDown,
    readonly length: number,
  ) {}

  feed(midi: number): PathStep {
    if (this.isDone()) return 'done';
    const last = this.notes[this.notes.length - 1];
    if (last === undefined) {
      this.notes.push(midi);
      return 'start';
    }
    const d = classifyDirection(last, midi);
    if (d === 'same') return 'same';
    if (d !== this.direction) return 'wrongDirection';
    this.notes.push(midi);
    return this.isDone() ? 'done' : 'step';
  }

  isDone(): boolean {
    return this.notes.length >= this.length;
  }

  played(): readonly number[] {
    return this.notes;
  }

  reset(): void {
    this.notes = [];
  }
}
