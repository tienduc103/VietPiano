import { describe, expect, it } from 'vitest';
import { GAME_ICON, GAME_TITLE } from './gameForLesson';
import { curriculumGameIndex, GAME_INFO, GAME_ORDER, lessonLabel, lessonsWithGame, specSummary } from './catalog';

describe('catalog', () => {
  it('mọi trò đều có trong thứ tự hiển thị + có tên, icon, thông tin', () => {
    expect(new Set(GAME_ORDER)).toEqual(new Set(Object.keys(GAME_TITLE)));
    for (const k of GAME_ORDER) {
      expect(GAME_ICON[k]).toBeTruthy();
      expect(GAME_INFO[k].skill).toBeTruthy();
    }
  });

  it('chỉ mục giáo trình: mọi buổi có ≥ 2 trò; mọi trò của buổi học đều có ở ít nhất một buổi', () => {
    const index = curriculumGameIndex();
    expect(index.length).toBeGreaterThan(20);
    for (const e of index) {
      expect(e.specs.length).toBeGreaterThanOrEqual(2);
      for (const s of e.specs) expect(specSummary(s)).not.toBe('');
    }
    for (const k of GAME_ORDER.filter((k) => GAME_INFO[k].source === 'lesson')) expect(lessonsWithGame(index, k).length).toBeGreaterThan(0);
    expect(lessonLabel(index[0].level, index[0].lesson)).toMatch(/^Cấp 1 · Buổi 1 — /);
  });

  it('chú thích nội dung', () => {
    expect(specSummary({ kind: 'note-catch', keyboard: { from: 60, to: 71 }, notes: [60, 62, 64] })).toBe('Đô4 → Mi4 · 3 nốt');
    expect(specSummary({ kind: 'note-catch', keyboard: { from: 60, to: 71 }, notes: [60, 62, 64] }, 'letter')).toBe('C4 → E4 · 3 nốt');
    expect(specSummary({ kind: 'staff-shoot', keyboard: { from: 48, to: 59 }, clef: 'bass', notes: [48, 50] })).toBe('Khuông Fa · Đô3 → Rê3 · 2 nốt');
    expect(specSummary({ kind: 'interval-detective', keyboard: { from: 60, to: 83 }, intervals: [3, 4], directions: ['up'] })).toBe('quãng 3 thứ, quãng 3 trưởng · đi lên');
    expect(specSummary({ kind: 'steady-beat', bpm: 80, silentBeats: 16 })).toBe('80 BPM · tự giữ 16 phách');
  });
});
