/**
 * Trạng thái buổi học và bài nên học tiếp. Theo quyết định sản phẩm, giáo trình CHỈ GỢI Ý thứ tự:
 * buổi chưa đủ điều kiện vẫn mở được, chỉ hiện "Nên học trước: …". Đổi sang khoá cứng chỉ cần
 * chặn ở UI theo `status === 'suggest-later'`.
 */
import type { LessonRecord } from './progress';
import { text, type Curriculum, type CurriculumLesson, type Level } from './types';

/**
 * completed     : đã đạt.
 * in-progress   : đã làm nhưng chưa đạt.
 * available     : đủ điều kiện, chưa làm.
 * suggest-later : còn buổi tiên quyết chưa đạt (vẫn mở được).
 */
export type LessonStatus = 'completed' | 'in-progress' | 'available' | 'suggest-later';

export type Records = Record<string, LessonRecord | undefined>;

export function isPassed(records: Records, lessonId: string): boolean {
  return records[lessonId]?.passed === true;
}

/** Buổi tiên quyết còn chưa đạt. */
export function missingPrerequisites(lesson: CurriculumLesson, records: Records): string[] {
  const required = new Set([...lesson.prerequisites, ...lesson.unlockCriteria.lessonsPassed]);
  return [...required].filter((id) => !isPassed(records, id));
}

export function lessonStatus(lesson: CurriculumLesson, records: Records): LessonStatus {
  const rec = records[lesson.lessonId];
  if (rec?.passed) return 'completed';
  if (rec && (rec.attempts > 0 || Object.keys(rec.exercises).length > 0 || rec.activitiesDone)) return 'in-progress';
  return missingPrerequisites(lesson, records).length === 0 ? 'available' : 'suggest-later';
}

export function orderedLessons(level: Level): CurriculumLesson[] {
  const byId = new Map(level.lessons.map((l) => [l.lessonId, l]));
  return level.weeks.flatMap((w) => w.lessonIds.map((id) => byId.get(id)!)).filter(Boolean);
}

export interface LevelProgress {
  completed: number;
  total: number;
  /** Buổi nên học tiếp: buổi đầu tiên chưa đạt theo thứ tự; null khi đã xong cả cấp. */
  next: CurriculumLesson | null;
}

export function levelProgress(level: Level, records: Records): LevelProgress {
  const lessons = orderedLessons(level);
  const completed = lessons.filter((l) => isPassed(records, l.lessonId)).length;
  return { completed, total: lessons.length, next: lessons.find((l) => !isPassed(records, l.lessonId)) ?? null };
}

/** Cấp độ đang học: cấp đầu tiên có nội dung mà chưa xong. */
export function currentLevel(curriculum: Curriculum, records: Records): Level | null {
  const available = curriculum.levels.filter((l) => l.availability === 'available');
  return available.find((l) => levelProgress(l, records).next !== null) ?? available[available.length - 1] ?? null;
}

/** Buổi kế tiếp sau `lessonId` theo thứ tự giáo trình (nút "Bài tiếp theo"). */
export function nextLessonAfter(curriculum: Curriculum, lessonId: string): CurriculumLesson | null {
  const all = curriculum.levels.filter((l) => l.availability === 'available').flatMap(orderedLessons);
  const i = all.findIndex((l) => l.lessonId === lessonId);
  return i >= 0 ? (all[i + 1] ?? null) : null;
}

export function findLesson(curriculum: Curriculum, lessonId: string): CurriculumLesson | undefined {
  for (const level of curriculum.levels) {
    const l = level.lessons.find((x) => x.lessonId === lessonId);
    if (l) return l;
  }
  return undefined;
}

/** Thành tích hiển thị ở Dashboard (suy từ tiến độ, không lưu riêng). */
export interface Achievement {
  id: string;
  title: string;
  earned: boolean;
}

export function achievements(curriculum: Curriculum, records: Records): Achievement[] {
  const out: Achievement[] = [];
  const all = Object.values(records).filter((r): r is LessonRecord => !!r);
  out.push({ id: 'first-lesson', title: 'Buổi học đầu tiên', earned: all.some((r) => r.passed) });
  out.push({ id: 'perfect', title: 'Điểm tuyệt đối 100', earned: all.some((r) => r.bestScore >= 100) });
  out.push({ id: 'practice-30', title: 'Luyện đủ 30 phút', earned: all.reduce((a, r) => a + r.practiceMs, 0) >= 30 * 60_000 });
  for (const level of curriculum.levels) {
    if (level.availability !== 'available') continue;
    for (const week of level.weeks) {
      out.push({ id: `${week.weekId}-done`, title: `Xong ${text(week.title)}`, earned: week.lessonIds.every((id) => isPassed(records, id)) });
    }
  }
  return out;
}
