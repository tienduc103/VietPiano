import { describe, expect, it } from 'vitest';
import { ageGroup, newProfile, recommendedDailyMinutes, sanitizeProfile, sanitizeProfiles, sessionsForProfile } from './LearnerProfile';

describe('LearnerProfile', () => {
  it('chia nhóm tuổi và thời lượng tập gợi ý', () => {
    expect([4, 6, 7, 11, 12, 17, 18, 60].map(ageGroup)).toEqual(['preschool', 'preschool', 'child', 'child', 'teen', 'teen', 'adult', 'adult']);
    expect(recommendedDailyMinutes(5)).toBeLessThan(recommendedDailyMinutes(30));
  });

  it('tạo hồ sơ mới với giá trị mặc định theo tuổi', () => {
    const p = newProfile({ name: '  Bin ', age: 6 }, 1000);
    expect(p).toMatchObject({ name: 'Bin', age: 6, experience: 'new', goals: [], dailyMinutes: 10, createdAt: 1000 });
    expect(p.id).toMatch(/^p/);
  });

  it('làm sạch dữ liệu hỏng', () => {
    expect(sanitizeProfile(null)).toBeNull();
    expect(sanitizeProfile({ name: 'x' })).toBeNull();
    expect(sanitizeProfile({ id: 'a', age: 200, experience: 'pro', goals: ['songs', 'bay'], name: '' })).toMatchObject({
      age: 99,
      experience: 'new',
      goals: ['songs'],
      name: 'Người học',
    });
  });

  it('bỏ hồ sơ trùng id, chọn hồ sơ đầu tiên nếu activeId không hợp lệ', () => {
    const s = sanitizeProfiles({ profiles: [{ id: 'a', age: 8 }, { id: 'a', age: 9 }, { id: 'b', age: 30 }], activeId: 'zzz' });
    expect(s.profiles.map((p) => p.id)).toEqual(['a', 'b']);
    expect(s.activeId).toBe('a');
    expect(sanitizeProfiles('rác')).toEqual({ profiles: [], activeId: null });
  });

  it('phiên cũ không có profileId thuộc về hồ sơ tạo sớm nhất', () => {
    const profiles = [newProfile({ name: 'B', age: 30 }, 2000), newProfile({ name: 'A', age: 8 }, 1000)];
    const [b, a] = profiles;
    const sessions = [{ profileId: a.id }, { profileId: b.id }, {}];
    expect(sessionsForProfile(sessions, a.id, profiles)).toHaveLength(2);
    expect(sessionsForProfile(sessions, b.id, profiles)).toEqual([{ profileId: b.id }]);
  });
});
