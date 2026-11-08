/**
 * Dữ liệu đầu vào của engine Lối tắt thông minh (đã nạp sẵn, đúng MỘT hồ sơ) + hàm phụ dùng chung giữa các quy tắc.
 * Engine thuần: không đọc localStorage / IndexedDB, không đọc đồng hồ — mọi thứ truyền vào qua `SmartInput`.
 */
import { CURRICULUM } from '../../curriculum/content/curriculum';
import { DISCOVERY } from '../../curriculum/content/discovery';
import { SUPPLEMENT } from '../../curriculum/content/supplement';
import { text, type Curriculum, type CurriculumLesson, type Level } from '../../curriculum/types';
import { orderedLessons, type Records } from '../../curriculum/unlock';
import type { FiveFingerStats } from '../../fiveFinger/stats';
import type { Lesson } from '../../lessons/types';
import type { NoteLabelStyle } from '../../music/notes';
import { dayIndex } from '../../profile/assessment';
import type { LearnerProfile } from '../../profile/LearnerProfile';
import type { PracticeSession } from '../../storage/ProgressStorage';
import type { UsageEntry } from './types';

export interface SmartInput {
  /** Hồ sơ đang chọn ("guest" khi chưa có hồ sơ). */
  profileId: string;
  /** null = khách: bỏ các gợi ý cần tuổi / trình độ (tốc độ đọc theo tuổi, bài vừa sức). */
  profile: LearnerProfile | null;
  now: number;
  /** Lệch múi giờ (phút, như `Date#getTimezoneOffset`) — đếm "hôm qua / 3 ngày trước", hạn ôn tập, hết hạn cache. */
  tzOffsetMin: number;
  /** Tiến độ giáo trình chính + "Làm quen từng nốt" + "Khám phá nốt nhạc" của hồ sơ — ĐÃ nạp xong. */
  records: Records;
  /** Phiên màn Luyện tập (Thư viện bài) của hồ sơ — đã lọc theo hồ sơ (`sessionsForProfile`). */
  sessions: readonly PracticeSession[];
  /** Thư viện bài (`lessonManager.all()`). */
  library: readonly Lesson[];
  /** Lần dùng trò chơi / màn luyện, gom từ kho kết quả sẵn có (usage.ts). */
  usage: readonly UsageEntry[];
  /** Thống kê "5 ngón · 8 nốt" của hồ sơ (null = chưa luyện). */
  fiveFinger: FiveFingerStats | null;
  /** Quỹ thời gian chơi còn lại của hồ sơ — hết (≤ 0) thì mọi trò chơi đang khoá (`GameTimeLocked`). */
  gameTimeRemainingMs: number;
  labelStyle: NoteLabelStyle;
}

// ─── Ba giáo trình chạy bằng LessonPlayer ───────────────────────────────────────────────────────

export type CourseId = 'main' | 'discovery' | 'supplement';

export interface CourseLesson {
  course: CourseId;
  level: Level;
  lesson: CurriculumLesson;
  /** Thứ tự học trong giáo trình đó (0 = đầu tiên). */
  order: number;
}

const COURSES: readonly (readonly [CourseId, Curriculum])[] = [
  ['main', CURRICULUM],
  ['discovery', DISCOVERY],
  ['supplement', SUPPLEMENT],
];

let allLessons: CourseLesson[] | null = null;

/** Mọi buổi (cấp đã có nội dung) của ba giáo trình, theo thứ tự học. */
export function courseLessons(): readonly CourseLesson[] {
  if (allLessons) return allLessons;
  const out: CourseLesson[] = [];
  for (const [course, curriculum] of COURSES) {
    let order = 0;
    for (const level of curriculum.levels) {
      if (level.availability !== 'available') continue;
      for (const lesson of orderedLessons(level)) out.push({ course, level, lesson, order: order++ });
    }
  }
  return (allLessons = out);
}

let byId: Map<string, CourseLesson> | null = null;

export function courseLesson(lessonId: string): CourseLesson | undefined {
  byId ??= new Map(courseLessons().map((c) => [c.lesson.lessonId, c]));
  return byId.get(lessonId);
}

export const COURSE_LABEL: Record<CourseId, string> = { main: 'Giáo trình', discovery: 'Khám phá nốt nhạc', supplement: 'Làm quen từng nốt' };

/** "Buổi 4" (giáo trình chính / Khám phá) hoặc tên buổi (Làm quen từng nốt — mỗi buổi một nốt). */
export function lessonShortLabel(cl: CourseLesson): string {
  return cl.course === 'supplement' ? text(cl.lesson.title) : `Buổi ${cl.lesson.number}`;
}

// ─── Chữ ────────────────────────────────────────────────────────────────────────────────────────

export const DAY_MS = 86_400_000;

/** Số ngày lịch giữa hai mốc (theo múi giờ của máy). */
export function daysBetween(from: number, to: number, tzOffsetMin: number): number {
  return dayIndex(to, tzOffsetMin) - dayIndex(from, tzOffsetMin);
}

/** "hôm nay" / "hôm qua" / "3 ngày trước". */
export function relDay(at: number, now: number, tzOffsetMin: number): string {
  const d = daysBetween(at, now, tzOffsetMin);
  return d <= 0 ? 'hôm nay' : d === 1 ? 'hôm qua' : `${d} ngày trước`;
}

export const pct = (x: number) => `${Math.round(x * 100)}%`;

/** "1,5" — giây một chữ số thập phân, dấu phẩy kiểu Việt. */
export const seconds = (ms: number) => (ms / 1000).toFixed(1).replace('.', ',');

/** Điểm cộng làm tròn, kẹp trong [0, max]. */
export const bonus = (x: number, max: number) => Math.max(0, Math.min(max, Math.round(x)));

/** So sánh chuỗi không phụ thuộc ngôn ngữ máy (tie-breaker ổn định). */
export const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
