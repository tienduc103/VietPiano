import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';
import {
  IndexedDbProgressStorage,
  MemoryProgressStorage,
  applySession,
  computeTotals,
  emptyProgress,
  type PracticeSession,
} from './ProgressStorage';

const session = (over: Partial<PracticeSession> = {}): PracticeSession => ({
  lessonId: 'scale-c-major',
  startedAt: 1_000_000,
  durationMs: 60_000,
  correct: 16,
  wrong: 4,
  skipped: 0,
  completed: true,
  notesReached: 16,
  totalNotes: 16,
  ...over,
});

describe('applySession', () => {
  it('cộng dồn thống kê và giữ độ chính xác tốt nhất', () => {
    let p = emptyProgress('x');
    p = applySession(p, session({ correct: 8, wrong: 2 }));
    p = applySession(p, session({ correct: 9, wrong: 1, startedAt: 2_000_000 }));
    p = applySession(p, session({ correct: 1, wrong: 9, completed: false }));
    expect(p).toMatchObject({
      sessions: 3,
      completions: 2,
      bestAccuracy: 0.9,
      totalCorrect: 18,
      totalWrong: 12,
      totalPracticeMs: 180_000,
      lastPracticedAt: 2_060_000,
    });
  });

  it('phiên chưa hoàn thành không tính vào độ chính xác tốt nhất', () => {
    const p = applySession(emptyProgress('x'), session({ completed: false, correct: 10, wrong: 0 }));
    expect(p.bestAccuracy).toBe(0);
  });

  it('tập riêng một tay: cộng thời gian + số nốt, không tính là đã hoàn thành cả bài', () => {
    const p = applySession(emptyProgress('x'), session({ hand: 'left', correct: 10, wrong: 0 }));
    expect(p).toMatchObject({ sessions: 1, completions: 0, bestAccuracy: 0, totalCorrect: 10, totalPracticeMs: 60_000 });
  });
});

describe.each([
  ['IndexedDB', () => new IndexedDbProgressStorage(new IDBFactory())],
  ['Memory', () => new MemoryProgressStorage()],
])('%s storage', (_name, make) => {
  it('ghi phiên và đọc lại tiến độ', async () => {
    const st = make();
    await st.recordSession(session());
    await st.recordSession(session({ lessonId: 'song-twinkle', startedAt: 5_000_000 }));
    const all = await st.getAllProgress();
    expect(Object.keys(all).sort()).toEqual(['scale-c-major', 'song-twinkle']);
    expect(all['scale-c-major'].completions).toBe(1);
    expect(computeTotals(all)).toMatchObject({ sessions: 2, totalCorrect: 32, lessonsCompleted: 2 });
  });

  it('lấy phiên gần nhất theo thời gian', async () => {
    const st = make();
    for (const t of [3, 1, 2]) await st.recordSession(session({ startedAt: t * 1000 }));
    const recent = await st.getRecentSessions(2);
    expect(recent.map((s) => s.startedAt)).toEqual([3000, 2000]);
  });

  it('đọc toàn bộ phiên, giữ profileId', async () => {
    const st = make();
    await st.recordSession(session({ profileId: 'p1' }));
    await st.recordSession(session({ startedAt: 2_000_000 }));
    const all = await st.getAllSessions();
    expect(all).toHaveLength(2);
    expect(all.find((s) => s.startedAt === 1_000_000)?.profileId).toBe('p1');
  });

  it('xoá toàn bộ dữ liệu', async () => {
    const st = make();
    await st.recordSession(session());
    await st.clearAll();
    expect(await st.getAllProgress()).toEqual({});
  });
});
