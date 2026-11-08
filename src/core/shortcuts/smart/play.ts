/**
 * Quy tắc "Bài luyện phù hợp" (đặc tả 2.3), "Trò chơi phù hợp" (2.4), "Nội dung thường chơi" (2.5).
 *
 * - Bài luyện: dùng lại gợi ý bài của hồ sơ (`profile/recommend.ts`: nhóm tuổi + mục tiêu + độ khó vừa sức + tiến độ),
 *   chỉ nhận bài không khó hơn mức vừa sức quá 1 bậc.
 * - Trò chơi: kỹ năng của buổi đang học (suy từ bài tập thật của buổi) ∩ kỹ năng trò luyện được (skills.ts).
 * - Thường chơi: số lần dùng gom từ kho kết quả sẵn có (usage.ts) + phiên Luyện tập; dưới ngưỡng thì không đề xuất.
 */
import { CURRICULUM } from '../../curriculum/content/curriculum';
import { currentLevel, lessonStatus, levelProgress } from '../../curriculum/unlock';
import { ARCADE_KINDS } from '../../games/arcade';
import { STANDALONE_GAMES } from '../../games/catalog';
import { assessLearner } from '../../profile/assessment';
import { recommendLessons } from '../../profile/recommend';
import type { ShortcutTarget } from '../types';
import { bonus, cmp, courseLesson, courseLessons, DAY_MS, lessonShortLabel, type CourseLesson, type SmartInput } from './context';
import { ARCADE_STARTER_VARIANT, GAME_KIND_SKILLS, lessonSkills, PAGE_SKILLS, SKILL_LABEL, skillOverlap, STANDALONE_GAME_SKILLS } from './skills';
import { BASE_SCORE, MAX_BONUS, type SkillTag, type SmartDraft, type UsageEntry, type UsageUnit } from './types';

// ─── Bài luyện phù hợp ──────────────────────────────────────────────────────────────────────────

export function practiceDrafts(input: SmartInput): SmartDraft[] {
  if (!input.profile) return [];
  const assessment = assessLearner(input.profile, [...input.sessions], [...input.library], input.now, input.tzOffsetMin, input.labelStyle);
  const target = assessment.skill.targetDifficulty;
  return recommendLessons(input.profile, assessment, [...input.library], 6)
    .filter((r) => r.lesson.difficulty <= target + 1)
    .slice(0, 3)
    .map((r) => ({
      type: 'practice' as const,
      target: { type: 'practice' as const, id: r.lesson.id },
      verb: 'Luyện',
      icon: '🎹',
      reason: r.reason,
      evidence: { kind: 'recommended' as const, lessonId: r.lesson.id, why: r.reason, targetDifficulty: target },
      score: BASE_SCORE.practice,
    }));
}

// ─── Trò chơi phù hợp ───────────────────────────────────────────────────────────────────────────

/**
 * Buổi "đang học": buổi đang dở gần nhất; không có thì buổi tiếp theo (chưa đạt, đủ tiên quyết) của giáo trình học gần
 * nhất (vd bé chỉ học "Khám phá nốt nhạc"); chưa học gì → buổi tiếp theo của giáo trình chính.
 */
export function focusLesson(input: SmartInput): CourseLesson | null {
  const { records } = input;
  let best: { cl: CourseLesson; at: number } | null = null;
  const lastByCourse = new Map<CourseLesson['course'], number>();
  for (const cl of courseLessons()) {
    const rec = records[cl.lesson.lessonId];
    if (!rec) continue;
    lastByCourse.set(cl.course, Math.max(lastByCourse.get(cl.course) ?? 0, rec.lastPracticedAt));
    if (lessonStatus(cl.lesson, records) !== 'in-progress') continue;
    if (!best || rec.lastPracticedAt > best.at) best = { cl, at: rec.lastPracticedAt };
  }
  if (best) return best.cl;
  const recent = [...lastByCourse.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  if (recent && recent !== 'main') {
    const next = courseLessons().find((c) => c.course === recent && lessonStatus(c.lesson, records) === 'available');
    if (next) return next;
  }
  const level = currentLevel(CURRICULUM, records);
  const next = level ? levelProgress(level, records).next : null;
  return next ? (courseLesson(next.lessonId) ?? null) : null;
}

interface GameOption {
  target: ShortcutTarget;
  skills: readonly SkillTag[];
  /** Thứ tự ưu tiên khi hoà (nhỏ trước): trò có màn riêng → màn luyện → trò tự do. */
  rank: number;
}

/** Trò có màn riêng: ưu tiên trò nhẹ nhàng cho người mới khi cùng kỹ năng (Bóng bay, cà chua trước F1). */
const STANDALONE_PREFERENCE = ['balloon-pop', 'tomato-harvest', 'flappy-note', 'note-hunter', 'f1-racing'] as const;

export function gameOptions(): GameOption[] {
  const out: GameOption[] = [];
  for (const id of STANDALONE_PREFERENCE) {
    if (STANDALONE_GAMES.some((g) => g.id === id)) out.push({ target: { type: 'game', id }, skills: STANDALONE_GAME_SKILLS[id], rank: out.length });
  }
  for (const [page, skills] of Object.entries(PAGE_SKILLS)) if (skills) out.push({ target: { type: 'page', id: page }, skills, rank: 100 + out.length });
  for (const kind of ARCADE_KINDS) out.push({ target: { type: 'arcade', id: `${kind}:${ARCADE_STARTER_VARIANT[kind]}` }, skills: GAME_KIND_SKILLS[kind], rank: 200 + out.length });
  return out;
}

export function gameDrafts(input: SmartInput): SmartDraft[] {
  // Hết quỹ thời gian chơi → mọi trò đang khoá: không đề xuất (bài học mới cộng thêm giờ chơi).
  if (input.gameTimeRemainingMs <= 0) return [];
  const focus = focusLesson(input);
  if (!focus) return [];
  const skills = lessonSkills(focus.lesson);
  if (skills.length === 0) return [];
  return gameOptions()
    .map((o) => ({ o, shared: skillOverlap(skills, o.skills), extra: o.skills.filter((s) => !skills.includes(s)).length }))
    .filter((x) => x.shared.length > 0)
    // Nhiều kỹ năng chung trước → ít kỹ năng "thừa" (trò sát nội dung buổi hơn) → thứ tự ưu tiên cố định.
    .sort((a, b) => b.shared.length - a.shared.length || a.extra - b.extra || a.o.rank - b.o.rank)
    .slice(0, 3)
    .map(({ o, shared }) => ({
      type: 'game' as const,
      target: o.target,
      reason: `Luyện ${shared.slice(0, 2).map((s) => SKILL_LABEL[s]).join(', ')} — kỹ năng của ${lessonShortLabel(focus)}`,
      evidence: { kind: 'skill-match' as const, lessonId: focus.lesson.lessonId, skills: shared },
      score: BASE_SCORE.game + bonus(shared.length * 3, MAX_BONUS.game),
    }));
}

// ─── Nội dung thường chơi ──────────────────────────────────────────────────────────────────────

/** Ít nhất chừng này lần dùng mới coi là "thường chơi". */
export const MIN_FREQUENT_USES = 3;
/** Phiên Luyện tập: chỉ đếm trong chừng này ngày. */
export const FREQUENT_WINDOW_DAYS = 30;

const UNIT_WORD: Record<UsageUnit, { verb: string; unit: string }> = {
  session: { verb: 'Đã tập', unit: 'lần' },
  play: { verb: 'Đã chơi', unit: 'ván' },
  day: { verb: 'Đã luyện', unit: 'ngày' },
};

export function usageReason(u: Pick<UsageEntry, 'uses' | 'unit' | 'windowDays'>): string {
  const w = UNIT_WORD[u.unit];
  return `${w.verb} ${u.uses} ${w.unit}${u.windowDays ? ` trong ${u.windowDays} ngày` : ''}`;
}

/** Số phiên Luyện tập từng bài trong cửa sổ — "bài được mở lại nhiều lần". */
export function practiceUsage(input: Pick<SmartInput, 'sessions' | 'now'>, windowDays = FREQUENT_WINDOW_DAYS): UsageEntry[] {
  const since = input.now - windowDays * DAY_MS;
  const by = new Map<string, { uses: number; lastAt: number }>();
  for (const s of input.sessions) {
    if (s.startedAt < since) continue;
    const e = by.get(s.lessonId) ?? { uses: 0, lastAt: 0 };
    e.uses += 1;
    e.lastAt = Math.max(e.lastAt, s.startedAt);
    by.set(s.lessonId, e);
  }
  return [...by.entries()].map(([id, e]) => ({ target: { type: 'practice', id }, uses: e.uses, lastAt: e.lastAt, windowDays, unit: 'session' }));
}

export function frequentDrafts(input: SmartInput): SmartDraft[] {
  return [...input.usage, ...practiceUsage(input)]
    .filter((u) => u.uses >= MIN_FREQUENT_USES)
    .sort((a, b) => b.uses - a.uses || (b.lastAt ?? 0) - (a.lastAt ?? 0) || cmp(`${a.target.type}|${a.target.id}`, `${b.target.type}|${b.target.id}`))
    .slice(0, 3)
    .map((u) => ({
      type: 'frequent' as const,
      target: u.target,
      reason: usageReason(u),
      evidence: { kind: 'usage' as const, uses: u.uses, unit: u.unit, windowDays: u.windowDays, lastAt: u.lastAt },
      score: BASE_SCORE.frequent + bonus(u.uses / 3, MAX_BONUS.frequent),
    }));
}
