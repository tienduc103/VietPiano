/**
 * Hồ sơ kỹ năng (Finger Technique Profile, đặc tả §18) — SUY từ kết quả chấm của Coach, không lưu riêng (quyết định F3).
 * Chỉ kỹ năng đo được bằng MIDI; giá trị 0..1 cùng định nghĩa giữa các bài (giá trị tiêu chí, không phải điểm tổng có trọng số riêng).
 */
import type { ScoringResult } from '../coach/types';
import { criterionValue, stableTempo, tempoAttempts } from '../smartPractice/tempo';
import { exerciseForLesson } from './catalog';
import { SKILL_ORDER, type FingerExercise, type SkillId } from './types';

const DAY = 86_400_000;
/** Mẫu cũ hơn chừng này ngày có trọng số bằng một nửa. */
const HALF_LIFE_DAYS = 14;

export interface SkillSample {
  skill: SkillId;
  value: number;
  at: number;
  resultId: string;
  lessonId: string;
}

export interface SkillProgress {
  skillId: SkillId;
  /** 0..1; null = chưa có dữ liệu đo được. */
  proficiency: number | null;
  /** TB 7 ngày gần nhất − TB 7–30 ngày trước (null = thiếu một trong hai). */
  trend: number | null;
  confidence: 'low' | 'medium' | 'high';
  samples: number;
  lastPracticedAt: number | null;
}

type ExerciseLookup = (lessonId: string) => Pick<FingerExercise, 'transitionNotes' | 'tempoRange'> | undefined;

/** Mẫu kỹ năng của MỘT kết quả (không gồm consistency / speed — cần nhiều lượt). */
export function resultSkillSamples(r: ScoringResult, lookup: ExerciseLookup = exerciseForLesson): SkillSample[] {
  const out: SkillSample[] = [];
  const push = (skill: SkillId, value: number | null | undefined) => {
    if (value === null || value === undefined || !Number.isFinite(value)) return;
    out.push({ skill, value: Math.max(0, Math.min(1, value)), at: r.createdAt, resultId: r.id, lessonId: r.lessonId });
  };
  if (r.confidence.alignment < 0.4) return out;
  push('notes', criterionValue(r, 'notes'));
  push('rhythm', criterionValue(r, 'rhythm'));
  push('duration', criterionValue(r, 'duration'));
  push('dynamics', criterionValue(r, 'dynamics'));
  push('coordination', r.hands.syncRate ?? null);
  const ex = lookup(r.lessonId);
  if (ex?.transitionNotes.length && r.referenceId === r.lessonId) {
    const set = new Set(ex.transitionNotes);
    const rows = r.alignment.filter((a) => a.refId && set.has(a.refId));
    if (rows.length) push('transition', rows.filter((a) => a.status === 'correct' && a.timing !== 'late' && a.timing !== 'early').length / rows.length);
  }
  return out;
}

/** Độ ổn định của một bài: 1 − 3 × hệ số biến thiên điểm 5 lượt gần nhất (≥ 3 lượt). */
export function consistencyOf(results: readonly ScoringResult[]): number | null {
  const last = [...results].sort((a, b) => a.createdAt - b.createdAt).slice(-5);
  if (last.length < 3) return null;
  const xs = last.map((r) => r.total);
  const mean = xs.reduce((s, x) => s + x, 0) / xs.length;
  if (mean <= 0) return 0;
  const sd = Math.sqrt(xs.reduce((s, x) => s + (x - mean) ** 2, 0) / xs.length);
  return Math.max(0, Math.min(1, 1 - (3 * sd) / mean));
}

/** Mọi mẫu kỹ năng từ danh sách kết quả của MỘT hồ sơ. */
export function skillSamples(results: readonly ScoringResult[], lookup: ExerciseLookup = exerciseForLesson): SkillSample[] {
  const out = results.flatMap((r) => resultSkillSamples(r, lookup));
  const byRef = new Map<string, ScoringResult[]>();
  for (const r of results) (byRef.get(r.referenceId) ?? byRef.set(r.referenceId, []).get(r.referenceId)!).push(r);
  for (const [refId, rs] of byRef) {
    const latest = rs.reduce((a, b) => (b.createdAt > a.createdAt ? b : a));
    const c = consistencyOf(rs);
    if (c !== null) out.push({ skill: 'consistency', value: c, at: latest.createdAt, resultId: latest.id, lessonId: latest.lessonId });
    const ex = lookup(latest.lessonId);
    if (ex && refId === latest.lessonId) {
      const stable = stableTempo(tempoAttempts(rs));
      const [lo, hi] = ex.tempoRange;
      if (stable !== null) out.push({ skill: 'speed', value: Math.max(0, Math.min(1, (stable - lo) / (hi - lo))), at: latest.createdAt, resultId: latest.id, lessonId: latest.lessonId });
    }
  }
  return out;
}

export function getSkillProgress(results: readonly ScoringResult[], now: number, lookup: ExerciseLookup = exerciseForLesson): Record<SkillId, SkillProgress> {
  const samples = skillSamples(results, lookup);
  const out = {} as Record<SkillId, SkillProgress>;
  for (const skill of SKILL_ORDER) {
    const xs = samples.filter((s) => s.skill === skill).sort((a, b) => b.at - a.at).slice(0, 40);
    let wsum = 0;
    let vsum = 0;
    for (const s of xs) {
      const w = 0.5 ** (Math.max(0, now - s.at) / DAY / HALF_LIFE_DAYS);
      wsum += w;
      vsum += w * s.value;
    }
    const recent = xs.filter((s) => now - s.at <= 7 * DAY);
    const older = xs.filter((s) => now - s.at > 7 * DAY && now - s.at <= 30 * DAY);
    const avg = (ys: SkillSample[]) => ys.reduce((a, s) => a + s.value, 0) / ys.length;
    out[skill] = {
      skillId: skill,
      proficiency: xs.length && wsum > 0 ? Math.round((vsum / wsum) * 1000) / 1000 : null,
      trend: recent.length && older.length ? Math.round((avg(recent) - avg(older)) * 1000) / 1000 : null,
      confidence: xs.length >= 8 ? 'high' : xs.length >= 3 ? 'medium' : 'low',
      samples: xs.length,
      lastPracticedAt: xs.length ? xs[0].at : null,
    };
  }
  return out;
}

/** Kỹ năng yếu nhất có đủ dữ liệu (độ tin cậy ≥ trung bình) và dưới ngưỡng. */
export function weakestSkill(progress: Record<SkillId, SkillProgress>, threshold = 0.85): SkillProgress | null {
  const xs = Object.values(progress).filter((p) => p.proficiency !== null && p.confidence !== 'low' && p.proficiency < threshold);
  xs.sort((a, b) => a.proficiency! - b.proficiency!);
  return xs[0] ?? null;
}
