import { nextInCourse } from './courses';
import { LESSONS } from './library';
import type { Lesson, LessonCategory } from './types';

export const CATEGORY_LABELS: Record<LessonCategory, string> = {
  notes: 'Nhận biết nốt',
  scale: 'Gam',
  'right-hand': 'Bài tập tay phải',
  'left-hand': 'Bài tập tay trái',
  'both-hands': 'Bài tập hai tay',
  kids: 'Bé tự học theo số ngón tay',
  song: 'Bài hát',
};

export const CATEGORY_ORDER: LessonCategory[] = ['notes', 'scale', 'right-hand', 'left-hand', 'both-hands', 'kids', 'song'];

export class LessonManager {
  constructor(private readonly lessons: Lesson[] = LESSONS) {}

  all(): Lesson[] {
    return this.lessons;
  }

  get(id: string): Lesson | undefined {
    return this.lessons.find((l) => l.id === id);
  }

  byCategory(): { category: LessonCategory; label: string; lessons: Lesson[] }[] {
    return CATEGORY_ORDER.map((category) => ({
      category,
      label: CATEGORY_LABELS[category],
      lessons: this.lessons.filter((l) => l.category === category),
    })).filter((g) => g.lessons.length > 0);
  }

  /** Bài kế tiếp (để gợi ý sau khi hoàn thành): theo khoá học nếu bài thuộc một khoá, không thì theo thư viện. */
  next(id: string): Lesson | undefined {
    const inCourse = nextInCourse(id);
    if (inCourse) return this.get(inCourse);
    const idx = this.lessons.findIndex((l) => l.id === id);
    return idx >= 0 ? this.lessons[idx + 1] : undefined;
  }
}

export const lessonManager = new LessonManager();
