/**
 * Adaptive Tempo (đặc tả §16): đánh giá qua NHIỀU lượt, không theo một lượt đơn lẻ.
 * - Lượt "đạt": tổng ≥ điểm đạt, nốt ≥ 90%, nhịp ≥ 75% (hoặc không đo), đối chiếu được.
 * - Tempo ổn định đã xác minh: tempo cao nhất có ≥ 2 lượt đạt và lượt gần nhất ở tempo đó không trượt.
 * - Hai lượt gần nhất ở tempo đang tập đều đạt → tăng (mặc định +5 ♩/phút, kẹp khoảng tempo của bài);
 *   hai lượt trượt → về tempo ổn định (hoặc −10%); còn lại giữ nguyên. Báo mỏi → không tăng.
 */
import { MIN_ALIGNMENT } from '../coach/scoring/ScoringEngine';
import type { ScoringResult } from '../coach/types';
import type { AdaptiveTempo, TempoAttempt } from './types';

export const NOTES_PASS = 0.9;
export const RHYTHM_PASS = 0.75;
export const DEFAULT_PASS_SCORE = 80;
export const TEMPO_STEP = 5;

export interface TempoOptions {
  /** Tempo gốc của bài (♩/phút) — dùng khi chưa có lượt nào. */
  baseBpm: number;
  tempoRange?: [number, number];
  passScore?: number;
  step?: number;
  /** Người học vừa báo mỏi → không đề xuất tăng. */
  fatigue?: boolean;
}

export function criterionValue(r: ScoringResult, key: string): number | null {
  return r.criteria.find((c) => c.key === key)?.value ?? null;
}

/** Một lượt có đạt yêu cầu (dùng cho tempo, tiên quyết, bài bổ trợ). */
export function isPassed(r: ScoringResult, passScore = DEFAULT_PASS_SCORE): boolean {
  if (r.confidence.alignment < MIN_ALIGNMENT) return false;
  const notes = criterionValue(r, 'notes');
  const rhythm = criterionValue(r, 'rhythm');
  return r.total >= passScore && (notes ?? 0) >= NOTES_PASS && (rhythm === null || rhythm >= RHYTHM_PASS);
}

export function tempoAttempts(results: readonly ScoringResult[], passScore = DEFAULT_PASS_SCORE): TempoAttempt[] {
  return [...results]
    .sort((a, b) => a.createdAt - b.createdAt)
    .map((r) => ({ at: r.createdAt, bpm: Math.round(r.tempo.targetBpm), passed: isPassed(r, passScore), score: r.total }));
}

export function stableTempo(attempts: readonly TempoAttempt[]): number | null {
  const bpms = [...new Set(attempts.map((a) => a.bpm))].sort((a, b) => b - a);
  for (const bpm of bpms) {
    const at = attempts.filter((a) => a.bpm === bpm);
    if (at.filter((a) => a.passed).length >= 2 && at[at.length - 1].passed) return bpm;
  }
  return null;
}

export function getAdaptiveTempo(results: readonly ScoringResult[], opts: TempoOptions): AdaptiveTempo {
  const passScore = opts.passScore ?? DEFAULT_PASS_SCORE;
  const step = opts.step ?? TEMPO_STEP;
  const [lo, hi] = opts.tempoRange ?? [Math.max(30, Math.round(opts.baseBpm * 0.5)), Math.round(opts.baseBpm * 1.25)];
  const clamp = (x: number) => Math.max(lo, Math.min(hi, Math.round(x)));
  const attempts = tempoAttempts(results, passScore);
  const stable = stableTempo(attempts);
  if (!attempts.length) {
    // Bắt đầu chậm hơn tempo bài một chút: chính xác trước, tốc độ sau.
    const start = clamp(Math.min(opts.baseBpm, Math.max(lo, opts.baseBpm * 0.85)));
    return { recommendedBpm: start, action: 'start', stableBpm: null, reason: `Chưa có lượt nào — bắt đầu ở ♩=${start}, chậm và đều trước.`, attempts };
  }
  const current = attempts[attempts.length - 1].bpm;
  const atCurrent = attempts.filter((a) => a.bpm === current).slice(-2);
  const lastTwoPass = atCurrent.length === 2 && atCurrent.every((a) => a.passed);
  const lastTwoFail = atCurrent.length === 2 && atCurrent.every((a) => !a.passed);
  if (lastTwoPass && !opts.fatigue && current < hi) {
    const next = clamp(current + step);
    return { recommendedBpm: next, action: 'increase', stableBpm: stable, reason: `Hai lượt gần nhất ở ♩=${current} đều đạt — thử tăng lên ♩=${next}.`, attempts };
  }
  if (lastTwoFail) {
    const target = stable !== null && stable < current ? stable : clamp(current * 0.9);
    if (target < current)
      return {
        recommendedBpm: target,
        action: 'decrease',
        stableBpm: stable,
        reason: stable !== null && stable < current ? `Hai lượt ở ♩=${current} chưa đạt — quay về ♩=${target}, tempo bạn đã chơi ổn định.` : `Hai lượt ở ♩=${current} chưa đạt — giảm còn ♩=${target}.`,
        attempts,
      };
  }
  const why = opts.fatigue && lastTwoPass ? 'Bạn vừa báo mỏi — giữ tempo, không tăng hôm nay.' : lastTwoPass ? `Đã ở tempo cao nhất của bài (♩=${hi}).` : `Giữ ♩=${current} tới khi đạt 2 lượt liên tiếp.`;
  return { recommendedBpm: current, action: 'hold', stableBpm: stable, reason: why, attempts };
}
