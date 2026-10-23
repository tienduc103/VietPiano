import { describe, expect, it } from 'vitest';
import { CHECK_LESSON, CalibrationCheck, lessonToCheckNotes, summarizeCheck, type CheckNote } from './CalibrationCheck';
import { measureLength } from '../lessons/types';
import { splitMeasures } from '../lessons/notation';

// 60 bpm → 1 nốt đen = 1000 ms; đếm vào 2 phách → nốt đầu ở t = 2000.
const notes: CheckNote[] = [
  { midi: 60, beats: 1 },
  { midi: 64, beats: 1 },
  { midi: 64, beats: 1 },
  { midi: 67, beats: 1 },
];

function make(octaveTolerant = false) {
  const c = new CalibrationCheck(notes, { bpm: 60, countInBeats: 2, octaveTolerant });
  c.start(0);
  return c;
}

describe('CalibrationCheck', () => {
  it('đếm vào → chạy theo nhịp → dừng chờ ở nốt chưa đánh', () => {
    const c = make();
    expect(c.getState().status).toBe('countIn');
    expect(c.position(1000)).toBeCloseTo(-1);
    c.tick(2000);
    expect(c.getState().status).toBe('running');
    // Chưa đánh nốt đầu: đồng hồ đứng ở 0 dù thời gian trôi.
    expect(c.position(5000)).toBe(0);
    expect(c.isWaiting(5000)).toBe(true);
  });

  it('đánh đúng thì chạy tiếp từ lúc đánh; đánh trễ không làm nhảy qua nốt sau', () => {
    const c = make();
    expect(c.handleNote(60, 4000)).toBe('accepted');
    expect(c.position(4500)).toBeCloseTo(0.5);
    expect(c.isWaiting(4500)).toBe(false);
    expect(c.position(9000)).toBe(1);
    expect(c.getState().index).toBe(1);
  });

  it('nghe sai nốt → ghi lại nốt nghe được, vẫn chờ', () => {
    const c = make();
    expect(c.handleNote(62, 2100)).toBe('wrong');
    expect(c.getState().index).toBe(0);
    expect(c.getState().results[0].wrong).toEqual([62]);
    expect(c.handleNote(60, 2300)).toBe('accepted');
  });

  it('âm ngân bị nghe lại ngay sau khi nhận → tính là thừa, không nhảy sang nốt trùng cao độ kế tiếp', () => {
    const c = make();
    c.handleNote(60, 2000);
    expect(c.handleNote(64, 3000)).toBe('accepted'); // E4 thứ nhất, đúng nhịp (vị trí 1)
    // 300 ms sau: vị trí 1.3, nốt E4 thứ hai ở 2 → sớm hơn cửa sổ 0.5 phách → thừa.
    expect(c.handleNote(64, 3300)).toBe('extra');
    expect(c.getState().index).toBe(2);
    expect(c.getState().results[1].extra).toBe(1);
    // Đánh lại thật, gần nhịp của nốt thứ hai → nhận.
    expect(c.handleNote(64, 3800)).toBe('accepted');
    expect(c.getState().index).toBe(3);
  });

  it('nốt khác cao độ đánh sớm vẫn được nhận (đang kiểm tra nghe, không chấm nhịp)', () => {
    const c = make();
    c.handleNote(60, 2000);
    c.handleNote(64, 3000);
    c.handleNote(64, 4000);
    expect(c.handleNote(67, 4100)).toBe('accepted');
  });

  it('nốt cũ nghe lại khi đang chờ nốt mới → thừa (không tính là sai)', () => {
    const c = make();
    c.handleNote(60, 2000);
    expect(c.handleNote(60, 2600)).toBe('extra');
    expect(c.getState().results[0].extra).toBe(1);
    expect(c.getState().results[1].wrong).toEqual([]);
  });

  it('chấp nhận sai quãng tám khi bật', () => {
    expect(make(true).handleNote(72, 2000)).toBe('accepted');
    expect(make(false).handleNote(72, 2000)).toBe('wrong');
  });

  it('kết thúc sau trường độ nốt cuối; âm ngân nốt cuối vẫn bị bắt', () => {
    const c = make();
    [2000, 3000, 4000, 5000].forEach((t, i) => c.handleNote(notes[i].midi, t));
    expect(c.handleNote(67, 5300)).toBe('extra');
    c.tick(5900);
    expect(c.getState().status).toBe('running');
    c.tick(6000);
    expect(c.getState().status).toBe('finished');
    expect(c.handleNote(67, 6100)).toBe('ignored');
  });

  it('bắt đầu lại thì xoá kết quả', () => {
    const c = make();
    c.handleNote(62, 2000);
    c.start(10_000);
    expect(c.getState()).toMatchObject({ status: 'countIn', index: 0, wrongCount: 0 });
    expect(c.getState().results[0].wrong).toEqual([]);
  });
});

describe('summarizeCheck', () => {
  it('phân loại sai quãng 8, sai nốt, thừa', () => {
    const s = summarizeCheck(notes, [
      { accepted: true, wrong: [], extra: 0 },
      { accepted: true, wrong: [76], extra: 1 },
      { accepted: true, wrong: [65], extra: 0 },
      { accepted: false, wrong: [], extra: 0 },
    ]);
    expect(s).toEqual({ total: 4, clean: 1, wrongEvents: 1, octaveEvents: 1, extraEvents: 1, advice: ['extra-notes', 'octave-errors', 'wrong-notes'] });
  });

  it('nghe đúng hết → không có lời khuyên', () => {
    const s = summarizeCheck(notes, notes.map(() => ({ accepted: true, wrong: [], extra: 0 })));
    expect(s.clean).toBe(4);
    expect(s.advice).toEqual([]);
  });
});

describe('CHECK_LESSON', () => {
  it('đủ phách mỗi ô nhịp, có nốt lặp liền nhau và nằm trong tầm micro', () => {
    const measures = splitMeasures(CHECK_LESSON.notes, measureLength(CHECK_LESSON.timeSignature));
    expect(measures.every((m) => m.beats === 4)).toBe(true);
    const midis = lessonToCheckNotes(CHECK_LESSON).map((n) => n.midi);
    expect(midis.some((m, i) => m === midis[i + 1])).toBe(true);
    expect(Math.min(...midis)).toBeGreaterThanOrEqual(36);
    expect(Math.max(...midis)).toBeLessThanOrEqual(84);
  });
});
