import { describe, expect, it } from 'vitest';
import { CHOICE_COUNTS, CLEF_CHOICES, DEFAULT_QUIZ_SETTINGS, effectiveChoices, QUIZ_MODES, sanitizeQuizSettings, type NoteQuizSettings } from './config';
import { makeQuestion, makeRound, matches, seededRandom, type QuizQuestion } from './questions';
import { clefPitches, LETTERS, QUIZ_DURATIONS, type QuizClef } from './staff';

const settings = (p: Partial<NoteQuizSettings> = {}): NoteQuizSettings => ({ ...DEFAULT_QUIZ_SETTINGS, ...p });

/** Kiểm tra bất biến của một câu. */
function checkQuestion(q: QuizQuestion, s: NoteQuizSettings) {
  // Đúng một ô khớp, và đó là ô `answer`.
  expect(q.options.filter((o) => matches(q, o))).toHaveLength(1);
  expect(matches(q, q.options[q.answer])).toBe(true);
  expect(q.options).toHaveLength(effectiveChoices(s));
  // Mọi ô là hình khác nhau.
  expect(new Set(q.options.map((o) => `${o.midi}/${o.duration}`)).size).toBe(q.options.length);
  // Nốt nằm trong dải của khoá.
  const pitches = clefPitches(q.clef, s.octaves);
  for (const o of q.options) expect(pitches).toContain(o.midi);
  if (s.clef !== 'mixed') expect(q.clef).toBe(s.clef);
  if (q.mode === 'pitch') {
    expect(q.duration).toBeNull();
    expect(s.letters).toContain(q.letter);
    expect(new Set(q.options.map((o) => o.duration)).size).toBe(1);
    expect(new Set(q.options.map((o) => o.letter)).size).toBe(q.options.length);
  }
  if (q.mode === 'duration') {
    expect(q.letter).toBeNull();
    expect(s.durations).toContain(q.duration);
    expect(new Set(q.options.map((o) => o.midi)).size).toBe(1);
    expect(new Set(q.options.map((o) => o.duration)).size).toBe(q.options.length);
  }
  if (q.mode === 'both') {
    expect(s.letters).toContain(q.letter);
    expect(s.durations).toContain(q.duration);
    expect(new Set(q.options.map((o) => `${o.letter}${o.duration}`)).size).toBe(q.options.length);
  }
}

describe('sinh câu hỏi', () => {
  it('mặc định bé 4 tuổi: khoá Sol, Cao độ, 2 ô, Đô–Rê–Mi, 10 câu', () => {
    const s = settings();
    const round = makeRound(s, seededRandom(1));
    expect(round).toHaveLength(10);
    for (const q of round) {
      checkQuestion(q, s);
      expect(q.clef).toBe('treble');
      // 2 ô, cả hai đều thuộc Đô Rê Mi.
      for (const o of q.options) expect(['C', 'D', 'E']).toContain(o.letter);
    }
  });

  it('mọi tổ hợp chế độ × khoá × số ô × phạm vi đều có đúng một đáp án', () => {
    const rnd = seededRandom(42);
    for (const mode of QUIZ_MODES)
      for (const clef of CLEF_CHOICES)
        for (const choices of CHOICE_COUNTS)
          for (const octaves of [1, 2] as const)
            for (const letters of [['C'], ['C', 'D', 'E'], [...LETTERS]] as const)
              for (const durations of [['q'], ['w', 'h', 'q'], [...QUIZ_DURATIONS]] as const) {
                const s = settings({ mode, clef, choices, octaves, letters: [...letters], durations: [...durations] });
                for (let i = 0; i < 4; i++) checkQuestion(makeQuestion(s, rnd), s);
              }
  });

  it('Kết hợp, 4 ô: có ô cùng tên khác trường độ và ô cùng trường độ khác tên', () => {
    const s = settings({ mode: 'both', choices: 4, letters: ['C', 'D', 'E'], durations: ['w', 'h', 'q'] });
    const rnd = seededRandom(7);
    for (let i = 0; i < 50; i++) {
      const q = makeQuestion(s, rnd);
      const others = q.options.filter((_, k) => k !== q.answer);
      expect(others.some((o) => o.letter === q.letter && o.duration !== q.duration)).toBe(true);
      expect(others.some((o) => o.letter !== q.letter && o.duration === q.duration)).toBe(true);
    }
  });

  it('đáp án nhiễu ưu tiên nốt đang học; thiếu thì lấy nốt gần trên khuông', () => {
    const s = settings({ choices: 3, letters: ['C', 'D'] });
    const rnd = seededRandom(3);
    for (let i = 0; i < 30; i++) {
      const q = makeQuestion(s, rnd);
      const letters = q.options.map((o) => o.letter);
      expect(letters).toContain('C');
      expect(letters).toContain('D');
      // Ô thứ ba: nốt liền kề (Mi khi hỏi Rê / Si khi hỏi Đô… — trong dải Đô4–Si4 thì Mi hoặc Rê/Đô gần nhất).
      const extra = letters.find((l) => l !== 'C' && l !== 'D')!;
      expect(['E', 'B']).toContain(extra);
    }
  });

  it('không hỏi y hệt hai câu liền nhau khi còn cách hỏi khác', () => {
    const s = settings({ letters: ['C', 'D', 'E'] });
    const round = makeRound(s, seededRandom(9));
    for (let i = 1; i < round.length; i++) expect(round[i].letter === round[i - 1].letter && round[i].clef === round[i - 1].clef).toBe(false);
  });

  it('hỗn hợp: mỗi câu một khoá, mọi ô cùng khoá, đủ 4 khoá trong nhiều câu', () => {
    const s = settings({ clef: 'mixed', questions: 20 });
    const clefs = new Set<QuizClef>();
    for (const q of makeRound(s, seededRandom(5))) clefs.add(q.clef);
    expect(clefs.size).toBe(4);
  });

  it('trọng số: nốt hay sai được hỏi nhiều hơn', () => {
    const s = settings({ letters: ['C', 'D', 'E'], questions: 20 });
    const share = (weight?: (k: string) => number) => {
      const rnd = seededRandom(11);
      let n = 0;
      for (let i = 0; i < 20; i++) for (const q of makeRound(s, rnd, weight)) if (q.letter === 'D') n++;
      return n / 400;
    };
    // Không trọng số ≈ 1/3; trọng số 4 nhiều hơn rõ (không hỏi lặp liền nhau nên tối đa ≈ 1/2).
    expect(share()).toBeLessThan(0.4);
    expect(share((k) => (k === 'p:treble:D' ? 4 : 1))).toBeGreaterThan(share() + 0.08);
  });

  it('chế độ Trường độ tối đa 5 ô (chỉ có 5 hình trường độ)', () => {
    expect(effectiveChoices({ mode: 'duration', choices: 6 })).toBe(5);
    expect(effectiveChoices({ mode: 'pitch', choices: 6 })).toBe(6);
  });
});

describe('cài đặt', () => {
  it('dữ liệu hỏng → mặc định; danh sách rỗng → mặc định', () => {
    expect(sanitizeQuizSettings(null)).toEqual(DEFAULT_QUIZ_SETTINGS);
    expect(sanitizeQuizSettings({ mode: 'x', clef: 'soprano', choices: 5, letters: [], durations: ['zz'], questions: 7 })).toEqual(DEFAULT_QUIZ_SETTINGS);
    expect(sanitizeQuizSettings({ ...DEFAULT_QUIZ_SETTINGS, clef: 'tenor', letters: ['G', 'C'], octaves: 2 })).toMatchObject({ clef: 'tenor', letters: ['C', 'G'], octaves: 2 });
  });
});
