// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import type { LearnerProfile } from '../profile/LearnerProfile';
import { loadTomatoProgress, recordTomatoResult, tomatoLeaderboard } from './storage';

const profile = (id: string): LearnerProfile => ({ id, name: id, age: 8, avatar: '🐰', experience: 'new', goals: [], dailyMinutes: 10, createdAt: 1 });

describe('tomato harvest storage', () => {
  beforeEach(() => localStorage.clear());

  it('lưu riêng theo hồ sơ và không thay kỷ lục bằng ván kém hơn', () => {
    let p = loadTomatoProgress();
    p = recordTomatoResult(p, { profileId: 'a', difficulty: 'easy', score: 60, stars: 3, accuracy: 0.95, durationMs: 5000, goldenHarvested: 3, correct: 50, wrong: 2, achievedAt: 1 });
    p = recordTomatoResult(p, { profileId: 'a', difficulty: 'easy', score: 70, stars: 2, accuracy: 0.8, durationMs: 4000, goldenHarvested: 4, correct: 50, wrong: 10, achievedAt: 2 });
    p = recordTomatoResult(p, { profileId: 'b', difficulty: 'easy', score: 55, stars: 3, accuracy: 0.91, durationMs: 3000, goldenHarvested: 3, correct: 50, wrong: 5, achievedAt: 3 });
    expect(p.best.a.easy?.stars).toBe(3);
    expect(p.best.b.easy?.accuracy).toBe(0.91);
    expect(loadTomatoProgress().history).toHaveLength(3);
  });

  it('xếp theo sao, độ chính xác rồi thời gian', () => {
    let p = loadTomatoProgress();
    for (const [id, accuracy, duration] of [['a', 0.95, 6000], ['b', 0.95, 5000], ['c', 0.9, 3000]] as const) {
      p = recordTomatoResult(p, { profileId: id, difficulty: 'hard', score: 60, stars: 3, accuracy, durationMs: duration, goldenHarvested: 3, correct: 50, wrong: 2, achievedAt: duration });
    }
    expect(tomatoLeaderboard(p, ['a', 'b', 'c'].map(profile), 'hard').map((r) => r.profile.id)).toEqual(['b', 'a', 'c']);
  });
});
