/**
 * Bài có nhiều bản phối theo cấp độ (Cơ bản / Trung cấp / Nâng cao): metadata chung của bài hát, tìm bản cùng bài,
 * lộ trình luyện của từng bản, gợi ý cấp độ theo tiến độ đã lưu. Mỗi bản là một `Lesson` riêng → tiến độ, kỷ lục,
 * lịch sử lưu riêng từng cấp. Thêm bài mới: tạo module như `happyBirthday.ts`, khai báo trong `FAMILIES`.
 */
import type { LessonProgress } from '../../storage/ProgressStorage';
import { LESSONS } from '../library';
import { ARRANGEMENT_LEVEL_LABEL, type ArrangementLevel, type Lesson } from '../types';
import { HAPPY_BIRTHDAY_FAMILY, HAPPY_BIRTHDAY_PLANS, HAPPY_BIRTHDAY_SOURCE, type PracticePlanStep } from './happyBirthday';

export type { PracticePlanStep } from './happyBirthday';

export interface ArrangementFamily {
  id: string;
  title: string;
  /** Tên tiếng Việt. */
  subtitle: string;
  source: string;
}

const FAMILIES: ArrangementFamily[] = [
  { id: HAPPY_BIRTHDAY_FAMILY, title: 'Happy Birthday to You', subtitle: 'Chúc mừng sinh nhật', source: HAPPY_BIRTHDAY_SOURCE },
];

const PLANS: Record<string, PracticePlanStep[]> = { ...HAPPY_BIRTHDAY_PLANS };

/** Hoàn thành cả bài (hai tay) với độ chính xác từ mức này → coi như đã vững cấp đó, gợi ý lên cấp. */
export const LEVEL_UP_ACCURACY = 0.9;

export function arrangementFamily(id: string): ArrangementFamily | undefined {
  return FAMILIES.find((f) => f.id === id);
}

/** Các bản phối cùng bài, Cơ bản → Nâng cao. */
export function familyLessons(family: string, lessons: readonly Lesson[] = LESSONS): Lesson[] {
  return lessons.filter((l) => l.arrangement?.family === family).sort((a, b) => a.arrangement!.level - b.arrangement!.level);
}

/** Nhãn cấp độ của bản phối ("Cơ bản"…); bài thường → undefined. */
export function levelLabel(lesson: Pick<Lesson, 'arrangement'>): string | undefined {
  return lesson.arrangement ? ARRANGEMENT_LEVEL_LABEL[lesson.arrangement.level] : undefined;
}

/** Lộ trình luyện đi kèm bản phối (rỗng nếu bài không có). */
export function practicePlan(lessonId: string): PracticePlanStep[] {
  return PLANS[lessonId] ?? [];
}

/** Đã vững một cấp: hoàn thành cả bài hai tay với độ chính xác ≥ LEVEL_UP_ACCURACY. */
export function levelMastered(progress: LessonProgress | undefined): boolean {
  return !!progress && progress.completions > 0 && progress.bestAccuracy + 1e-9 >= LEVEL_UP_ACCURACY;
}

/**
 * Cấp độ nên tập: cấp thấp nhất chưa vững (mọi cấp đều vững → cấp cao nhất).
 * Chỉ là gợi ý — người học vẫn chọn được cấp bất kỳ.
 */
export function recommendedLevel(family: string, progress: Readonly<Record<string, LessonProgress | undefined>>, lessons: readonly Lesson[] = LESSONS): Lesson | undefined {
  const list = familyLessons(family, lessons);
  return list.find((l) => !levelMastered(progress[l.id])) ?? list[list.length - 1];
}

/** Bản phối cấp kế tiếp (để gợi ý lên cấp sau khi chơi tốt); đã ở cấp cao nhất → undefined. */
export function nextLevel(lesson: Pick<Lesson, 'arrangement'>, lessons: readonly Lesson[] = LESSONS): Lesson | undefined {
  if (!lesson.arrangement) return undefined;
  const level = lesson.arrangement.level;
  return familyLessons(lesson.arrangement.family, lessons).find((l) => l.arrangement!.level === ((level + 1) as ArrangementLevel));
}
