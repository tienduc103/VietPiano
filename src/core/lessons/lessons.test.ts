import { describe, expect, it } from 'vitest';
import { LESSONS } from './library';
import { parseAccompaniment, parseNotes, splitMeasures } from './notation';
import { lessonManager } from './LessonManager';
import { fingerText, isAccompanimentMidi, measureLength, sectionAt, type Hand, type Lesson } from './types';

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
    expect(parseNotes('Bb4:(3)')[0]).toMatchObject({ finger: 3, fingerCircled: true });
    expect(() => parseNotes('C4:(6)')).toThrow();
    expect(() => parseNotes('C4:(3')).toThrow();
    expect(fingerText(3)).toBe('3');
    expect(fingerText(3, true)).toBe('③');
  });

  it('báo lỗi với nốt hoặc trường độ sai', () => {
    expect(() => parseNotes('X4')).toThrow();
    expect(() => parseNotes('C4/z')).toThrow();
  });

  it('chia ô nhịp và phát hiện nốt vắt vạch nhịp', () => {
    expect(splitMeasures(parseNotes('C4 C4 C4 C4 D4/w'), 4).map((m) => m.items.length)).toEqual([4, 1]);
    expect(() => splitMeasures(parseNotes('C4 C4 C4 D4/h'), 4)).toThrow();
  });

  it('phân tích phần đệm: hợp âm, trường độ, số ngón tay', () => {
    expect(parseAccompaniment('A3+D3+F3/hd:1+5+3 | G2:5 C#3')).toEqual([
      { pitches: ['D3', 'F3', 'A3'], midis: [50, 53, 57], duration: 'hd', fingers: [5, 3, 1], fingersCircled: [false, false, false] },
      { pitches: ['G2'], midis: [43], duration: 'q', fingers: [5], fingersCircled: [false] },
      { pitches: ['C#3'], midis: [49], duration: 'q', fingers: [undefined], fingersCircled: [false] },
    ]);
    expect(parseAccompaniment('G2+Bb2/h:5+(3)')[0].fingersCircled).toEqual([false, true]);
    expect(parseAccompaniment('D3+F3/h:+3')[0].fingers).toEqual([undefined, 3]);
    expect(() => parseAccompaniment('D3+F3:1+2+3')).toThrow();
    expect(() => parseAccompaniment('D3:7')).toThrow();
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

  /** Thế tay cố định: mỗi ngón ứng với đúng một phím; tay phải ngón số lớn ở phím cao hơn, tay trái ngược lại. */
  function expectFixedPosition(notes: Lesson['notes'], hand: Hand) {
    const keyOf = new Map<number, number>();
    for (const n of notes) {
      expect(n.finger).toBeDefined();
      const f = n.finger!;
      expect(keyOf.get(f) ?? n.midi).toBe(n.midi);
      keyOf.set(f, n.midi);
    }
    const sorted = [...keyOf.entries()].sort(([a], [b]) => a - b).map(([, midi]) => midi);
    expect(sorted).toEqual([...sorted].sort((a, b) => (hand === 'right' ? a - b : b - a)));
  }

  const bothHands = LESSONS.filter((l) => l.category === 'both-hands');

  it('ký hiệu RH / LH đặt tay cho các nốt phía sau', () => {
    expect(parseNotes('LH C3:5 RH C4:1 E4').map((n) => n.hand)).toEqual(['left', 'right', 'right']);
    expect(parseNotes('C4').map((n) => n.hand)).toEqual([undefined]);
  });

  it.each(bothHands.map((l) => [l.id, l] as const))('%s: khuông đôi, nốt nào cũng ghi tay, mỗi tay một thế cố định', (_id, lesson) => {
    expect(lesson.clef).toBe('grand');
    expect(lesson.hand).toBe('both');
    const right = lesson.notes.filter((n) => n.hand === 'right');
    const left = lesson.notes.filter((n) => n.hand === 'left');
    expect(right.length + left.length).toBe(lesson.notes.length);
    expect(right.length).toBeGreaterThan(0);
    expect(left.length).toBeGreaterThan(0);
    // Tay phải ở khoá Sol (từ Đô giữa trở lên), tay trái ở khoá Fa (dưới Đô giữa).
    right.forEach((n) => expect(n.midi).toBeGreaterThanOrEqual(60));
    left.forEach((n) => expect(n.midi).toBeLessThan(60));
    expectFixedPosition(right, 'right');
    expectFixedPosition(left, 'left');
  });

  const withAccompaniment = LESSONS.filter((l) => l.accompaniment);

  it.each(withAccompaniment.map((l) => [l.id, l] as const))('%s: phần đệm khớp ô nhịp với giai điệu, nằm dưới giai điệu', (_id, lesson) => {
    expect(lesson.clef).toBe('grand');
    const full = measureLength(lesson.timeSignature);
    const melody = splitMeasures(lesson.notes, full, lesson.pickup);
    const acc = splitMeasures(lesson.accompaniment!, full, lesson.pickup);
    expect(acc.length).toBe(melody.length);
    acc.forEach((m, i) => expect(m.beats).toBeCloseTo(i === 0 && lesson.pickup ? lesson.pickup : full, 9));
    const accMidis = lesson.accompaniment!.flatMap((n) => n.midis);
    accMidis.forEach((m) => expect(m).toBeGreaterThanOrEqual(36));
    // Giai điệu là tay phải; mọi nốt đệm thấp hơn giai điệu để lọc được nốt tay trái khi chấm.
    lesson.notes.forEach((n) => expect(n.hand ?? 'right').toBe('right'));
    expect(Math.max(...accMidis)).toBeLessThan(Math.min(...lesson.notes.map((n) => n.midi)));
    accMidis.forEach((m) => expect(isAccompanimentMidi(lesson, m)).toBe(true));
    lesson.notes.forEach((n) => expect(isAccompanimentMidi(lesson, n.midi)).toBe(false));
  });

  it('chữ đánh dấu đoạn theo số ô nhịp in trên bản nhạc (ô lấy đà không đánh số)', () => {
    const sections = [{ measure: 1, label: 'A' }, { measure: 17, label: 'B' }];
    expect(sectionAt({ sections }, 0)).toBe('A');
    expect(sectionAt({ sections }, 16)).toBe('B');
    expect(sectionAt({ sections }, 1)).toBeUndefined();
    expect(sectionAt({ sections, pickup: 1 }, 1)).toBe('A');
    expect(sectionAt({}, 0)).toBeUndefined();
  });

  it.each(LESSONS.filter((l) => l.sections).map((l) => [l.id, l] as const))('%s: chữ đánh dấu đoạn nằm trong bài', (_id, lesson) => {
    const count = splitMeasures(lesson.notes, measureLength(lesson.timeSignature), lesson.pickup).length;
    for (const s of lesson.sections!) {
      expect(s.measure).toBeGreaterThanOrEqual(1);
      expect(s.measure).toBeLessThanOrEqual(lesson.pickup ? count - 1 : count);
    }
  });

  it('bài không có phần đệm không lọc nốt nào', () => {
    expect(isAccompanimentMidi(LESSONS[0], 36)).toBe(false);
  });

  const kids = LESSONS.filter((l) => l.category === 'kids');

  it('có bài cho bé ở cả tay phải và tay trái', () => {
    expect(kids.filter((l) => l.hand === 'right').length).toBeGreaterThanOrEqual(3);
    expect(kids.filter((l) => l.hand === 'left').length).toBeGreaterThanOrEqual(3);
  });

  it.each(kids.map((l) => [l.id, l] as const))('%s: mọi nốt có số ngón, thế tay cố định', (_id, lesson) => {
    // Bé không phải đổi thế tay trong cả bài.
    expectFixedPosition(lesson.notes, lesson.hand === 'left' ? 'left' : 'right');
  });

  it('LessonManager tìm bài và bài kế tiếp', () => {
    const first = LESSONS[0];
    expect(lessonManager.get(first.id)).toBe(first);
    expect(lessonManager.next(first.id)).toBe(LESSONS[1]);
    expect(lessonManager.next(LESSONS[LESSONS.length - 1].id)).toBeUndefined();
    expect(lessonManager.byCategory()[0].category).toBe('notes');
  });
});
