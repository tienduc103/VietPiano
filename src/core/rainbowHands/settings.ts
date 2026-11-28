/**
 * Cài đặt (phần phụ huynh) + bốn chế độ của "Cầu vồng hai bàn tay". Mọi chế độ dựng cùng một `RainbowEngine`
 * qua `resolvePlan` — không có logic chấm riêng theo chế độ.
 */
import type { Hand } from '../lessons/types';
import type { TimingMode } from './RainbowEngine';
import { DEFAULT_STARTS, effectiveStarts, isValidStart, type HandSet, type Motion, type RainbowPath } from './route';
import { RHYTHM_PATTERN_IDS, type RhythmPatternId } from './durations';
import { SPEED_IDS, type SpeedEase, type SpeedId } from './speed';

/** A từng tay · B hai tay cùng bước · C lên núi – xuống núi · D giữ nhịp · E hai tay ngược chiều · F trường độ · G nhanh – chậm. */
export type RainbowMode = 'single' | 'steps' | 'mountain' | 'tempo' | 'contrary' | 'durations' | 'speed';
export const RAINBOW_MODES: readonly RainbowMode[] = ['single', 'steps', 'mountain', 'tempo', 'contrary', 'durations', 'speed'];
export type HintLevel = 'full' | 'light' | 'none';
export type EffectVolume = 'off' | 'low' | 'mid';

export const MODE_INFO: Record<RainbowMode, { label: string; icon: string; hint: string }> = {
  single: { label: 'Tập từng tay', icon: '✋', hint: 'Một tay đi lên, đi xuống hoặc cả vòng — chậm rãi, không có đồng hồ.' },
  steps: { label: 'Hai tay cùng bước', icon: '🤝', hint: 'Mỗi bước một cặp nốt. Game chờ đủ cả hai tay mới đi tiếp.' },
  mountain: { label: 'Lên núi – xuống núi', icon: '⛰️', hint: 'Hai tay chạy lên rồi xuống trọn vòng — đưa các bạn thú về nhà.' },
  tempo: { label: 'Giữ nhịp', icon: '🥁', hint: 'Đếm vào rồi nhịp chạy đều — nốt trễ hoặc thiếu được ghi lại.' },
  contrary: { label: 'Hai tay ngược chiều', icon: '↔️', hint: 'Tay phải đi lên khi tay trái đi xuống — hai tay tách ra rồi gom lại, cùng số ngón cùng lúc.' },
  durations: { label: 'Trường độ', icon: '🎼', hint: 'Mỗi bước một hình nốt: tròn, trắng, đen, móc đơn, móc kép — bấm đúng phách và giữ phím đủ dài.' },
  speed: { label: 'Nhanh – chậm', icon: '🐢🐇', hint: 'Máy bảo thật chậm, chậm, nhanh hay thật nhanh — chậm quá cá sấu đớp, nhanh quá sét đánh!' },
};

export const ROUND_CHOICES = [1, 3, 5] as const;
export const SYNC_CHOICES = [400, 250, 150] as const;
export const BPM_CHOICES = [40, 50, 60, 72, 84, 96] as const;
export const PASS_CHOICES = [0.7, 0.8, 0.9] as const;
export const ON_TIME_CHOICES = [0.6, 0.7, 0.8] as const;
/** Nhanh – chậm: số bước mỗi chặng trước khi máy đổi tốc độ. */
export const SPEED_SEGMENT_CHOICES = [4, 8, 15] as const;
/** "Tập chậm": nhịp × hệ số này (giữ nhịp) / nghe mẫu chậm lại. */
export const SLOW_FACTOR = 0.75;

export interface RainbowSettings {
  mode: RainbowMode;
  /** Tay của chế độ Tập từng tay. */
  hand: Hand;
  /** Tay của chế độ Giữ nhịp và Trường độ. */
  tempoHands: HandSet;
  /** Trường độ: mẫu tiết tấu. */
  rhythm: RhythmPatternId;
  /** Nhanh – chậm: tay, các tốc độ máy được đưa ra, số bước mỗi chặng, mức dễ của dải tốc độ. */
  speedHands: HandSet;
  speeds: SpeedId[];
  speedSegment: (typeof SPEED_SEGMENT_CHOICES)[number];
  speedEase: SpeedEase;
  /** Đường đi của chế độ A / B / E (C, D luôn cả vòng). */
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
  /** Hiện bàn phím ảo dưới màn chơi (mặc định ẩn). Không micro, không đàn MIDI → bàn phím ảo là nguồn nốt, luôn hiện. */
  showKeyboard: boolean;
  /** Tiêu chí vòng đạt: độ chính xác mỗi tay. */
  passAccuracy: number;
  /** Giữ nhịp: tỉ lệ đúng nhịp mỗi tay để vòng đạt (và để gợi ý tăng tốc). */
  passOnTime: number;
}

export const DEFAULT_RAINBOW_SETTINGS: RainbowSettings = {
  mode: 'steps',
  hand: 'right',
  tempoHands: 'both',
  rhythm: 'h-q-q',
  speedHands: 'right',
  speeds: ['slow', 'fast'],
  speedSegment: 4,
  speedEase: 'easy',
  path: 'round',
  starts: { ...DEFAULT_STARTS },
  rounds: 3,
  syncToleranceMs: 250,
  bpm: 60,
  slow: false,
  volume: 'low',
  hints: 'full',
  fingers: true,
  showKeyboard: false,
  passAccuracy: 0.8,
  passOnTime: 0.7,
};

const pick = <T>(v: unknown, allowed: readonly T[], fallback: T): T => (allowed.includes(v as T) ? (v as T) : fallback);

export function sanitizeSettings(raw: unknown): RainbowSettings {
  const d = DEFAULT_RAINBOW_SETTINGS;
  if (!raw || typeof raw !== 'object') return { ...d, starts: { ...d.starts }, speeds: [...d.speeds] };
  const r = raw as Partial<Record<keyof RainbowSettings, unknown>>;
  const starts = (r.starts && typeof r.starts === 'object' ? r.starts : {}) as Partial<Record<Hand, unknown>>;
  return {
    mode: pick(r.mode, RAINBOW_MODES, d.mode),
    hand: pick(r.hand, ['left', 'right'] as const, d.hand),
    tempoHands: pick(r.tempoHands, ['left', 'right', 'both'] as const, d.tempoHands),
    rhythm: pick(r.rhythm, RHYTHM_PATTERN_IDS, d.rhythm),
    speedHands: pick(r.speedHands, ['left', 'right', 'both'] as const, d.speedHands),
    speeds: (() => {
      const list = Array.isArray(r.speeds) ? SPEED_IDS.filter((id) => (r.speeds as unknown[]).includes(id)) : [];
      return list.length ? list : [...d.speeds];
    })(),
    speedSegment: pick(r.speedSegment, SPEED_SEGMENT_CHOICES, d.speedSegment),
    speedEase: pick(r.speedEase, ['easy', 'normal'] as const, d.speedEase),
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
    showKeyboard: typeof r.showKeyboard === 'boolean' ? r.showKeyboard : d.showKeyboard,
    passAccuracy: pick(r.passAccuracy, PASS_CHOICES, 0.8 as (typeof PASS_CHOICES)[number]),
    passOnTime: pick(r.passOnTime, ON_TIME_CHOICES, 0.7 as (typeof ON_TIME_CHOICES)[number]),
  };
}

export interface RainbowPlan {
  hands: HandSet;
  path: RainbowPath;
  motion: Motion;
  /** Chế độ Trường độ: mẫu tiết tấu gán cho các bước. */
  rhythm: RhythmPatternId | null;
  /** Chế độ Nhanh – chậm: đo khoảng giữa hai lần bấm theo tốc độ máy đưa ra. */
  speed: boolean;
  /** Vùng phím thật (ngược chiều có thể lùi tay trái — `effectiveStarts`). */
  starts: Record<Hand, number>;
  timing: TimingMode;
  rounds: number;
  /** Nhịp thật (đã áp "Tập chậm"). */
  bpm: number;
}

export function resolvePlan(s: RainbowSettings): RainbowPlan {
  const bpm = s.slow ? Math.round(s.bpm * SLOW_FACTOR) : s.bpm;
  const base = { rounds: s.rounds, bpm, motion: 'parallel' as Motion, starts: s.starts, rhythm: null, speed: false };
  switch (s.mode) {
    case 'single':
      return { ...base, hands: s.hand, path: s.path, timing: 'wait' };
    case 'steps':
      return { ...base, hands: 'both', path: s.path, timing: 'wait' };
    case 'mountain':
      return { ...base, hands: 'both', path: 'round', timing: 'wait' };
    case 'tempo':
      return { ...base, hands: s.tempoHands, path: 'round', timing: 'tempo' };
    case 'contrary':
      return { ...base, hands: 'both', path: s.path, timing: 'wait', motion: 'contrary', starts: effectiveStarts(s.starts, 'contrary') };
    case 'durations':
      return { ...base, hands: s.tempoHands, path: 'round', timing: 'tempo', rhythm: s.rhythm };
    case 'speed':
      return { ...base, hands: s.speedHands, path: s.path, timing: 'wait', speed: true };
  }
}

/** Chế độ cần nhận hai nốt cùng lúc → không chạy được khi chỉ có micro (micro chỉ nhận một nốt mỗi lúc). */
export function needsTwoNotes(s: RainbowSettings): boolean {
  return resolvePlan(s).hands === 'both';
}
