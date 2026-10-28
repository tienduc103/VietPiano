/**
 * Khoá học: chuỗi bài theo thứ tự, mỗi bước kèm mẹo ngắn. Bài trong khoá vẫn là bài thường của thư viện
 * (một bài có thể thuộc nhiều khoá); tiến độ khoá suy từ tiến độ từng bài, không lưu riêng.
 */
import { PASS_ACCURACY } from '../profile/assessment';
import type { LessonProgress } from '../storage/ProgressStorage';

export interface CourseStep {
  lessonId: string;
  /** Mẹo nhớ / điều cần chú ý ở bước này. */
  tip: string;
}

export interface Course {
  id: string;
  title: string;
  description: string;
  steps: CourseStep[];
}

export const COURSES: Course[] = [
  {
    id: 'course-basic-notes',
    title: 'Khoá học: Nốt nhạc cơ bản',
    description: 'Từ Đô giữa tới đọc được bảy nốt trên khoá Sol và khoá Fa — mỗi bài thêm vài nốt mới.',
    steps: [
      { lessonId: 'notes-middle-c', tip: 'Đô giữa nằm ngay bên trái nhóm 2 phím đen ở giữa đàn; trên khuông có một dòng kẻ phụ.' },
      { lessonId: 'notes-c-d', tip: 'Rê nằm giữa hai phím đen; trên khuông Rê ngồi ngay dưới dòng kẻ thứ nhất.' },
      { lessonId: 'notes-c-d-e', tip: 'Mi nằm bên phải nhóm 2 phím đen; trên khuông Mi nằm trên dòng kẻ thứ nhất.' },
      { lessonId: 'notes-f-g', tip: 'Fa nằm bên trái nhóm 3 phím đen. Nốt đi lên trên khuông = phím đi sang phải.' },
      { lessonId: 'notes-a-b-c', tip: 'Dời cả bàn tay: ngón cái đặt ở Sol. Đô5 nằm trong khe thứ ba của khuông.' },
      { lessonId: 'notes-seven', tip: 'Đô Rê Mi Fa Sol La Si — đọc tên nốt thành tiếng khi đánh.' },
      { lessonId: 'notes-lines', tip: 'Năm dòng kẻ từ dưới lên: Mi – Sol – Si – Rê – Fa.' },
      { lessonId: 'notes-spaces', tip: 'Bốn khe từ dưới lên: Fa – La – Đô – Mi.' },
      { lessonId: 'notes-mixed', tip: 'Nhìn nốt trước khi nhìn tay — app chờ đến khi bạn đánh đúng.' },
      { lessonId: 'notes-bass', tip: 'Khoá Fa: hai chấm ôm dòng kẻ thứ tư — đó là nốt Fa3. Đô3 ở khe thứ hai.' },
      { lessonId: 'notes-bass-mixed', tip: 'Nhớ mốc: Fa3 trên dòng thứ tư, Đô3 trong khe thứ hai, La3 ở dòng trên cùng.' },
      { lessonId: 'song-twinkle', tip: 'Bài tốt nghiệp: chơi trọn một bài hát chỉ với các nốt đã học.' },
    ],
  },
];

/** Bài được tính là đã qua trong khoá: hoàn thành ít nhất một lần với độ chính xác đạt chuẩn. */
export function isStepPassed(progress: LessonProgress | undefined): boolean {
  return !!progress && progress.completions > 0 && progress.bestAccuracy >= PASS_ACCURACY;
}

export interface CourseProgress {
  /** Đã qua từng bước (cùng thứ tự `steps`). */
  passed: boolean[];
  passedCount: number;
  /** Bước nên học tiếp: bước đầu tiên chưa qua; null khi đã xong cả khoá. */
  nextIndex: number | null;
}

export function courseProgress(course: Course, progress: Record<string, LessonProgress | undefined>): CourseProgress {
  const passed = course.steps.map((s) => isStepPassed(progress[s.lessonId]));
  const idx = passed.indexOf(false);
  return { passed, passedCount: passed.filter(Boolean).length, nextIndex: idx < 0 ? null : idx };
}

/** Bài kế tiếp trong khoá đầu tiên có chứa `lessonId` (undefined nếu bài không thuộc khoá nào hoặc là bước cuối). */
export function nextInCourse(lessonId: string, courses: Course[] = COURSES): string | undefined {
  for (const c of courses) {
    const i = c.steps.findIndex((s) => s.lessonId === lessonId);
    if (i >= 0) return c.steps[i + 1]?.lessonId;
  }
  return undefined;
}
