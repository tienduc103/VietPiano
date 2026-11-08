/**
 * Quy tắc theo tiến độ học: Tiếp tục học (đặc tả 2.1) + Ôn tập định kỳ (2.6).
 *
 * - Buổi đang dở: trạng thái 'in-progress' của `curriculum/unlock.ts` (đã làm, chưa đạt) ở cả ba giáo trình.
 * - Bài Thư viện dừng giữa chừng: phiên MỚI NHẤT của bài chưa chơi hết, có tiến độ rõ (≥ 3 nốt, chưa tới nốt cuối).
 * - Buổi tiếp theo: buổi đầu tiên chưa đạt của cấp đang học (như "Buổi tiếp theo" ở trang chủ) — chỉ khi đủ buổi
 *   tiên quyết. Giáo trình chỉ GỢI Ý thứ tự (không khoá cứng) nhưng đề xuất không bao giờ vượt điều kiện đó.
 * - Ôn tập: bài đã đạt, lâu chưa luyện, khoảng ôn giãn dần (spaced repetition đơn giản), chỉ là gợi ý — không bắt buộc.
 */
import { CURRICULUM } from '../../curriculum/content/curriculum';
import type { LessonRecord } from '../../curriculum/progress';
import { currentLevel, isPassed, lessonStatus, levelProgress, missingPrerequisites } from '../../curriculum/unlock';
import { MASTERED_ACCURACY } from '../../profile/assessment';
import { applySession, emptyProgress, type LessonProgress, type PracticeSession } from '../../storage/ProgressStorage';
import { bonus, cmp, COURSE_LABEL, courseLessons, DAY_MS, daysBetween, pct, relDay, type CourseLesson, type SmartInput } from './context';
import { BASE_SCORE, MAX_BONUS, type SmartDraft } from './types';

/** Bài Thư viện dừng giữa chừng: chỉ gợi ý tiếp tục trong chừng này ngày. */
export const UNFINISHED_PRACTICE_DAYS = 14;
/** Phải tới ít nhất chừng này nốt thì mới coi là "đang tập dở" (mở rồi thoát ngay không tính). */
export const MIN_NOTES_REACHED = 3;
/** Số đề xuất "Tiếp tục" tối đa (gần nhất trước). */
export const MAX_CONTINUE = 2;

function exercisesPassed(cl: CourseLesson, rec: LessonRecord): number {
  return cl.lesson.exercises.filter((e) => rec.exercises[e.id]?.passed).length;
}

function lessonProgressText(cl: CourseLesson, rec: LessonRecord): string {
  const total = cl.lesson.exercises.length;
  const passed = exercisesPassed(cl, rec);
  const tried = cl.lesson.exercises.filter((e) => rec.exercises[e.id]).length;
  if (passed > 0) return `Đã đạt ${passed}/${total} bài tập`;
  if (tried > 0) return `Đã làm ${tried}/${total} bài tập`;
  return rec.activitiesDone ? 'Đã xem phần giới thiệu' : 'Đã bắt đầu';
}

interface Timed {
  at: number;
  draft: Omit<SmartDraft, 'score'>;
}

function unfinishedPractice(input: SmartInput): Timed | null {
  const { now, tzOffsetMin } = input;
  const latest = new Map<string, PracticeSession>();
  for (const s of input.sessions) {
    const prev = latest.get(s.lessonId);
    if (!prev || s.startedAt > prev.startedAt) latest.set(s.lessonId, s);
  }
  const unfinished = [...latest.values()]
    .filter(
      (s) =>
        !s.completed &&
        // Tập riêng một tay: route Luyện tập không mở lại được đúng tay đó → không có "trạng thái tiếp tục rõ ràng".
        !s.hand &&
        s.notesReached >= MIN_NOTES_REACHED &&
        s.notesReached < s.totalNotes &&
        now - s.startedAt <= UNFINISHED_PRACTICE_DAYS * DAY_MS &&
        input.library.some((l) => l.id === s.lessonId),
    )
    .sort((a, b) => b.startedAt - a.startedAt || cmp(a.lessonId, b.lessonId));
  const s = unfinished[0];
  if (!s) return null;
  return {
    at: s.startedAt + s.durationMs,
    draft: {
      type: 'continue',
      target: { type: 'practice', id: s.lessonId, ...(s.measures ? { params: { measures: s.measures } } : {}) },
      verb: 'Tiếp tục',
      icon: '▶️',
      reason: `Lần trước dừng ở nốt ${s.notesReached}/${s.totalNotes} · ${relDay(s.startedAt, now, tzOffsetMin)}`,
      evidence: { kind: 'practice-unfinished', lessonId: s.lessonId, notesReached: s.notesReached, totalNotes: s.totalNotes, at: s.startedAt },
    },
  };
}

/** Buổi đang dở (ba giáo trình) + bài Thư viện dừng giữa chừng — gần nhất trước, tối đa `MAX_CONTINUE`. */
export function continueDrafts(input: SmartInput): SmartDraft[] {
  const { records, now, tzOffsetMin } = input;
  const items: Timed[] = [];
  for (const cl of courseLessons()) {
    const rec = records[cl.lesson.lessonId];
    if (!rec || lessonStatus(cl.lesson, records) !== 'in-progress') continue;
    // Còn buổi tiên quyết chưa đạt → không đề xuất (không vượt điều kiện mở khoá).
    if (missingPrerequisites(cl.lesson, records).length > 0) continue;
    items.push({
      at: rec.lastPracticedAt,
      draft: {
        type: 'continue',
        target: { type: 'lesson', id: cl.lesson.lessonId },
        verb: 'Tiếp tục',
        icon: '▶️',
        reason: `${lessonProgressText(cl, rec)} · học lần cuối ${relDay(rec.lastPracticedAt, now, tzOffsetMin)}`,
        evidence: {
          kind: 'lesson-in-progress',
          lessonId: cl.lesson.lessonId,
          exercisesPassed: exercisesPassed(cl, rec),
          exercisesTotal: cl.lesson.exercises.length,
          lastPracticedAt: rec.lastPracticedAt,
        },
      },
    });
  }
  const practice = unfinishedPractice(input);
  if (practice) items.push(practice);
  items.sort((a, b) => b.at - a.at || cmp(a.draft.target.id, b.draft.target.id));
  return items.slice(0, MAX_CONTINUE).map((it, i) => ({ ...it.draft, score: BASE_SCORE.inProgress - i * 3 }));
}

/**
 * Buổi tiếp theo đã mở: giáo trình chính (cả khi chưa có lịch sử nào → "Bắt đầu — Buổi 1") và hai giáo trình
 * dẫn dắt mà hồ sơ đã bắt đầu. Buổi tiếp theo đang dở thì `continueDrafts` đã đề xuất (điểm cao hơn).
 */
export function nextDrafts(input: SmartInput): SmartDraft[] {
  const { records } = input;
  const out: SmartDraft[] = [];
  const level = currentLevel(CURRICULUM, records);
  if (level) {
    const progress = levelProgress(level, records);
    const next = progress.next;
    if (next && lessonStatus(next, records) === 'available') {
      const first = !courseLessons().some((c) => c.course === 'main' && !!records[c.lesson.lessonId]);
      out.push({
        type: 'continue',
        target: { type: 'lesson', id: next.lessonId },
        verb: first ? 'Bắt đầu' : 'Bài mới',
        icon: '📗',
        reason: first ? `Buổi đầu tiên của Cấp ${level.number}` : `Buổi tiếp theo của Cấp ${level.number} · đã đạt ${progress.completed}/${progress.total} buổi`,
        evidence: { kind: 'next-lesson', lessonId: next.lessonId, passedInLevel: progress.completed, levelTotal: progress.total, first },
        score: BASE_SCORE.next + (first ? 0 : Math.min(MAX_BONUS.next, 2)),
      });
    }
  }
  for (const course of ['discovery', 'supplement'] as const) {
    const lessons = courseLessons().filter((c) => c.course === course);
    if (!lessons.some((c) => records[c.lesson.lessonId])) continue;
    const next = lessons.find((c) => !isPassed(records, c.lesson.lessonId));
    if (!next || lessonStatus(next.lesson, records) !== 'available') continue;
    const passed = lessons.filter((c) => isPassed(records, c.lesson.lessonId)).length;
    out.push({
      type: 'continue',
      target: { type: 'lesson', id: next.lesson.lessonId },
      verb: 'Bài mới',
      icon: course === 'discovery' ? '🎹' : '🎵',
      reason: `${COURSE_LABEL[course]} · đã đạt ${passed}/${lessons.length} buổi`,
      evidence: { kind: 'next-lesson', lessonId: next.lesson.lessonId, passedInLevel: passed, levelTotal: lessons.length, first: false },
      score: BASE_SCORE.next,
    });
  }
  return out;
}

// ─── Ôn tập định kỳ ─────────────────────────────────────────────────────────────────────────────

/** Khoảng ôn (ngày) theo số lần đã luyện bài đã đạt: lần đầu sau 7 ngày, rồi 14, 30, 60. */
export const REVIEW_INTERVALS_DAYS: readonly number[] = [7, 14, 30, 60];

/**
 * Khoảng ôn của một bài: điểm cao nhất < 80 (chưa chắc) → ôn sớm gấp đôi; ≥ 95 (rất chắc) → giãn gấp đôi.
 * `reps` = số lần đã luyện trọn bài (≥ 1).
 */
export function reviewIntervalDays(reps: number, bestScore: number): number {
  const base = REVIEW_INTERVALS_DAYS[Math.min(Math.max(1, reps), REVIEW_INTERVALS_DAYS.length) - 1];
  if (bestScore < 80) return Math.ceil(base / 2);
  return bestScore >= 95 ? base * 2 : base;
}

interface Due {
  ratio: number;
  bestScore: number;
  order: number;
  draft: SmartDraft;
}

/** Bài đã học nên ôn lại: quá hạn nhiều nhất trước (rồi điểm thấp hơn trước). */
export function reviewDrafts(input: SmartInput): SmartDraft[] {
  const { records, now, tzOffsetMin } = input;
  const due: Due[] = [];
  const level = currentLevel(CURRICULUM, records);
  for (const cl of courseLessons()) {
    const rec = records[cl.lesson.lessonId];
    if (!rec?.passed || rec.lastPracticedAt <= 0) continue;
    // Giáo trình chính: chỉ ôn bài của cấp đang học hoặc cấp ngay dưới (phù hợp mức hiện tại).
    if (cl.course === 'main' && level && cl.level.number < level.number - 1) continue;
    const reps = Math.max(1, rec.attempts) + rec.reviewCount;
    const interval = reviewIntervalDays(reps, rec.bestScore);
    const days = daysBetween(rec.lastPracticedAt, now, tzOffsetMin);
    if (days < interval) continue;
    const ratio = days / interval;
    due.push({
      ratio,
      bestScore: rec.bestScore,
      order: cl.order + (cl.course === 'main' ? 0 : 10_000),
      draft: {
        type: 'review',
        target: { type: 'lesson', id: cl.lesson.lessonId },
        verb: 'Ôn lại',
        icon: '🔄',
        reason: `Đạt ${Math.round(rec.bestScore)} điểm · ${days} ngày chưa luyện`,
        evidence: { kind: 'review-due', lessonId: cl.lesson.lessonId, daysSince: days, intervalDays: interval, bestScore: rec.bestScore, source: 'curriculum' },
        score: BASE_SCORE.reviewDue + bonus((ratio - 1) * 3, MAX_BONUS.reviewDue),
      },
    });
  }
  // Bài Thư viện đã chơi hết nhưng chưa thuộc (< 90% nốt đúng).
  const progress: Record<string, LessonProgress> = {};
  for (const s of [...input.sessions].sort((a, b) => a.startedAt - b.startedAt)) progress[s.lessonId] = applySession(progress[s.lessonId] ?? emptyProgress(s.lessonId), s);
  input.library.forEach((lesson, i) => {
    const p = progress[lesson.id];
    if (!p || p.completions === 0 || p.bestAccuracy >= MASTERED_ACCURACY) return;
    const best = Math.round(p.bestAccuracy * 100);
    const interval = reviewIntervalDays(p.completions, best);
    const days = daysBetween(p.lastPracticedAt, now, tzOffsetMin);
    if (days < interval) return;
    const ratio = days / interval;
    due.push({
      ratio,
      bestScore: best,
      order: 20_000 + i,
      draft: {
        type: 'review',
        target: { type: 'practice', id: lesson.id },
        verb: 'Ôn lại',
        icon: '🔄',
        reason: `Tốt nhất ${pct(p.bestAccuracy)} nốt đúng · ${days} ngày chưa tập`,
        evidence: { kind: 'review-due', lessonId: lesson.id, daysSince: days, intervalDays: interval, bestScore: best, source: 'library' },
        score: BASE_SCORE.reviewDue + bonus((ratio - 1) * 3, MAX_BONUS.reviewDue),
      },
    });
  });
  due.sort((a, b) => b.ratio - a.ratio || a.bestScore - b.bestScore || a.order - b.order);
  return due.slice(0, 3).map((d) => d.draft);
}
