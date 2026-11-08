import { describe, expect, it } from 'vitest';
import { emptyStats } from '../../fiveFinger/stats';
import { curriculumGameIndex } from '../../games/catalog';
import { resolveTarget } from '../registry';
import { DAY, NOW, record, records, TZ } from './testing';
import { usageFromArcade, usageFromFiveFinger, usageFromLessonGames, usageFromPlays, usageFromTimes } from './usage';

describe('gom số lần dùng từ kho kết quả sẵn có', () => {
  it('kho có thời điểm: chỉ đếm trong 30 ngày', () => {
    const u = usageFromTimes({ type: 'game', id: 'tomato-harvest' }, [NOW - DAY, NOW - 2 * DAY, NOW - 40 * DAY], NOW);
    expect(u).toEqual({ target: { type: 'game', id: 'tomato-harvest' }, uses: 2, lastAt: NOW - DAY, windowDays: 30, unit: 'play' });
    expect(usageFromTimes({ type: 'game', id: 'f1-racing' }, [NOW - 40 * DAY], NOW)).toBeNull();
  });

  it('kho chỉ có số ván: tổng số ván, không có thời điểm', () => {
    expect(usageFromPlays({ type: 'game', id: 'flappy-note' }, { 'l1:easy': { plays: 3 }, 'l2:hard': { plays: 2 } })).toMatchObject({ uses: 5, lastAt: null, windowDays: null });
    expect(usageFromPlays({ type: 'game', id: 'flappy-note' }, {})).toBeNull();
  });

  it('trò tự do: mỗi mức chơi một đích, đích tồn tại trong registry', () => {
    const [u, ...rest] = usageFromArcade({ 'note-sprint:treble-5': { plays: 4, bestScore: 10, bestStars: 1 }, 'ear-finder:c-five': { plays: 0, bestScore: 0, bestStars: 0 } });
    expect(rest).toEqual([]);
    expect(u).toMatchObject({ target: { type: 'arcade', id: 'note-sprint:treble-5' }, uses: 4 });
    expect(resolveTarget(u.target)).not.toBeNull();
  });

  it('trò sau buổi: giáo trình chính → trò trong mục Trò chơi; giáo trình dẫn dắt → phần Trò chơi của buổi', () => {
    const entry = curriculumGameIndex()[0];
    const kind = entry.specs[0].kind;
    const recs = records(record(entry.lesson.lessonId, { games: { [kind]: { plays: 3, bestScore: 5, bestStars: 1 } } }), record('nd-c', { games: { 'note-catch': { plays: 2, bestScore: 1, bestStars: 1 } } }));
    const list = usageFromLessonGames(recs);
    expect(list).toContainEqual(expect.objectContaining({ target: { type: 'lesson-game', id: `${entry.lesson.lessonId}:${kind}` }, uses: 3 }));
    expect(list).toContainEqual(expect.objectContaining({ target: { type: 'lesson', id: 'nd-c', params: { stage: 'game' } }, uses: 2 }));
    for (const u of list) expect(resolveTarget(u.target)).not.toBeNull();
  });

  it('5 ngón: đếm số NGÀY có luyện (không đếm từng chuỗi 8 nốt)', () => {
    const stats = emptyStats();
    const chain = (at: number) => ({ at, seed: 1, handMode: 'right' as const, difficulty: 'easy' as const, position: 'c-right' as never, steps: 8, accuracy: 1, firstTry: 8, avgReactionMs: 500, lateSync: 0 });
    stats.history = [chain(NOW - DAY), chain(NOW - DAY + 60_000), chain(NOW - 3 * DAY), chain(NOW - 50 * DAY)];
    expect(usageFromFiveFinger(stats, NOW, TZ)).toMatchObject({ target: { type: 'page', id: 'five-finger' }, uses: 2, unit: 'day' });
    expect(usageFromFiveFinger(null, NOW, TZ)).toBeNull();
  });
});
