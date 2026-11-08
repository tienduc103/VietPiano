import { describe, expect, it } from 'vitest';
import { cursorAt, ScoreFollower } from './follower';
import { referenceFromLesson } from './reference/fromLesson';
import { abSchedule, performanceSchedule, referenceSchedule, replayRange, soundingAt } from './replay';
import { scorePerformance } from './scoring/ScoringEngine';
import { testLesson } from './testing/lessons';
import { synthPerformance } from './testing/synth';

const lesson = testLesson('C4 D4 E4 F4 | G4 A4 B4 C5', { acc: 'C3+E3/w | G3+B3/w' });
const ref = referenceFromLesson(lesson);

describe('ScoreFollower', () => {
  it('con trỏ theo phím đúng, hợp âm cần đủ phím; phím lạ không làm nhảy; nhảy qua nốt bị bỏ', () => {
    const f = new ScoreFollower(ref);
    expect(f.cursor()).toEqual({ staff: 'melody', index: 0 });
    f.handle(48); // C3 của hợp âm (nhóm 0 = C3 E3 C4)
    expect(f.group).toBe(0);
    f.handle(52);
    f.handle(60);
    expect(f.group).toBe(1);
    f.handle(99); // phím lạ
    expect(f.group).toBe(1);
    f.handle(64); // bỏ D4, đánh E4 → nhảy tới nhóm 2 rồi sang 3
    expect(f.cursor().index).toBe(3);
    expect(f.measure).toBe(1);
    for (const m of [65, 67, 71, 59, 69, 71, 72]) f.handle(m);
    expect(f.finished).toBe(true);
  });

  it('chơi lại từ đầu ô: con trỏ quay về (không nhảy nhầm lên trước vì nốt chơi lại trùng nốt phía sau)', () => {
    const r = referenceFromLesson(testLesson('C4 D4 E4 F4 | G4 A4 B4 C5 | C5 B4 A4 G4 | F4 E4 D4 C4'));
    const f = new ScoreFollower(r);
    for (const m of [60, 62, 64, 65, 67, 69, 71, 74]) f.handle(m); // … B4 rồi đánh nhầm D5 ở chỗ C5
    expect(f.group).toBe(7);
    f.handle(67); // G4: chưa đủ để biết
    f.handle(69); // A4: G4 A4 = đầu ô 2 → về B4 (không nhảy tới A4 của ô 3)
    expect(f.group).toBe(6);
    expect(f.measure).toBe(2);
    for (const m of [71, 72, 72, 71, 69, 67, 65, 64, 62, 60]) f.handle(m);
    expect(f.finished).toBe(true);
    // Chơi đúng một mạch (có câu lặp) không bao giờ quay lui.
    const g = new ScoreFollower(r);
    const seen: number[] = [];
    for (const n of r.notes) seen.push(g.handle(n.midi));
    expect(seen).toEqual([...seen].sort((a, b) => a - b));
    expect(g.finished).toBe(true);
  });

  it('cursorAt chọn nốt giai điệu đang vang; bài chỉ tay trái → khuông Fa', () => {
    expect(cursorAt(ref, 2.5)).toEqual({ staff: 'melody', index: 2 });
    const left = referenceFromLesson(lesson, { hand: 'left' });
    expect(cursorAt(left, 4)).toEqual({ staff: 'accompaniment', index: 1 });
  });
});

describe('replay', () => {
  const perf = synthPerformance(ref, { pedal: [{ downBeat: 0.2, upBeat: 3.9 }] });
  const result = scorePerformance({ reference: ref, performance: perf, session: { id: 's', profileKey: 'p', lessonId: 'x' }, capabilities: { noteOff: true, velocity: true, relativeLevel: false, pedal: true, polyphonic: true } });

  it('bản người học: đủ nốt, ngân theo pedal, lực gõ đã ghi; chậm ×0.5 dài gấp đôi', () => {
    const s = performanceSchedule(perf, null);
    expect(s).toHaveLength(perf.notes.length);
    const c4 = s.find((n) => n.midi === 60)!;
    expect(c4.duration).toBeGreaterThan(3); // ngân tới lúc nhả pedal (gần hết ô)
    expect(c4.velocity).toBe(72);
    expect(performanceSchedule(perf, null, 0.5).find((n) => n.midi === 60)!.duration).toBeCloseTo(c4.duration * 2, 5);
  });

  it('chỉ một đoạn ô: bản chuẩn + bản người học cùng đoạn; A/B nối tiếp', () => {
    const range = replayRange(ref, result, [2, 2]);
    expect(range.fromBeat).toBe(4);
    expect(range.toBeat).toBe(8);
    const mine = performanceSchedule(perf, range);
    expect(mine.map((n) => n.midi).sort((a, b) => a - b)).toEqual([55, 59, 67, 69, 71, 72]);
    const std = referenceSchedule(lesson, range, 60);
    expect(std[0].start).toBe(0);
    const ab = abSchedule(std, mine);
    expect(ab.bStart).toBeGreaterThan(4);
    expect(soundingAt(ab.notes, 0.1).has(67)).toBe(true);
  });
});
