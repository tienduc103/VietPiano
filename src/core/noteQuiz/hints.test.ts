import { describe, expect, it } from 'vitest';
import { nameToMidi } from '../music/notes';
import { DEFAULT_QUIZ_SETTINGS, type NoteQuizSettings } from './config';
import { DURATION_SHAPE, nextHint, pitchCoarse, pitchExact, wrongCause, type HintConfig, type HintContext } from './hints';
import { NoteQuizRound } from './NoteQuizRound';
import { makeQuestion, seededRandom, similarQuestion, type QuizQuestion } from './questions';
import { emptyStats, practiceFor, preferFor, recordQuestion, supportFor } from './tracker';
import { noteQuizVoiceLines } from './voice';
import { splitSentences } from '../voice/catalog';

const m = (n: string) => nameToMidi(n)!;
const CONFIG: HintConfig = { smartHints: true, hintAfter: 1, maxSupport: false };

/** Kết hợp: hỏi Đô Tròn (ô 0). */
const bothQ = (): QuizQuestion => ({
  mode: 'both',
  clef: 'treble',
  letter: 'C',
  duration: 'w',
  answer: 0,
  options: [
    { midi: 60, letter: 'C', duration: 'w' },
    { midi: 60, letter: 'C', duration: 'h' },
    { midi: 62, letter: 'D', duration: 'w' },
    { midi: 64, letter: 'E', duration: 'q' },
  ],
});
const ctx = (q: QuizQuestion, wrongIndexes: number[], p: Partial<HintContext> = {}): HintContext => ({
  q,
  wrongIndexes,
  eliminated: [],
  previousLevel: 0,
  config: CONFIG,
  support: 'normal',
  prefer: 'pitch',
  ...p,
});

describe('vị trí trong gợi ý theo đúng khoá đang hỏi', () => {
  it('cùng nốt Đô4, mỗi khoá một vị trí', () => {
    expect(pitchExact(m('C4'), 'treble')).toBe('Ở khoá Sol, nốt Đô nằm trên dòng kẻ phụ thứ 1 dưới khuông.');
    expect(pitchExact(m('C4'), 'bass')).toBe('Ở khoá Fa, nốt Đô nằm trên dòng kẻ phụ thứ 1 trên khuông.');
    expect(pitchExact(m('C4'), 'alto')).toBe('Ở khoá Đô Alto, nốt Đô nằm trên dòng kẻ thứ 3.');
    expect(pitchExact(m('C4'), 'tenor')).toBe('Ở khoá Đô Tenor, nốt Đô nằm trên dòng kẻ thứ 4.');
    expect(pitchExact(m('C3'), 'bass')).toBe('Ở khoá Fa, nốt Đô nằm ở khe thứ 2.');
  });
  it('gợi ý thô: trên dòng / trong khe / ngoài khuông', () => {
    expect(pitchCoarse(m('E4'), 'treble')).toBe('Nốt Mi nằm trên một dòng kẻ.');
    expect(pitchCoarse(m('F4'), 'treble')).toBe('Nốt Fa nằm trong một khe.');
    expect(pitchCoarse(m('C4'), 'treble')).toBe('Nốt Đô nằm phía dưới khuông nhạc.');
    expect(pitchCoarse(m('C4'), 'bass')).toBe('Nốt Đô nằm phía trên khuông nhạc.');
  });
  it('hình dáng trường độ đúng nhạc lý', () => {
    expect(DURATION_SHAPE.w).toBe('Nốt Tròn có hình bầu dục rỗng và không có thân.');
    expect(DURATION_SHAPE['16']).toContain('hai móc');
  });
});

describe('phân tích nguyên nhân sai', () => {
  it('đúng tên sai trường độ / đúng trường độ sai tên / sai cả hai', () => {
    const q = bothQ();
    expect(wrongCause(q, q.options[1])).toBe('duration');
    expect(wrongCause(q, q.options[2])).toBe('pitch');
    expect(wrongCause(q, q.options[3])).toBe('both');
    expect(nextHint(ctx(q, [1])).text).toMatch(/^Bé tìm đúng nốt Đô rồi! Nhưng cô đang hỏi nốt Đô Tròn cơ\. Nốt Tròn có hình bầu dục rỗng/);
    expect(nextHint(ctx(q, [2])).text).toMatch(/^Bé nhận ra nốt Tròn rồi! Bây giờ mình tìm đúng vị trí nốt Đô nhé\. Nốt Đô nằm phía dưới khuông nhạc\./);
  });
  it('sai cả hai: gợi ý phần bé hay nhầm hơn trước', () => {
    const q = bothQ();
    expect(nextHint(ctx(q, [3], { prefer: 'pitch' })).text).toContain('Nốt Đô nằm phía dưới khuông');
    expect(nextHint(ctx(q, [3], { prefer: 'duration' })).text).toContain(DURATION_SHAPE.w);
    // preferFor đọc thống kê.
    let s = emptyStats();
    for (let i = 0; i < 3; i++) s = recordQuestion(s, q, { wrongPicks: [q.options[1]] });
    expect(preferFor(s, ['p:treble:C', 'd:w'])).toBe('duration');
  });
});

describe('gợi ý tăng dần', () => {
  it('lần sai đầu không lộ đáp án: không đánh dấu, không cất ô, không minh hoạ', () => {
    const rnd = seededRandom(4);
    for (const mode of ['pitch', 'duration', 'both'] as const)
      for (let i = 0; i < 30; i++) {
        const q = makeQuestion({ ...DEFAULT_QUIZ_SETTINGS, mode, choices: 4, clef: 'mixed', letters: ['C', 'D', 'E', 'F', 'G'] }, rnd);
        const wrong = q.options.findIndex((_, k) => k !== q.answer);
        const h = nextHint(ctx(q, [wrong]));
        expect(h).toMatchObject({ level: 1, reveal: false, eliminated: [], staff: null, sample: null });
      }
  });
  it('mỗi lần sai sau cụ thể hơn: bậc tăng dần, câu khác câu trước; cất ô luôn chừa ≥ 1 ô sai', () => {
    const rnd = seededRandom(8);
    for (let n = 0; n < 40; n++) {
      const q = makeQuestion({ ...DEFAULT_QUIZ_SETTINGS, mode: 'both', choices: 6, clef: 'mixed', letters: ['C', 'D', 'E', 'F', 'G', 'A', 'B'], durations: ['w', 'h', 'q', '8', '16'] }, rnd);
      const r = new NoteQuizRound([q], CONFIG);
      r.start();
      let prev = r.getState().hint;
      for (let k = 0; k < 6 && r.getState().status === 'asking'; k++) {
        const s = r.getState();
        const pick = q.options.findIndex((_, i) => i !== q.answer && !s.wrongIndexes.includes(i) && !s.hint?.eliminated.includes(i));
        if (pick < 0) break;
        r.answer(pick, k);
        const h = r.getState().hint!;
        if (prev) {
          // Bậc chỉ tăng; chỉ được đứng yên ở bậc 3 (cất thêm ô) hoặc bậc 4 (đã chỉ đáp án).
          expect(h.level).toBeGreaterThanOrEqual(prev.level);
          if (h.level === prev.level) expect(h.level).toBeGreaterThanOrEqual(3);
          if (h.level === 3 && prev.level === 3) expect(h.eliminated.length).toBeGreaterThan(prev.eliminated.length);
        }
        const active = q.options.map((_, i) => i).filter((i) => i !== q.answer && !r.getState().wrongIndexes.includes(i) && !h.eliminated.includes(i));
        if (!h.reveal && h.eliminated.length > 0) expect(active.length).toBeGreaterThanOrEqual(1);
        expect(h.eliminated).not.toContain(q.answer);
        prev = h;
      }
    }
  });
  it('bậc 2: minh hoạ đúng khoá + bậc của nốt cần tìm; hình mẫu trường độ', () => {
    const q = { ...bothQ(), clef: 'bass' as const, options: bothQ().options.map((o) => ({ ...o, midi: o.midi - 12 })) };
    const h = nextHint(ctx(q, [1, 2], { previousLevel: 1 }));
    expect(h.level).toBe(2);
    expect(h.staff).toEqual({ clef: 'bass', step: 3 });
    expect(h.sample).toBe('w');
    // Kết hợp: lần lượt cao độ rồi trường độ.
    expect(h.text.indexOf('Ở khoá Fa, nốt Đô nằm ở khe thứ 2.')).toBeLessThan(h.text.indexOf(DURATION_SHAPE.w));
  });
  it('gợi ý sau 2 lần sai; hỗ trợ tối đa / bé hay nhầm → minh hoạ ngay; bé đã vững → gợi ý muộn hơn', () => {
    const q = bothQ();
    expect(nextHint(ctx(q, [1], { config: { ...CONFIG, hintAfter: 2 } })).level).toBe(0);
    expect(nextHint(ctx(q, [1, 2], { config: { ...CONFIG, hintAfter: 2 } })).level).toBe(1);
    expect(nextHint(ctx(q, [1], { config: { ...CONFIG, maxSupport: true } })).level).toBe(2);
    expect(nextHint(ctx(q, [1], { support: 'simple' })).level).toBe(2);
    expect(nextHint(ctx(q, [1], { support: 'reduced' })).level).toBe(0);
    expect(nextHint(ctx(q, [1, 2], { support: 'reduced' })).level).toBe(1);
  });
});

describe('cá nhân hoá', () => {
  const q = bothQ();
  it('hay nhầm → simple; đúng ngay ≥ 3 câu liền → reduced', () => {
    let s = emptyStats();
    expect(supportFor(s, ['p:treble:C'])).toBe('normal');
    for (let i = 0; i < 3; i++) s = recordQuestion(s, q, { wrongPicks: [q.options[2]], hintLevel: 1 });
    expect(supportFor(s, ['p:treble:C'])).toBe('simple');
    expect(s.items['p:treble:C'].helped).toBe(3);
    let t = emptyStats();
    for (let i = 0; i < 3; i++) t = recordQuestion(t, q, { wrongPicks: [] });
    expect(supportFor(t, ['p:treble:C', 'd:w'])).toBe('reduced');
    expect(t.totals).toEqual({ attempts: 3, pitchErrors: 0, durationErrors: 0, helped: 0, revealed: 0 });
  });
  it('ghi số lần thử, loại lỗi, mức hỗ trợ', () => {
    const s = recordQuestion(emptyStats(), q, { wrongPicks: [q.options[1], q.options[3]], hintLevel: 2, revealed: false });
    expect(s.totals).toEqual({ attempts: 3, pitchErrors: 1, durationErrors: 2, helped: 1, revealed: 0 });
  });
  it('bài luyện riêng: phần hay nhầm + phần hay nhầm sang, cùng khoá', () => {
    const base: NoteQuizSettings = { ...DEFAULT_QUIZ_SETTINGS };
    expect(practiceFor({ key: 'p:bass:D', confusedKey: 'p:bass:E' }, base)).toMatchObject({ mode: 'pitch', clef: 'bass', letters: ['D', 'E'], choices: 2, maxSupport: true });
    expect(practiceFor({ key: 'd:h', confusedKey: null }, base)).toMatchObject({ mode: 'duration', durations: ['w', 'h'] });
  });
  it('câu tương tự: cùng khoá + cùng yêu cầu', () => {
    const rnd = seededRandom(3);
    const s = { ...DEFAULT_QUIZ_SETTINGS, mode: 'both' as const, choices: 4 as const, letters: ['C', 'D', 'E'] as NoteQuizSettings['letters'] };
    for (let i = 0; i < 20; i++) {
      const q0 = makeQuestion(s, rnd);
      const q1 = similarQuestion(q0, s, rnd);
      expect([q1.clef, q1.letter, q1.duration]).toEqual([q0.clef, q0.letter, q0.duration]);
      expect(q1.options.filter((o) => o.letter === q1.letter && o.duration === q1.duration)).toHaveLength(1);
    }
  });
});

describe('giọng cô giáo', () => {
  it('mọi câu gợi ý có thể gặp đều có trong danh mục thu sẵn', () => {
    const lines = new Set(noteQuizVoiceLines().flatMap(splitSentences));
    const rnd = seededRandom(12);
    for (const mode of ['pitch', 'duration', 'both'] as const)
      for (const octaves of [1, 2] as const)
        for (let n = 0; n < 40; n++) {
          const q = makeQuestion({ ...DEFAULT_QUIZ_SETTINGS, mode, octaves, clef: 'mixed', choices: 6, letters: ['C', 'D', 'E', 'F', 'G', 'A', 'B'], durations: ['w', 'h', 'q', '8', '16'] }, rnd);
          const r = new NoteQuizRound([q], CONFIG);
          r.start();
          for (let k = 0; k < 6 && r.getState().status === 'asking'; k++) {
            const s = r.getState();
            const pick = q.options.findIndex((_, i) => i !== q.answer && !s.wrongIndexes.includes(i) && !s.hint?.eliminated.includes(i));
            if (pick < 0) break;
            r.answer(pick, k);
            for (const sentence of splitSentences(r.getState().hint!.text)) expect(lines.has(sentence), sentence).toBe(true);
          }
        }
  });
});
