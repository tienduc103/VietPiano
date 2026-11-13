import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_QUIZ_SETTINGS } from './config';
import { NoteQuizRound, pointsFor, summarizeQuiz } from './NoteQuizRound';
import { makeRound, seededRandom } from './questions';
import { emptyStats, recordQuestion, weakItems, weightFor } from './tracker';
import { loadQuizData, NOTE_QUIZ_STORAGE_KEY, sanitizeProfileData, saveQuizData, withRoundResult } from './storage';
import { endText, noteQuizVoiceLines, praiseText, questionText } from './voice';
import type { QuizQuestion } from './questions';

const CONFIG = { smartHints: true, hintAfter: 1 as const, maxSupport: false };
const round = (n = 3, smartHints = true) => new NoteQuizRound(makeRound({ ...DEFAULT_QUIZ_SETTINGS, questions: n }, seededRandom(1)), { ...CONFIG, smartHints });
const wrongIndex = (q: QuizQuestion) => (q.answer === 0 ? 1 : 0);

/** Câu Cao độ 4 ô: hỏi Đô (ô 3). */
const pitchQ = (): QuizQuestion => ({
  mode: 'pitch',
  clef: 'treble',
  letter: 'C',
  duration: null,
  answer: 3,
  options: [
    { midi: 62, letter: 'D', duration: 'q' },
    { midi: 64, letter: 'E', duration: 'q' },
    { midi: 65, letter: 'F', duration: 'q' },
    { midi: 60, letter: 'C', duration: 'q' },
  ],
});

describe('NoteQuizRound', () => {
  it('chỉ nhận chạm khi đang hỏi; đúng → answered → câu sau → hết lượt', () => {
    const r = round(2);
    expect(r.answer(0, 0)).toBe('ignored');
    r.start();
    const q1 = r.getState().question!;
    expect(r.answer(q1.answer, 10)).toBe('correct');
    expect(r.getState().status).toBe('answered');
    // Đã trả lời → chạm thêm không tính.
    expect(r.answer(q1.answer, 20)).toBe('ignored');
    r.next();
    expect(r.getState()).toMatchObject({ status: 'asking', index: 1 });
    r.answer(r.getState().question!.answer, 30);
    r.next();
    expect(r.getState().status).toBe('finished');
    expect(r.getState().score).toBe(20);
  });

  it('gợi ý tăng dần: lời → minh hoạ → cất ô sai → chỉ đáp án; ô sai / ô đã cất không chạm lại được', () => {
    const r = new NoteQuizRound([pitchQ()], CONFIG);
    r.start();
    expect(r.answer(0, 1)).toBe('wrong');
    // Lần sai đầu: chỉ gợi ý bằng lời, không lộ đáp án.
    expect(r.getState().hint).toMatchObject({ level: 1, reveal: false, eliminated: [], staff: null });
    expect(r.getState().hinted).toBe(false);
    expect(r.answer(0, 2)).toBe('ignored');
    expect(r.answer(1, 3)).toBe('wrong');
    expect(r.getState().hint).toMatchObject({ level: 2, staff: { clef: 'treble', step: -2 } });
    // Còn 1 ô sai (Fa) → không cất được nữa → bậc 4 chỉ đáp án.
    expect(r.answer(2, 4)).toBe('wrong');
    expect(r.getState().hint).toMatchObject({ level: 4, reveal: true });
    expect(r.getState().hinted).toBe(true);
    expect(r.answer(3, 5)).toBe('correct');
    expect(r.getState().results[0]).toMatchObject({ wrong: 3, hintLevel: 4, revealed: true, points: 5, causes: ['pitch', 'pitch', 'pitch'] });
  });

  it('cô phải chỉ đáp án → thêm một câu tương tự ngay sau (một lần), không tính vào sao', () => {
    const similar = { ...pitchQ(), answer: 0, options: [...pitchQ().options].reverse() };
    const r = new NoteQuizRound([pitchQ(), pitchQ()], { ...CONFIG, maxSupport: true }, { makeSimilar: () => similar });
    r.start();
    r.answer(0, 1);
    r.answer(1, 2);
    r.answer(2, 3);
    expect(r.getState().hint?.reveal).toBe(true);
    r.answer(3, 4);
    expect(r.getState().total).toBe(3);
    r.next();
    expect(r.getState().question).toBe(similar);
    expect(r.isFollowUp(1)).toBe(true);
    r.answer(0, 5);
    r.next();
    r.answer(r.getState().question!.answer, 6);
    r.next();
    expect(r.getState().status).toBe('finished');
    const sum = summarizeQuiz(r.getState());
    expect(sum).toMatchObject({ total: 2, firstTry: 1, revealed: 1, score: 25 });
  });

  it('tắt gợi ý thông minh → chỉ "thử lại", không bao giờ lộ đáp án', () => {
    const r = new NoteQuizRound([pitchQ()], { ...CONFIG, smartHints: false });
    r.start();
    for (const i of [0, 1, 2]) r.answer(i, i);
    expect(r.getState().hint).toMatchObject({ level: 0, reveal: false, eliminated: [] });
    expect(r.getState().hinted).toBe(false);
    const r2 = round(1, false);
    r2.start();
    r2.answer(wrongIndex(r2.getState().question!), 1);
    expect(r2.getState().hint?.level).toBe(0);
  });

  it('điểm và sao: không trừ điểm, luôn ít nhất 1 sao khi chơi hết', () => {
    expect([pointsFor(0), pointsFor(1), pointsFor(5)]).toEqual([10, 5, 5]);
    const mk = (wrongs: number[]) => ({
      results: wrongs.map((w) => ({ wrong: w, wrongPicks: [], causes: [], hintLevel: 0 as const, revealed: false, followUp: false, points: pointsFor(w) })),
      score: wrongs.reduce((a, w) => a + pointsFor(w), 0),
    });
    expect(summarizeQuiz(mk(Array(10).fill(0))).stars).toBe(3);
    expect(summarizeQuiz(mk([...Array(7).fill(0), 1, 1, 1])).stars).toBe(2);
    expect(summarizeQuiz(mk(Array(10).fill(2)))).toMatchObject({ stars: 1, firstTry: 0, score: 50, maxScore: 100 });
  });
});

describe('theo dõi lỗi', () => {
  const q: QuizQuestion = {
    mode: 'both',
    clef: 'treble',
    letter: 'C',
    duration: 'w',
    answer: 0,
    options: [
      { midi: 60, letter: 'C', duration: 'w' },
      { midi: 60, letter: 'C', duration: 'h' },
      { midi: 62, letter: 'D', duration: 'w' },
    ],
  };
  it('Kết hợp: nhầm trường độ chỉ tính cho trường độ', () => {
    const s = recordQuestion(emptyStats(), q, { wrongPicks: [q.options[1]] });
    expect(s.items['p:treble:C']).toEqual({ asked: 1, missed: 0, streak: 1, helped: 0 });
    expect(s.items['d:w']).toEqual({ asked: 1, missed: 1, streak: 0, helped: 0 });
    expect(s.confusions).toEqual({ 'd:w>d:h': 1 });
  });
  it('phần hay nhầm → trọng số cao + báo cho phụ huynh kèm phần hay nhầm sang', () => {
    let s = emptyStats();
    for (let i = 0; i < 4; i++) s = recordQuestion(s, q, { wrongPicks: i < 3 ? [q.options[2]] : [] });
    expect(weightFor(s)('p:treble:C')).toBeGreaterThan(weightFor(s)('d:w'));
    expect(weakItems(s)).toEqual([{ key: 'p:treble:C', label: 'Đô · Khoá Sol', asked: 4, missed: 3, confusedKey: 'p:treble:D', confusedWith: 'Rê · Khoá Sol' }]);
  });
});

describe('lưu theo hồ sơ', () => {
  afterEach(() => vi.unstubAllGlobals());
  it('ghi / đọc theo hồ sơ, dữ liệu hỏng thì bỏ', () => {
    const store = new Map<string, string>();
    vi.stubGlobal('localStorage', { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) });
    const d = loadQuizData('p1');
    const next = withRoundResult({ ...d, settings: { ...d.settings, clef: 'bass' } }, { at: 1, key: 'k', total: 10, firstTry: 9, score: 95, stars: 3 });
    saveQuizData('p1', next);
    expect(loadQuizData('p1').settings.clef).toBe('bass');
    expect(loadQuizData('p1').records.k).toEqual({ plays: 1, bestScore: 95, bestStars: 3 });
    expect(loadQuizData('p2').settings.clef).toBe('treble');
    localStorage.setItem(NOTE_QUIZ_STORAGE_KEY, '{oops');
    expect(loadQuizData('p1').history).toEqual([]);
    expect(sanitizeProfileData({ stats: { items: { 'p:treble:C': { asked: 2, missed: 9 }, bad: { asked: 1 } } } }).stats.items).toEqual({ 'p:treble:C': { asked: 2, missed: 2, streak: 0, helped: 0 } });
  });
});

describe('câu cô giáo', () => {
  it('đúng mẫu câu của thiết kế', () => {
    expect(questionText({ letter: 'C', duration: null })).toBe('Bé ơi, đâu là nốt Đô?');
    expect(questionText({ letter: null, duration: 'w' })).toBe('Bé tìm giúp cô nốt Tròn nhé!');
    expect(questionText({ letter: 'C', duration: 'w' })).toBe('Bé ơi, đâu là nốt Đô Tròn?');
    expect(praiseText({ letter: 'C', duration: 'w' })).toBe('Giỏi quá! Đây đúng là nốt Đô Tròn!');
    expect(endText(3)).toContain('ba ngôi sao');
  });
  it('mọi câu hỏi có thể gặp đều nằm trong danh mục thu sẵn', () => {
    const lines = new Set(noteQuizVoiceLines());
    const rnd = seededRandom(2);
    for (const mode of ['pitch', 'duration', 'both'] as const)
      for (const q of makeRound({ ...DEFAULT_QUIZ_SETTINGS, mode, letters: ['C', 'D', 'E', 'F', 'G', 'A', 'B'], durations: ['w', 'h', 'q', '8', '16'], questions: 20 }, rnd)) {
        expect(lines.has(questionText(q))).toBe(true);
        expect(lines.has(praiseText(q))).toBe(true);
      }
  });
});
