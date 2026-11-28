/**
 * Cài đặt (phần phụ huynh) + bốn chế độ của "Cầu vồng hai bàn tay". Mọi chế độ dựng cùng một `RainbowEngine`
 * qua `resolvePlan` — không có logic chấm riêng theo chế độ.
 */
import type { Hand } from '../lessons/types';
import type { TimingMode } from './RainbowEngine';
import { DEFAULT_STARTS, isValidStart, type HandSet, type RainbowPath } from './route';

/** A từng tay · B hai tay cùng bước · C lên núi – xuống núi · D giữ nhịp. (Ngược chiều: giai đoạn sau, chưa có.) */
export type RainbowMode = 'single' | 'steps' | 'mountain' | 'tempo';
export type HintLevel = 'full' | 'light' | 'none';
export type EffectVolume = 'off' | 'low' | 'mid';

export const MODE_INFO: Record<RainbowMode, { label: string; icon: string; hint: string }> = {
  single: { label: 'Tập từng tay', icon: '✋', hint: 'Một tay đi lên, đi xuống hoặc cả vòng — chậm rãi, không có đồng hồ.' },
  steps: { label: 'Hai tay cùng bước', icon: '🤝', hint: 'Mỗi bước một cặp nốt. Game chờ đủ cả hai tay mới đi tiếp.' },
  mountain: { label: 'Lên núi – xuống núi', icon: '⛰️', hint: 'Hai tay chạy lên rồi xuống trọn vòng — đưa các bạn thú về nhà.' },
  tempo: { label: 'Giữ nhịp', icon: '🥁', hint: 'Đếm vào rồi nhịp chạy đều — nốt trễ hoặc thiếu được ghi lại.' },
};

export const ROUND_CHOICES = [1, 3, 5] as const;
export const SYNC_CHOICES = [400, 250, 150] as const;
export const BPM_CHOICES = [40, 50, 60, 72, 84, 96] as const;
export const PASS_CHOICES = [0.7, 0.8, 0.9] as const;
export const ON_TIME_CHOICES = [0.6, 0.7, 0.8] as const;
/** "Tập chậm": nhịp × hệ số này (giữ nhịp) / nghe mẫu chậm lại. */
export const SLOW_FACTOR = 0.75;

export interface RainbowSettings {
  mode: RainbowMode;
  /** Tay của chế độ Tập từng tay. */
  hand: Hand;
  /** Tay của chế độ Giữ nhịp. */
  tempoHands: HandSet;
  /** Đường đi của chế độ A / B (C, D luôn cả vòng). */
  path: RainbowPath;
  /** Nốt Đô bắt đầu của từng tay. */
  starts: Record<Hand, number>;
  rounds: (typeof ROUND_CHOICES)[number];
  syncToleranceMs: number;
  bpm: number;
  slow: boolean;
  volume: EffectVolume;
  hints: HintLevel;
  fingers: boolean;
  /** Tiêu chí vòng đạt: độ chính xác mỗi tay. */
  passAccuracy: number;
  /** Giữ nhịp: tỉ lệ đúng nhịp mỗi tay để vòng đạt (và để gợi ý tăng tốc). */
  passOnTime: number;
}

export const DEFAULT_RAINBOW_SETTINGS: RainbowSettings = {
  mode: 'steps',
  hand: 'right',
  tempoHands: 'both',
  path: 'round',
  starts: { ...DEFAULT_STARTS },
  rounds: 3,
  syncToleranceMs: 250,
  bpm: 60,
  slow: false,
  volume: 'low',
  hints: 'full',
  fingers: true,
  passAccuracy: 0.8,
  passOnTime: 0.7,
};

const pick = <T>(v: unknown, allowed: readonly T[], fallback: T): T => (allowed.includes(v as T) ? (v as T) : fallback);

export function sanitizeSettings(raw: unknown): RainbowSettings {
  const d = DEFAULT_RAINBOW_SETTINGS;
  if (!raw || typeof raw !== 'object') return { ...d, starts: { ...d.starts } };
  const r = raw as Partial<Record<keyof RainbowSettings, unknown>>;
  const starts = (r.starts && typeof r.starts === 'object' ? r.starts : {}) as Partial<Record<Hand, unknown>>;
  return {
    mode: pick(r.mode, ['single', 'steps', 'mountain', 'tempo'] as const, d.mode),
    hand: pick(r.hand, ['left', 'right'] as const, d.hand),
    tempoHands: pick(r.tempoHands, ['left', 'right', 'both'] as const, d.tempoHands),
    path: pick(r.path, ['up', 'down', 'round'] as const, d.path),
    starts: {
      left: typeof starts.left === 'number' && isValidStart('left', starts.left) ? starts.left : d.starts.left,
      right: typeof starts.right === 'number' && isValidStart('right', starts.right) ? starts.right : d.starts.right,
    },
    rounds: pick(r.rounds, ROUND_CHOICES, d.rounds),
    syncToleranceMs: pick(r.syncToleranceMs, SYNC_CHOICES, 250 as (typeof SYNC_CHOICES)[number]),
    bpm: pick(r.bpm, BPM_CHOICES, 60 as (typeof BPM_CHOICES)[number]),
    slow: typeof r.slow === 'boolean' ? r.slow : d.slow,
    volume: pick(r.volume, ['off', 'low', 'mid'] as const, d.volume),
    hints: pick(r.hints, ['full', 'light', 'none'] as const, d.hints),
    fingers: typeof r.fingers === 'boolean' ? r.fingers : d.fingers,
    passAccuracy: pick(r.passAccuracy, PASS_CHOICES, 0.8 as (typeof PASS_CHOICES)[number]),
    passOnTime: pick(r.passOnTime, ON_TIME_CHOICES, 0.7 as (typeof ON_TIME_CHOICES)[number]),
  };
}

export interface RainbowPlan {
  hands: HandSet;
  path: RainbowPath;
  timing: TimingMode;
  rounds: number;
  /** Nhịp thật (đã áp "Tập chậm"). */
  bpm: number;
}

export function resolvePlan(s: RainbowSettings): RainbowPlan {
  const bpm = s.slow ? Math.round(s.bpm * SLOW_FACTOR) : s.bpm;
  switch (s.mode) {
    case 'single':
      return { hands: s.hand, path: s.path, timing: 'wait', rounds: s.rounds, bpm };
    case 'steps':
      return { hands: 'both', path: s.path, timing: 'wait', rounds: s.rounds, bpm };
    case 'mountain':
      return { hands: 'both', path: 'round', timing: 'wait', rounds: s.rounds, bpm };
    case 'tempo':
      return { hands: s.tempoHands, path: 'round', timing: 'tempo', rounds: s.rounds, bpm };
  }
}

/** Chế độ cần nhận hai nốt cùng lúc → không chạy được khi chỉ có micro (micro chỉ nhận một nốt mỗi lúc). */
export function needsTwoNotes(s: RainbowSettings): boolean {
  return resolvePlan(s).hands === 'both';
}
