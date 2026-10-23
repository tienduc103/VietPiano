import { describe, expect, it } from 'vitest';
import { LESSONS } from '../lessons/library';
import type { NoteTally } from '../practice/NoteStats';
import type { PracticeSession } from '../storage/ProgressStorage';
import { assessLearner, dayIndex, skillLevel } from './assessment';
import { newProfile } from './LearnerProfile';

const DAY = 86_400_000;
/** 23/10/2026 12:00 UTC; test dùng múi giờ UTC (tzOffset = 0) để không phụ thuộc máy. */
const NOW = Date.UTC(2026, 9, 23, 12);

const s = (over: Partial<PracticeSession> = {}): PracticeSession => ({
  lessonId: 'scale-c-major',
  startedAt: NOW - DAY,
  durationMs: 5 * 60_000,
  correct: 16,
  wrong: 0,
  skipped: 0,
  completed: true,
  notesReached: 16,
  totalNotes: 16,
  ...over,
});

const assess = (sessions: PracticeSession[], profile = newProfile({ name: 'A', age: 30 }, 0)) => assessLearner(profile, sessions, LESSONS, NOW, 0);

describe('assessLearner', () => {
  it('chưa có dữ liệu: điểm theo trình độ khai báo, tiêu chí null', () => {
    const a = assess([], newProfile({ name: 'A', age: 30, experience: 'basic' }, 0));
    expect(a.skill).toMatchObject({ score: 35, level: 'Cơ bản', targetDifficulty: 2, accuracy: null });
    expect(a.time).toMatchObject({ totalMs: 0, sessions: 0, streakDays: 0 });
    expect(a.criteria.every((c) => c.score === null)).toBe(true);
  });

  it('đếm ngày tập, chuỗi ngày liên tiếp và thời gian 7 ngày', () => {
    const a = assess([
      s({ startedAt: NOW - 3 * 60_000 }), // hôm nay
      s({ startedAt: NOW - DAY }),
      s({ startedAt: NOW - 2 * DAY }),
      s({ startedAt: NOW - 4 * DAY }), // đứt chuỗi ở ngày -3
      s({ startedAt: NOW - 10 * DAY }), // ngoài 7 ngày
    ]);
    expect(a.time).toMatchObject({ sessions: 5, activeDays: 5, streakDays: 3, totalMs: 25 * 60_000, last7DaysMs: 20 * 60_000 });
  });

  it('chuỗi ngày vẫn tính khi hôm nay chưa tập nhưng hôm qua có', () => {
    expect(assess([s({ startedAt: NOW - DAY }), s({ startedAt: NOW - 2 * DAY })]).time.streakDays).toBe(2);
    expect(assess([s({ startedAt: NOW - 2 * DAY })]).time.streakDays).toBe(0);
  });

  it('dayIndex theo lịch địa phương', () => {
    // 23:30 UTC = 06:30 hôm sau ở Việt Nam (UTC+7, offset -420).
    const t = Date.UTC(2026, 9, 23, 23, 30);
    expect(dayIndex(t, -420) - dayIndex(t, 0)).toBe(1);
  });

  it('hoàn thành bài khó với độ chính xác cao làm tăng điểm khả năng', () => {
    const before = assess([]).skill.score;
    const passed = ['song-fur-elise', 'song-minuet-g', 'scale-c-major', 'rh-skips'].map((lessonId) => s({ lessonId, correct: 50, wrong: 2 }));
    const after = assess(passed).skill;
    expect(after.score).toBeGreaterThan(before);
    expect(after.lessonsPassed).toBe(4);
    expect(after.hardestPassed).toBe(3);
  });

  it('độ chính xác thấp kéo điểm xuống, bài không đạt không được tính', () => {
    const good = assess([s({ correct: 45, wrong: 5 })]).skill;
    const bad = assess([s({ correct: 25, wrong: 25 })]).skill;
    expect(bad.lessonsPassed).toBe(0);
    expect(bad.score).toBeLessThan(good.score);
    expect(assess([s({ correct: 25, wrong: 25 })]).criteria.find((c) => c.key === 'accuracy')?.tip).toBeTruthy();
  });

  it('phát hiện tiến bộ khi 10 phiên gần nhất chính xác hơn 10 phiên trước', () => {
    const early = Array.from({ length: 10 }, (_, i) => s({ startedAt: NOW - (30 - i) * DAY, correct: 6, wrong: 4 }));
    const late = Array.from({ length: 10 }, (_, i) => s({ startedAt: NOW - (10 - i) * DAY, correct: 9, wrong: 1 }));
    const imp = assess([...early, ...late]).criteria.find((c) => c.key === 'improvement')!;
    expect(imp.score).toBe(100);
    expect(imp.detail).toContain('+30');
  });

  it('nhận ra tay trái tập quá ít', () => {
    const a = assess([s({ lessonId: 'rh-five-finger', correct: 100 }), s({ lessonId: 'lh-five-finger', correct: 10 })]);
    expect(a.skill.weakerHand).toBe('left');
    expect(a.criteria.find((c) => c.key === 'hands')?.tip).toContain('tay trái');
  });

  it('độ dài buổi tập: quá ngắn bị điểm thấp', () => {
    const kid = newProfile({ name: 'Bé', age: 5 }, 0); // nên ~10 phút
    const short = assessLearner(kid, [s({ durationMs: 60_000 })], LESSONS, NOW, 0).criteria.find((c) => c.key === 'sessionLength')!;
    const ok = assessLearner(kid, [s({ durationMs: 12 * 60_000 })], LESSONS, NOW, 0).criteria.find((c) => c.key === 'sessionLength')!;
    expect(short.score).toBe(10);
    expect(ok.score).toBe(100);
  });

  it('tốc độ đọc nốt: trung bình 10 phiên gần nhất, so với mục tiêu theo tuổi và với trước đó', () => {
    const early = Array.from({ length: 10 }, (_, i) => s({ startedAt: NOW - (30 - i) * DAY, reading: { totalMs: 2000 * 5, count: 5 } }));
    const late = Array.from({ length: 10 }, (_, i) => s({ startedAt: NOW - (10 - i) * DAY, reading: { totalMs: 1000 * 5, count: 5 } }));
    const a = assess([...early, ...late]); // người lớn: mục tiêu 1 giây
    expect(a.notes.readingMs).toBe(1000);
    const c = a.criteria.find((x) => x.key === 'readingSpeed')!;
    expect(c.score).toBe(100);
    expect(c.detail).toContain('1,0 giây/nốt');
    expect(c.detail).toContain('nhanh hơn 1,0 giây');
    // Trẻ 5 tuổi đọc 3 giây/nốt: mục tiêu 2 giây → điểm (8 − 3) / 6.
    const kid = assessLearner(newProfile({ name: 'Bé', age: 5 }, 0), late.map((x) => ({ ...x, reading: { totalMs: 15000, count: 5 } })), LESSONS, NOW, 0);
    expect(kid.criteria.find((x) => x.key === 'readingSpeed')?.score).toBe(83);
  });

  it('tốc độ đọc nốt: phiên cũ không có dữ liệu → chưa đánh giá', () => {
    const a = assess([s(), s({ reading: { totalMs: 3000, count: 3 } })]);
    expect(a.notes.readingMs).toBeNull();
    expect(a.criteria.find((x) => x.key === 'readingSpeed')?.score).toBeNull();
  });

  it('nốt hay sai: gộp các phiên, xếp theo số lần sai, ghi nốt hay nhầm', () => {
    const tallies: NoteTally[] = [
      { midi: 64, hits: 6, misses: 4, confusions: { '65': 3, '62': 1 } },
      { midi: 71, hits: 4, misses: 1, confusions: { '72': 1 } },
      { midi: 60, hits: 20, misses: 0, confusions: {} },
      { midi: 67, hits: 1, misses: 1, confusions: { '69': 1 } }, // < 3 lượt: bỏ qua
    ];
    const a = assessLearner(newProfile({ name: 'A', age: 30 }, 0), [s({ noteTallies: tallies })], LESSONS, NOW, 0, 'solfege');
    expect(a.notes.trouble.map((t) => [t.label, t.missRate, t.confusedWith])).toEqual([
      ['Mi4', 0.4, 65],
      ['Si4', 0.2, 72],
    ]);
    const c = a.criteria.find((x) => x.key === 'troubleNotes')!;
    expect(c.score).toBe(60);
    expect(c.detail).toContain('Mi4 sai 40% (hay nhầm Fa4)');
    expect(c.tip).toContain('Mi4, Si4');
  });

  it('nốt hay sai: chưa đủ 20 lượt đánh → chưa đánh giá', () => {
    const a = assess([s({ noteTallies: [{ midi: 64, hits: 5, misses: 5, confusions: {} }] })]);
    expect(a.criteria.find((x) => x.key === 'troubleNotes')?.score).toBeNull();
  });

  it('nhãn trình độ', () => {
    expect([0, 20, 45, 70, 100].map(skillLevel)).toEqual(['Mới bắt đầu', 'Cơ bản', 'Khá', 'Vững', 'Vững']);
  });
});
