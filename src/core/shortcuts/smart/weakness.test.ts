import { describe, expect, it } from 'vitest';
import { emptyStats } from '../../fiveFinger/stats';
import { lessonManager } from '../../lessons/LessonManager';
import type { NoteTally } from '../../practice/NoteStats';
import { computeSmartShortcuts } from './engine';
import { DAY, NOW, policy, PROFILE, record, records, session, smartInput } from './testing';
import { WEAKNESS_RULES, weaknessDrafts } from './weakness';

const F4 = 65;
const tally = (midi: number, hits: number, misses: number, confusions: Record<string, number> = {}): NoteTally => ({ midi, hits, misses, confusions });

/** Hai phiên Luyện tập: Fa4 sai 6/14 (hay nhầm Sol4) + Đô4 đúng hết — đủ 20 lượt nốt. */
function troubleSessions(extra: NoteTally[] = []) {
  return [
    session('lib-a', { startedAt: NOW - 3 * DAY, noteTallies: [tally(F4, 4, 3, { 67: 2 }), tally(60, 5, 0)] }),
    session('lib-a', { startedAt: NOW - DAY, noteTallies: [tally(F4, 4, 3, { 67: 2, 64: 1 }), tally(60, 5, 0), ...extra] }),
  ];
}

describe('nốt hay sai (màn Luyện tập)', () => {
  it('đủ dữ liệu → "Luyện lại nốt Fa" mở Bóng bay kiểu Tìm nốt (hình nốt trên khuông), lý do đúng số liệu', () => {
    const [d] = weaknessDrafts(smartInput({ sessions: troubleSessions() }));
    expect(d).toMatchObject({
      type: 'weakness',
      label: 'Luyện lại nốt Fa',
      icon: '🎯',
      reason: 'Fa4 sai 6/14 lần (43%) ở 2 lần tập gần đây · hay nhầm thành Sol4',
      evidence: { kind: 'trouble-note', midi: F4, attempts: 14, misses: 6, sessions: 2, confusedWith: 67 },
      target: {
        type: 'game',
        id: 'balloon-pop',
        params: { preset: { game: 'hunt', huntLetters: ['F'], mode: 'one-hand', hand: 'right', difficulty: 'easy', display: 'staff', staffClef: 'treble', labelStyle: 'solfege' } },
      },
    });
    // Qua engine: registry nhận đích Bóng bay có cấu hình → hiện đúng tên tự đặt.
    const r = computeSmartShortcuts(smartInput({ sessions: troubleSessions() }), policy());
    expect(r.candidates.find((c) => c.type === 'weakness')?.label).toBe('Luyện lại nốt Fa');
  });

  it('chưa đủ dữ liệu → KHÔNG suy đoán điểm yếu', () => {
    // Tổng lượt nốt < 20.
    const few = [session('lib-a', { noteTallies: [tally(F4, 2, 4), tally(60, 5, 0)] })];
    expect(weaknessDrafts(smartInput({ sessions: few }))).toEqual([]);
    // Đủ tổng lượt nhưng nốt đó sai ít lần.
    const mild = [session('lib-a', { noteTallies: [tally(F4, 12, 2), tally(60, 20, 0)] })];
    expect(weaknessDrafts(smartInput({ sessions: mild }))).toEqual([]);
    expect(weaknessDrafts(smartInput())).toEqual([]);
  });

  it('La / Si cần chế độ 7 nốt; nốt khoá Fa → tay trái, khoá Fa', () => {
    const a3 = 57;
    const [d] = weaknessDrafts(smartInput({ sessions: [session('lib-a', { noteTallies: [tally(a3, 3, 5), tally(60, 15, 0)] })] }));
    expect(d.target.params?.preset).toMatchObject({ huntLetters: ['A'], mode: 'seven', hand: 'left', staffClef: 'bass' });
  });

  it('hết giờ chơi hoặc nốt đen → luyện bằng bài Thư viện có nốt đó', () => {
    const [locked] = weaknessDrafts(smartInput({ sessions: troubleSessions(), gameTimeRemainingMs: 0 }));
    expect(locked.target.type).toBe('practice');
    expect(lessonManager.get(locked.target.id)!.notes.filter((n) => n.midi === F4).length).toBeGreaterThanOrEqual(2);
    const fSharp = 66;
    const [black] = weaknessDrafts(smartInput({ sessions: [session('lib-a', { noteTallies: [tally(fSharp, 3, 5), tally(60, 15, 0)] })] }));
    expect(black).toMatchObject({ label: 'Luyện lại nốt Fa#', target: { type: 'practice' } });
    expect(lessonManager.get(black.target.id)!.notes.filter((n) => n.midi === fSharp).length).toBeGreaterThanOrEqual(2);
  });
});

describe('lỗi bài tập giáo trình', () => {
  const withMistakes = (mistakes: Record<string, number>, lastPracticedAt = NOW - DAY) =>
    records(record('l1-06-staff', { attempts: 1, mistakes, lastPracticedAt }));

  it('cùng một nốt nhầm / lỡ ≥ 5 lần ở buổi gần đây → luyện lại nốt đó', () => {
    const [d] = weaknessDrafts(smartInput({ records: withMistakes({ 'note:F4>G4': 3, 'miss:F4': 2, 'note:E4>F4': 1 }) }));
    expect(d).toMatchObject({ label: 'Luyện lại nốt Fa', reason: 'Nhầm hoặc lỡ nốt Fa4 5 lần ở 1 buổi học gần đây', evidence: { kind: 'curriculum-confusion', pitch: 'F4', count: 5 } });
  });

  it(`ít hơn ${WEAKNESS_RULES.minCurriculumMistakes} lần, hoặc buổi luyện quá ${WEAKNESS_RULES.curriculumWindowDays} ngày → không`, () => {
    expect(weaknessDrafts(smartInput({ records: withMistakes({ 'note:F4>G4': 4 }) }))).toEqual([]);
    expect(weaknessDrafts(smartInput({ records: withMistakes({ 'note:F4>G4': 9 }, NOW - 40 * DAY) }))).toEqual([]);
    // Lỗi không phải nốt (câu hỏi sai, gõ thừa) không tính.
    expect(weaknessDrafts(smartInput({ records: withMistakes({ 'ask:Ngón cái là ngón số mấy?': 9, extra: 9 }) }))).toEqual([]);
  });
});

describe('bài Thư viện độ chính xác thấp', () => {
  it('≥ 2 phiên, ≥ 30 nốt, đúng < 70% → luyện lại bài đó', () => {
    const lesson = lessonManager.all()[2];
    const sessions = [session(lesson.id, { correct: 10, wrong: 8, startedAt: NOW - 2 * DAY }), session(lesson.id, { correct: 12, wrong: 6 })];
    const [d] = weaknessDrafts(smartInput({ sessions }));
    expect(d).toMatchObject({ target: { type: 'practice', id: lesson.id }, verb: 'Luyện lại', reason: 'Đúng 61% nốt sau 2 lần tập' });
  });

  it('một phiên / ít nốt / đúng ≥ 70% → không', () => {
    const id = lessonManager.all()[2].id;
    expect(weaknessDrafts(smartInput({ sessions: [session(id, { correct: 10, wrong: 30 })] }))).toEqual([]);
    expect(weaknessDrafts(smartInput({ sessions: [session(id, { correct: 5, wrong: 5 }), session(id, { correct: 5, wrong: 5 })] }))).toEqual([]);
    expect(weaknessDrafts(smartInput({ sessions: [session(id, { correct: 30, wrong: 10 }), session(id, { correct: 30, wrong: 10 })] }))).toEqual([]);
  });
});

describe('đọc nốt chậm', () => {
  const slow = [session('lib-a', { reading: { totalMs: 36_000, count: 12 } }), session('lib-a', { reading: { totalMs: 30_000, count: 10 } })];

  it('chậm ≥ 1,5 × mục tiêu theo tuổi → Flappy Note (đọc nhanh)', () => {
    const [d] = weaknessDrafts(smartInput({ profile: PROFILE, sessions: slow }));
    expect(d).toMatchObject({ label: 'Luyện đọc nốt nhanh', target: { type: 'game', id: 'flappy-note' }, reason: 'Trung bình 3,0 giây/nốt (mục tiêu ≤ 1,5 giây)' });
  });

  it('khách (không biết tuổi) / đọc đủ nhanh / ít nốt đo → không', () => {
    expect(weaknessDrafts(smartInput({ sessions: slow }))).toEqual([]);
    expect(weaknessDrafts(smartInput({ profile: PROFILE, sessions: [session('lib-a', { reading: { totalMs: 30_000, count: 25 } })] }))).toEqual([]);
    expect(weaknessDrafts(smartInput({ profile: PROFILE, sessions: [session('lib-a', { reading: { totalMs: 60_000, count: 10 } })] }))).toEqual([]);
  });
});

describe('5 ngón · 8 nốt', () => {
  it('tay đúng < 75% trên ≥ 40 nốt → luyện 5 ngón tay đó (không kết luận gì về ngón)', () => {
    const stats = emptyStats();
    stats.hands.left = { ...stats.hands.left, correct: 25, wrong: 20, chains: 6 };
    stats.hands.right = { ...stats.hands.right, correct: 40, wrong: 2, chains: 6 };
    const [d] = weaknessDrafts(smartInput({ fiveFinger: stats }));
    expect(d).toMatchObject({ label: 'Luyện 5 ngón tay trái', target: { type: 'page', id: 'five-finger' }, reason: 'Tay trái đúng 56% nốt ở 6 chuỗi đã luyện' });
    stats.hands.left = { ...stats.hands.left, correct: 15, wrong: 10 };
    expect(weaknessDrafts(smartInput({ fiveFinger: stats }))).toEqual([]);
  });
});
