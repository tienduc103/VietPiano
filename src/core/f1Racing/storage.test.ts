// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import type { LearnerProfile } from '../profile/LearnerProfile';
import { compareRuns, DEFAULT_F1_SETTINGS, f1Leaderboard, formatRaceTime, loadF1Progress, loadF1Settings, recordF1Run, sanitizeF1Progress, sanitizeF1Settings, saveF1Settings, topTrophy, trophyFor, type F1Run } from './storage';

const profile = (id: string): LearnerProfile => ({ id, name: id, age: 8, avatar: '🏎️', experience: 'new', goals: [], dailyMinutes: 10, createdAt: 1 });
const run = (patch: Partial<F1Run> = {}): F1Run => ({
  profileId: 'a',
  difficulty: 'easy',
  carId: 'red-flash',
  timeMs: 50_000,
  accuracy: 0.9,
  correct: 9,
  wrong: 1,
  collisions: 1,
  bestStreak: 5,
  assistCount: 0,
  trophy: 'silver',
  achievedAt: 1,
  ...patch,
});

describe('cúp', () => {
  it('trao đúng điều kiện', () => {
    expect(trophyFor(0.79, 0)).toBe('bronze');
    expect(trophyFor(0, 0)).toBe('bronze');
    expect(trophyFor(0.8, 3)).toBe('silver');
    expect(trophyFor(0.94, 0)).toBe('silver');
    expect(trophyFor(0.95, 1)).toBe('gold');
    expect(trophyFor(0.95, 0)).toBe('diamond');
    expect(trophyFor(1, 0)).toBe('diamond');
  });

  it('bộ sưu tập riêng từng hồ sơ, cúp cao nhất giữ lại dù ván sau kém hơn', () => {
    let p = loadF1Progress();
    p = recordF1Run(p, run({ trophy: 'gold' })).progress;
    p = recordF1Run(p, run({ trophy: 'bronze', achievedAt: 2 })).progress;
    p = recordF1Run(p, run({ profileId: 'b', trophy: 'bronze', achievedAt: 3 })).progress;
    expect(p.trophies.a.easy).toEqual({ gold: 1, bronze: 1 });
    expect(topTrophy(p, 'a', 'easy')).toBe('gold');
    expect(topTrophy(p, 'b', 'easy')).toBe('bronze');
    expect(topTrophy(p, 'b', 'hard')).toBeNull();
  });
});

describe('xếp hạng', () => {
  beforeEach(() => localStorage.clear());

  it('ưu tiên thời gian, rồi độ chính xác, rồi số va chạm', () => {
    const profiles = [profile('a'), profile('b'), profile('c'), profile('d')];
    let p = loadF1Progress();
    p = recordF1Run(p, run({ profileId: 'a', timeMs: 52_000 })).progress;
    p = recordF1Run(p, run({ profileId: 'b', timeMs: 50_000, accuracy: 0.8 })).progress;
    p = recordF1Run(p, run({ profileId: 'c', timeMs: 50_000, accuracy: 0.9, collisions: 2 })).progress;
    p = recordF1Run(p, run({ profileId: 'd', timeMs: 50_000, accuracy: 0.9, collisions: 0 })).progress;
    expect(f1Leaderboard(p, profiles, 'easy').map((r) => r.profile.id)).toEqual(['d', 'c', 'b', 'a']);
  });

  it('riêng từng độ khó; hồ sơ đã xoá không hiện', () => {
    let p = loadF1Progress();
    p = recordF1Run(p, run({ profileId: 'a', difficulty: 'hard' })).progress;
    p = recordF1Run(p, run({ profileId: 'gone', difficulty: 'hard' })).progress;
    expect(f1Leaderboard(p, [profile('a')], 'easy')).toHaveLength(0);
    expect(f1Leaderboard(p, [profile('a')], 'hard').map((r) => r.profile.id)).toEqual(['a']);
  });

  it('kỷ lục cá nhân chỉ thay khi ván mới tốt hơn', () => {
    let p = loadF1Progress();
    const first = recordF1Run(p, run({ timeMs: 50_000 }));
    expect(first.isRecord).toBe(true);
    const worse = recordF1Run(first.progress, run({ timeMs: 60_000 }));
    expect(worse.isRecord).toBe(false);
    expect(worse.progress.best.a.easy?.timeMs).toBe(50_000);
    const better = recordF1Run(worse.progress, run({ timeMs: 45_000 }));
    expect(better.isRecord).toBe(true);
    p = better.progress;
    expect(p.best.a.easy?.timeMs).toBe(45_000);
    expect(p.history).toHaveLength(3);
  });

  it('chênh dưới 0,1 giây coi như bằng thời gian', () => {
    expect(compareRuns(run({ timeMs: 50_010, accuracy: 0.9 }), run({ timeMs: 50_030, accuracy: 0.8 }))).toBeLessThan(0);
  });

  it('khôi phục đúng bảng xếp hạng sau khi mở lại', () => {
    recordF1Run(loadF1Progress(), run({ trophy: 'diamond', carId: 'purple-rocket' }));
    const reopened = loadF1Progress();
    const rows = f1Leaderboard(reopened, [profile('a')], 'easy');
    expect(rows[0].best.carId).toBe('purple-rocket');
    expect(rows[0].top).toBe('diamond');
  });

  it('dữ liệu hỏng không làm treo game', () => {
    localStorage.setItem('vietpiano.f1-racing.v1', '{bad json');
    expect(loadF1Progress().history).toEqual([]);
    const clean = sanitizeF1Progress({ history: [{ profileId: 'a' }, run()], best: { a: { easy: { nope: 1 }, hard: run({ difficulty: 'hard' }) } }, trophies: { a: { easy: { gold: 2, fake: 3, silver: -1 } } } });
    expect(clean.history).toHaveLength(1);
    expect(clean.best.a.easy).toBeUndefined();
    expect(clean.best.a.hard?.difficulty).toBe('hard');
    expect(clean.trophies.a.easy).toEqual({ gold: 2 });
  });
});

describe('cài đặt', () => {
  beforeEach(() => localStorage.clear());

  it('lưu và khôi phục cài đặt âm thanh', () => {
    saveF1Settings({ ...DEFAULT_F1_SETTINGS, musicOn: false, musicVolume: 0.2, sfxVolume: 0.9, carId: 'green-bolt', nav: { left: 40, right: 41 } });
    const s = loadF1Settings();
    expect(s.musicOn).toBe(false);
    expect(s.musicVolume).toBe(0.2);
    expect(s.sfxVolume).toBe(0.9);
    expect(s.carId).toBe('green-bolt');
    expect(s.nav).toEqual({ left: 40, right: 41 });
  });

  it('giá trị sai quay về mặc định, âm lượng bị kẹp 0–1', () => {
    const s = sanitizeF1Settings({ carId: 'x', difficulty: 'y', musicVolume: 9, sfxVolume: 'a', nav: { left: 500, right: 1.5 } });
    expect(s.carId).toBe(DEFAULT_F1_SETTINGS.carId);
    expect(s.difficulty).toBe('easy');
    expect(s.musicVolume).toBe(1);
    expect(s.sfxVolume).toBe(DEFAULT_F1_SETTINGS.sfxVolume);
    expect(s.nav).toEqual(DEFAULT_F1_SETTINGS.nav);
  });
});

describe('hiển thị thời gian', () => {
  it('định dạng tiếng Việt', () => {
    expect(formatRaceTime(48_230)).toBe('48,2 giây');
    expect(formatRaceTime(83_400)).toBe('1:23,4');
    expect(formatRaceTime(65_000)).toBe('1:05,0');
  });
});
