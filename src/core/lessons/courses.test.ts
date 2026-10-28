import { describe, expect, it } from 'vitest';
import { COURSES, courseProgress, isStepPassed, nextInCourse, type Course } from './courses';
import { lessonManager } from './LessonManager';
import { emptyProgress, type LessonProgress } from '../storage/ProgressStorage';

function done(lessonId: string, bestAccuracy: number, completions = 1): LessonProgress {
  return { ...emptyProgress(lessonId), completions, bestAccuracy };
}

const course: Course = {
  id: 'c',
  title: 'C',
  description: '',
  steps: [
    { lessonId: 'a', tip: '' },
    { lessonId: 'b', tip: '' },
    { lessonId: 'c', tip: '' },
  ],
};

describe('khoá học', () => {
  it.each(COURSES.map((c) => [c.id, c] as const))('%s: mọi bước trỏ tới bài có thật, không lặp bài', (_id, c) => {
    expect(c.steps.length).toBeGreaterThan(0);
    for (const s of c.steps) {
      expect(lessonManager.get(s.lessonId), s.lessonId).toBeDefined();
      expect(s.tip.length).toBeGreaterThan(0);
    }
    expect(new Set(c.steps.map((s) => s.lessonId)).size).toBe(c.steps.length);
  });

  it('khoá nốt cơ bản bắt đầu từ Đô giữa và dễ dần', () => {
    const basic = COURSES.find((c) => c.id === 'course-basic-notes')!;
    const lessons = basic.steps.map((s) => lessonManager.get(s.lessonId)!);
    expect(new Set(lessons[0].notes.map((n) => n.pitch))).toEqual(new Set(['C4']));
    // Ba bài đầu mỗi bài thêm đúng một nốt mới.
    const pitchCount = (i: number) => new Set(lessons[i].notes.map((n) => n.midi)).size;
    expect([pitchCount(0), pitchCount(1), pitchCount(2)]).toEqual([1, 2, 3]);
    lessons.forEach((l) => expect(l.difficulty).toBe(1));
    // Có cả khoá Sol và khoá Fa.
    expect(lessons.some((l) => l.clef === 'treble')).toBe(true);
    expect(lessons.some((l) => l.clef === 'bass')).toBe(true);
  });

  it('chỉ tính là qua khi đã hoàn thành với độ chính xác đạt chuẩn', () => {
    expect(isStepPassed(undefined)).toBe(false);
    expect(isStepPassed(done('a', 0.95, 0))).toBe(false);
    expect(isStepPassed(done('a', 0.5))).toBe(false);
    expect(isStepPassed(done('a', 0.8))).toBe(true);
  });

  it('tiến độ khoá: số bước đã qua và bước học tiếp', () => {
    expect(courseProgress(course, {})).toEqual({ passed: [false, false, false], passedCount: 0, nextIndex: 0 });
    // Bước sau đã qua nhưng bước trước chưa → vẫn gợi ý bước trước.
    expect(courseProgress(course, { a: done('a', 0.9), c: done('c', 1) })).toEqual({
      passed: [true, false, true],
      passedCount: 2,
      nextIndex: 1,
    });
    const all = { a: done('a', 1), b: done('b', 1), c: done('c', 1) };
    expect(courseProgress(course, all).nextIndex).toBeNull();
  });

  it('bài kế tiếp đi theo thứ tự khoá học', () => {
    expect(nextInCourse('a', [course])).toBe('b');
    expect(nextInCourse('c', [course])).toBeUndefined();
    expect(nextInCourse('x', [course])).toBeUndefined();
    expect(lessonManager.next('notes-bass-mixed')?.id).toBe('song-twinkle');
    expect(lessonManager.next('notes-spaces')?.id).toBe('notes-mixed');
  });
});
