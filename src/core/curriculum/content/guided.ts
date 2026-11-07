/**
 * Giáo trình "dẫn dắt" chạy bằng LessonPlayer ngoài giáo trình chính (cấp 1–6): "Làm quen từng nốt" (`sup-`) và
 * "Khám phá nốt nhạc" (`nd-`). Chung luồng một buổi: Tổng quan → Giới thiệu → Bài tập → Kết quả → bé tự chọn trò
 * (không có Luyện tập sau buổi, trò không tính điểm). Tiến độ chung kho `curriculumStore`, không ảnh hưởng gợi ý mở khoá cấp 1–6.
 */
import type { Curriculum, CurriculumLesson } from '../types';
import { findLesson } from '../unlock';
import { DISCOVERY, DISCOVERY_GAMES, isDiscoveryLesson } from './discovery';
import { isSupplementLesson, SUPPLEMENT, SUPPLEMENT_GAMES, type SupplementGame } from './supplement';

export interface GuidedCourse {
  id: 'supplement' | 'discovery';
  curriculum: Curriculum;
  /** Route màn danh sách buổi của giáo trình. */
  home: 'supplement' | 'note-discovery';
  homeLabel: string;
  /** Dòng nhỏ trên tiêu đề buổi học. */
  kicker: (lesson: CurriculumLesson) => string;
  /** Nút sang buổi kế tiếp ở màn chọn trò. */
  nextLabel: string;
  games: Record<string, SupplementGame[]>;
  owns: (lessonId: string) => boolean;
}

export const GUIDED_COURSES: readonly GuidedCourse[] = [
  {
    id: 'supplement',
    curriculum: SUPPLEMENT,
    home: 'supplement',
    homeLabel: 'Về giáo trình bổ sung',
    kicker: () => 'Giáo trình bổ sung',
    nextLabel: 'Nốt tiếp theo →',
    games: SUPPLEMENT_GAMES,
    owns: isSupplementLesson,
  },
  {
    id: 'discovery',
    curriculum: DISCOVERY,
    home: 'note-discovery',
    homeLabel: 'Về Khám phá nốt nhạc',
    kicker: (l) => `Khám phá nốt nhạc · Buổi ${l.number}`,
    nextLabel: 'Buổi tiếp theo →',
    games: DISCOVERY_GAMES,
    owns: isDiscoveryLesson,
  },
];

export function guidedCourseOf(lessonId: string): GuidedCourse | undefined {
  return GUIDED_COURSES.find((c) => c.owns(lessonId));
}

/** Buổi học của một giáo trình dẫn dắt (theo tiền tố id). */
export function findGuidedLesson(lessonId: string): CurriculumLesson | undefined {
  const course = guidedCourseOf(lessonId);
  return course && findLesson(course.curriculum, lessonId);
}
