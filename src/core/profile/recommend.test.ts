import { describe, expect, it } from 'vitest';
import { LESSONS } from '../lessons/library';
import type { PracticeSession } from '../storage/ProgressStorage';
import { assessLearner } from './assessment';
import { newProfile, type LearnerProfile } from './LearnerProfile';
import { recommendLessons } from './recommend';

const NOW = Date.UTC(2026, 9, 23, 12);
const s = (lessonId: string, over: Partial<PracticeSession> = {}): PracticeSession => ({
  lessonId,
  startedAt: NOW - 3600_000,
  durationMs: 5 * 60_000,
  correct: 30,
  wrong: 1,
  skipped: 0,
  completed: true,
  notesReached: 30,
  totalNotes: 30,
  ...over,
});

function recommend(profile: LearnerProfile, sessions: PracticeSession[] = []) {
  return recommendLessons(profile, assessLearner(profile, sessions, LESSONS, NOW, 0), LESSONS);
}

describe('recommendLessons', () => {
  it('trẻ mầm non: ưu tiên bài cho bé, chỉ bài dễ nhất', () => {
    const recs = recommend(newProfile({ name: 'Bé', age: 5 }, 0));
    expect(recs.length).toBeGreaterThan(0);
    expect(recs[0].lesson.category).toBe('kids');
    expect(recs.every((r) => r.lesson.difficulty === 1)).toBe(true);
  });

  it('người lớn mới học: không gợi ý bài cho bé, không gợi ý bài khó nhất', () => {
    const recs = recommend(newProfile({ name: 'An', age: 35 }, 0));
    expect(recs.some((r) => r.lesson.category === 'kids')).toBe(false);
    expect(recs.some((r) => r.lesson.difficulty === 3)).toBe(false);
  });

  it('bài tiếp theo của nhóm: người mới bắt đầu từ bài đầu; đã tập bài sau thì không quay lại bài trước', () => {
    const p = newProfile({ name: 'An', age: 30 }, 0);
    const next = (sessions: PracticeSession[]) =>
      recommend(p, sessions).find((r) => r.reason === 'Bài tiếp theo của nhóm' && r.lesson.category === 'notes')?.lesson.id;
    expect(next([])).toBe('notes-middle-c');
    expect(next([s('notes-seven')])).toBe('notes-lines');
  });

  it('mục tiêu đọc nốt đưa bài nhận biết nốt lên đầu', () => {
    const recs = recommend(newProfile({ name: 'An', age: 20, goals: ['reading'] }, 0));
    expect(recs[0].lesson.category).toBe('notes');
  });

  it('đa dạng: tối đa 2 bài mỗi nhóm, tối đa 6 bài', () => {
    const recs = recommend(newProfile({ name: 'An', age: 14, experience: 'basic', goals: ['songs'] }, 0));
    expect(recs).toHaveLength(6);
    const counts = new Map<string, number>();
    for (const r of recs) counts.set(r.lesson.category, (counts.get(r.lesson.category) ?? 0) + 1);
    expect(Math.max(...counts.values())).toBeLessThanOrEqual(2);
  });

  it('bài đang tập dở được ưu tiên, bài đã thuộc bị loại', () => {
    const p = newProfile({ name: 'An', age: 30 }, 0);
    const recs = recommend(p, [s('notes-seven'), s('song-twinkle', { completed: false, correct: 5, wrong: 1 })]);
    const ids = recs.map((r) => r.lesson.id);
    expect(ids).not.toContain('notes-seven');
    const twinkle = recs.find((r) => r.lesson.id === 'song-twinkle');
    expect(twinkle?.reason).toContain('tập dở');
  });

  it('bài đã qua nhưng chưa thuộc được gợi ý ôn lại', () => {
    const p = newProfile({ name: 'An', age: 30, goals: ['reading'] }, 0);
    const recs = recommend(p, [s('notes-seven', { correct: 85, wrong: 15 })]);
    expect(recs.find((r) => r.lesson.id === 'notes-seven')?.reason).toMatch(/Ôn lại.*85%/);
  });

  it('tay trái yếu → gợi ý bài tay trái', () => {
    const p = newProfile({ name: 'An', age: 30 }, 0);
    const recs = recommend(p, [s('rh-five-finger', { correct: 200, wrong: 2 })]);
    expect(recs.some((r) => r.lesson.hand === 'left' && r.reason === 'Tập thêm tay trái')).toBe(true);
  });

  it('ưu tiên bài có nhiều nốt hay sai', () => {
    const p = newProfile({ name: 'An', age: 30 }, 0);
    const tallies = [{ midi: 59, hits: 10, misses: 15, confusions: { '60': 15 } }]; // B3
    const recs = recommend(p, [s('notes-seven', { completed: false, correct: 10, wrong: 15, noteTallies: tallies })]);
    const hit = recs.find((r) => r.reason.startsWith('Luyện nốt hay sai'));
    expect(hit?.reason).toBe('Luyện nốt hay sai: B3');
    expect(hit!.lesson.notes.filter((n) => n.midi === 59).length).toBeGreaterThanOrEqual(2);
  });
});
