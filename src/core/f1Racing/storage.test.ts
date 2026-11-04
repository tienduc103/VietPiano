// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import type { LearnerProfile } from '../profile/LearnerProfile';
import { compareRuns, minCorrectNotes, qualifies, DEFAULT_F1_SETTINGS, f1Leaderboard, formatRaceTime, loadF1Progress, loadF1Settings, recordF1Run, sanitizeF1Progress, sanitizeF1Settings, saveF1Settings, topTrophy, trophyFor, type F1Run } from './storage';

const profile = (id: string): LearnerProfile => ({ id, name: id, age: 8, avatar: '🏎️', experience: 'new', goals: [], dailyMinutes: 10, createdAt: 1 });
const run = (patch: Partial<F1Run> = {}): F1Run => ({
  profileId: 'a',
  difficulty: 'easy',
  carId: 'red-flash',
  timeMs: 50_000,
  accuracy: 0.9,
  correct: 30,
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
    p = recordF1Run(p, run({ profileId: 'a', difficulty: 'hard', correct: 60 })).progress;
    p = recordF1Run(p, run({ profileId: 'gone', difficulty: 'hard', correct: 60 })).progress;
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

describe('số nốt đúng tối thiểu', () => {
  beforeEach(() => localStorage.clear());

  it('1 nốt mỗi 25 m: 20 / 40 / 60 nốt', () => {
    expect(minCorrectNotes('easy')).toBe(20);
    expect(minCorrectNotes('medium')).toBe(40);
    expect(minCorrectNotes('hard')).toBe(60);
    expect(qualifies(run({ correct: 19 }))).toBe(false);
    expect(qualifies(run({ correct: 20 }))).toBe(true);
    expect(qualifies(run({ difficulty: 'hard', correct: 59 }))).toBe(false);
  });

  it('không đánh nốt nào: vẫn lưu lịch sử và cúp, nhưng không kỷ lục, không lên bảng', () => {
    const out = recordF1Run(loadF1Progress(), run({ correct: 0, wrong: 0, accuracy: 0, timeMs: 50_000, trophy: 'bronze' }));
    expect(out.qualified).toBe(false);
    expect(out.isRecord).toBe(false);
    expect(out.progress.history).toHaveLength(1);
    expect(out.progress.trophies.a.easy).toEqual({ bronze: 1 });
    expect(f1Leaderboard(out.progress, [profile('a')], 'easy')).toHaveLength(0);
  });

  it('ván không đủ nốt dù nhanh hơn không thay kỷ lục hợp lệ', () => {
    let p = recordF1Run(loadF1Progress(), run({ timeMs: 60_000 })).progress;
    const cheat = recordF1Run(p, run({ timeMs: 50_000, correct: 5 }));
    expect(cheat.isRecord).toBe(false);
    p = cheat.progress;
    expect(p.best.a.easy?.timeMs).toBe(60_000);
    expect(f1Leaderboard(p, [profile('a')], 'easy')[0].best.timeMs).toBe(60_000);
  });

  it('dữ liệu cũ có kỷ lục không đủ nốt: bị bỏ khỏi bảng, ván hợp lệ đầu tiên thành kỷ lục', () => {
    localStorage.setItem('vietpiano.f1-racing.v1', JSON.stringify({ history: [], best: { a: { easy: run({ correct: 0, timeMs: 50_000 }) } }, trophies: {} }));
    const old = loadF1Progress();
    expect(f1Leaderboard(old, [profile('a')], 'easy')).toHaveLength(0);
    const out = recordF1Run(old, run({ timeMs: 70_000 }));
    expect(out.isRecord).toBe(true);
    expect(f1Leaderboard(out.progress, [profile('a')], 'easy')[0].best.timeMs).toBe(70_000);
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
