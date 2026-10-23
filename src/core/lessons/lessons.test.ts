import { describe, expect, it } from 'vitest';
import { LESSONS } from './library';
import { parseNotes, splitMeasures } from './notation';
import { lessonManager } from './LessonManager';
import { measureLength } from './types';

describe('ký hiệu bài học', () => {
  it('phân tích chuỗi nốt với trường độ mặc định', () => {
    expect(parseNotes('C4 D4/h | E4/8')).toEqual([
      { pitch: 'C4', midi: 60, duration: 'q' },
      { pitch: 'D4', midi: 62, duration: 'h' },
      { pitch: 'E4', midi: 64, duration: '8' },
    ]);
  });

  it('phân tích số ngón tay', () => {
    expect(parseNotes('C4:1 E4/h:3')).toEqual([
      { pitch: 'C4', midi: 60, duration: 'q', finger: 1 },
      { pitch: 'E4', midi: 64, duration: 'h', finger: 3 },
    ]);
    expect(() => parseNotes('C4:6')).toThrow();
    expect(() => parseNotes('C4/h:')).toThrow();
  });

  it('báo lỗi với nốt hoặc trường độ sai', () => {
    expect(() => parseNotes('X4')).toThrow();
    expect(() => parseNotes('C4/z')).toThrow();
  });

  it('chia ô nhịp và phát hiện nốt vắt vạch nhịp', () => {
    expect(splitMeasures(parseNotes('C4 C4 C4 C4 D4/w'), 4).map((m) => m.items.length)).toEqual([4, 1]);
    expect(() => splitMeasures(parseNotes('C4 C4 C4 D4/h'), 4)).toThrow();
  });

  it('hỗ trợ nhịp 3/8, móc kép và nhịp lấy đà', () => {
    expect(measureLength([3, 8])).toBe(1.5);
    const m = splitMeasures(parseNotes('E5/16 D#5/16 | E5/16 D#5/16 E5/16 B4/16 D5/16 C5/16 | A4/8d C4/16 E4/16 A4/16'), 1.5, 0.5);
    expect(m.map((x) => x.items.length)).toEqual([2, 6, 4]);
    expect(m.map((x) => x.beats)).toEqual([0.5, 1.5, 1.5]);
    expect(() => splitMeasures(parseNotes('E5/16 D5/8'), 1.5, 0.5)).toThrow();
  });
});

describe('thư viện bài học', () => {
  it('có đủ các nhóm bài bắt buộc', () => {
    const count = (c: string) => LESSONS.filter((l) => l.category === c).length;
    expect(count('notes')).toBeGreaterThanOrEqual(1);
    expect(count('scale')).toBeGreaterThanOrEqual(1);
    expect(count('right-hand')).toBeGreaterThanOrEqual(1);
    expect(count('left-hand')).toBeGreaterThanOrEqual(1);
    expect(count('song')).toBeGreaterThanOrEqual(5);
  });

  it('id bài học là duy nhất', () => {
    expect(new Set(LESSONS.map((l) => l.id)).size).toBe(LESSONS.length);
  });

  it.each(LESSONS.map((l) => [l.id, l] as const))('%s: mọi ô nhịp đầy đủ phách', (_id, lesson) => {
    const full = measureLength(lesson.timeSignature);
    const measures = splitMeasures(lesson.notes, full, lesson.pickup);
    measures.forEach((m, i) => expect(m.beats).toBeCloseTo(i === 0 && lesson.pickup ? lesson.pickup : full, 9));
  });

  it.each(LESSONS.map((l) => [l.id, l] as const))('%s: nốt nằm trong tầm nhận diện micro', (_id, lesson) => {
    for (const n of lesson.notes) {
      expect(n.midi).toBeGreaterThanOrEqual(36);
      expect(n.midi).toBeLessThanOrEqual(84);
    }
  });

  const kids = LESSONS.filter((l) => l.category === 'kids');

  it('có bài cho bé ở cả tay phải và tay trái', () => {
    expect(kids.filter((l) => l.hand === 'right').length).toBeGreaterThanOrEqual(3);
    expect(kids.filter((l) => l.hand === 'left').length).toBeGreaterThanOrEqual(3);
  });

  it.each(kids.map((l) => [l.id, l] as const))('%s: mọi nốt có số ngón, thế tay cố định', (_id, lesson) => {
    // Mỗi ngón ứng với đúng một phím trong cả bài (bé không phải đổi thế tay).
    const keyOf = new Map<number, number>();
    for (const n of lesson.notes) {
      expect(n.finger).toBeDefined();
      const f = n.finger!;
      expect(keyOf.get(f) ?? n.midi).toBe(n.midi);
      keyOf.set(f, n.midi);
    }
    // Tay phải: ngón số lớn hơn ở phím cao hơn; tay trái ngược lại (ngón 5 ở phím thấp nhất).
    const sorted = [...keyOf.entries()].sort(([a], [b]) => a - b).map(([, midi]) => midi);
    const expected = [...sorted].sort((a, b) => (lesson.hand === 'right' ? a - b : b - a));
    expect(sorted).toEqual(expected);
  });

  it('LessonManager tìm bài và bài kế tiếp', () => {
    const first = LESSONS[0];
    expect(lessonManager.get(first.id)).toBe(first);
    expect(lessonManager.next(first.id)).toBe(LESSONS[1]);
    expect(lessonManager.next(LESSONS[LESSONS.length - 1].id)).toBeUndefined();
    expect(lessonManager.byCategory()[0].category).toBe('notes');
  });
});
