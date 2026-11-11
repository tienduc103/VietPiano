/**
 * Số liệu Dashboard kỹ thuật (đặc tả §26) — tính từ kết quả / phiên của Coach + bài bổ trợ. Thuần.
 * Biểu đồ tiến bộ dùng giá trị KỸ NĂNG 0..1 (cùng định nghĩa giữa các bài), không dùng điểm tổng (mỗi bài một bộ trọng số riêng).
 */
import type { PerformanceSession, ScoringResult } from '../coach/types';
import { parseRemedialId } from '../smartPractice/remedial';
import { isPassed, stableTempo, tempoAttempts } from '../smartPractice/tempo';
import type { RemedialExercise } from '../smartPractice/types';
import { exerciseForLesson, FINGER_EXERCISES } from './catalog';
import { getSkillProgress, skillSamples, weakestSkill, type SkillProgress } from './skills';
import type { FingerExercise, SkillId, TechniqueGroup, TechniqueLevel } from './types';

export interface DashboardFilter {
  from?: number;
  to?: number;
  skill?: SkillId;
  group?: TechniqueGroup;
  level?: TechniqueLevel;
}

export interface TechniqueDashboard {
  exercisesPracticed: number;
  sessions: number;
  minutes: number;
  passedExercises: number;
  totalExercises: number;
  /** Tỉ lệ bài đã đạt trong phạm vi lọc (0..1). */
  completionRate: number;
  skills: Record<SkillId, SkillProgress>;
  weakSkills: SkillProgress[];
  stableTempos: { exerciseId: string; title: string; stableBpm: number; range: [number, number] }[];
  /** Đoạn khó đã khắc phục (bài bổ trợ "mastered"). */
  fixedPassages: { id: string; sourceTitle: string; noteNames: string[] }[];
  /** Theo ngày: trung bình giá trị kỹ năng (0..1). */
  series: { day: string; values: Partial<Record<SkillId, number>> }[];
}

function dayKey(t: number): string {
  const d = new Date(t);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Bài kỹ thuật của một kết quả (bài bổ trợ của bài kỹ thuật tính về bài gốc). */
function exerciseOfResult(r: ScoringResult): FingerExercise | undefined {
  const p = parseRemedialId(r.lessonId);
  return exerciseForLesson(p ? p.sourceId : r.lessonId);
}

export function buildDashboard(
  allResults: readonly ScoringResult[],
  sessions: readonly PerformanceSession[],
  remedials: readonly RemedialExercise[],
  now: number,
  filter: DashboardFilter = {},
): TechniqueDashboard {
  const inTime = (t: number) => (filter.from === undefined || t >= filter.from) && (filter.to === undefined || t <= filter.to);
  const exOk = (e: FingerExercise | undefined) => !!e && (!filter.group || e.group === filter.group) && (!filter.level || e.level === filter.level) && (!filter.skill || e.targetSkills.includes(filter.skill));
  const scoped = FINGER_EXERCISES.filter((e) => exOk(e));
  // Kết quả thuộc bài kỹ thuật (hoặc bổ trợ của bài kỹ thuật) trong phạm vi lọc; không lọc nhóm / cấp → mọi kết quả (kỹ năng chung).
  const anyExerciseFilter = !!(filter.group || filter.level || filter.skill);
  const results = allResults.filter((r) => inTime(r.createdAt) && (!anyExerciseFilter || exOk(exerciseOfResult(r))));
  const sessionIds = new Set(results.map((r) => r.sessionId));
  const ss = sessions.filter((s) => sessionIds.has(s.id));
  const minutes = Math.round(ss.reduce((m, s) => m + Math.max(0, Math.min(3_600_000, (s.endedAt ?? s.updatedAt) - s.startedAt)), 0) / 60_000);
  const practiced = new Set(results.map((r) => exerciseOfResult(r)?.id).filter(Boolean));
  const passed = scoped.filter((e) => allResults.some((r) => r.lessonId === e.lesson.id && r.referenceId === e.lesson.id && inTime(r.createdAt) && isPassed(r, e.scoringConfig.passScore)));
  const skills = getSkillProgress(results, now);
  const weak: SkillProgress[] = [];
  const copy = { ...skills };
  for (let k = 0; k < 3; k++) {
    const w = weakestSkill(copy);
    if (!w) break;
    weak.push(w);
    copy[w.skillId] = { ...w, proficiency: null };
  }
  const stableTempos = scoped
    .map((e) => {
      const rs = allResults.filter((r) => r.lessonId === e.lesson.id && r.referenceId === e.lesson.id && inTime(r.createdAt));
      const bpm = stableTempo(tempoAttempts(rs, e.scoringConfig.passScore));
      return bpm === null ? null : { exerciseId: e.id, title: e.title, stableBpm: bpm, range: e.tempoRange };
    })
    .filter((x): x is NonNullable<typeof x> => !!x);
  const byDay = new Map<string, Map<SkillId, number[]>>();
  for (const s of skillSamples(results)) {
    if (filter.skill && s.skill !== filter.skill) continue;
    const d = dayKey(s.at);
    const m = byDay.get(d) ?? byDay.set(d, new Map()).get(d)!;
    (m.get(s.skill) ?? m.set(s.skill, []).get(s.skill)!).push(s.value);
  }
  const series = [...byDay.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([day, m]) => ({ day, values: Object.fromEntries([...m.entries()].map(([k, xs]) => [k, Math.round((xs.reduce((a, x) => a + x, 0) / xs.length) * 1000) / 1000])) as Partial<Record<SkillId, number>> }));
  return {
    exercisesPracticed: practiced.size,
    sessions: sessionIds.size,
    minutes,
    passedExercises: passed.length,
    totalExercises: scoped.length,
    completionRate: scoped.length ? Math.round((passed.length / scoped.length) * 100) / 100 : 0,
    skills,
    weakSkills: weak,
    stableTempos,
    fixedPassages: remedials.filter((r) => r.status === 'mastered' && inTime(r.createdAt)).map((r) => ({ id: r.id, sourceTitle: r.sourceTitle, noteNames: r.noteNames })),
    series,
  };
}
