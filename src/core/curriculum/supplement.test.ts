import { describe, expect, it } from 'vitest';
import { CURRICULUM } from './content/curriculum';
import { isSupplementLesson, SUPPLEMENT, SUPPLEMENT_GAMES, SUPPLEMENT_LESSONS, SUPPLEMENT_NOTE } from './content/supplement';
import { keysMatching, matchesKeyTarget } from './keys';
import { lessonTimeline, pieceToLesson } from './piece';
import { validateCurriculum } from './validate';
import type { ChoiceQuizExercise, Curriculum, Illustration } from './types';

describe('giáo trình bổ sung "Làm quen từng nốt"', () => {
  it('hợp lệ (đáp án, hình, tầm micro, giọng nói…)', () => {
    expect(validateCurriculum(SUPPLEMENT)).toEqual([]);
  });

  it('không trùng id với giáo trình chính, id có tiền tố "sup-"', () => {
    const main = new Set(CURRICULUM.levels.flatMap((l) => l.lessons.map((x) => x.lessonId)));
    for (const l of SUPPLEMENT_LESSONS) {
      expect(main.has(l.lessonId)).toBe(false);
      expect(isSupplementLesson(l.lessonId)).toBe(true);
    }
    for (const id of main) expect(isSupplementLesson(id)).toBe(false);
  });

  it('mỗi buổi theo khuôn: giới thiệu → câu đố chọn hình → luyện phím, có thẻ nốt + ≥ 2 trò để chọn', () => {
    for (const l of SUPPLEMENT_LESSONS) {
      expect(l.activities.map((a) => a.kind)).toEqual(['intro']);
      expect(l.exercises.map((e) => e.kind)).toEqual(['choice-quiz', 'key-quiz']);
      const quiz = l.exercises[0] as ChoiceQuizExercise;
      expect(quiz.questions.every((q) => q.optionImages?.length === q.options.length)).toBe(true);
      expect(l.activities[0].pages.some((p) => p.illustration?.type === 'keyboard' && p.illustration.listen?.length)).toBe(true);
      expect(SUPPLEMENT_NOTE[l.lessonId]).toBeDefined();
      expect(SUPPLEMENT_GAMES[l.lessonId]?.length ?? 0).toBeGreaterThanOrEqual(2);
    }
  });

  it('bài Đô: phần giới thiệu có khuông nhạc với nốt Đô ở nhiều trường độ (tròn, trắng, đen, móc đơn)', () => {
    const pages = SUPPLEMENT_LESSONS[0].activities[0].pages;
    const durations = new Set<number>();
    for (const p of pages) {
      if (p.illustration?.type !== 'staff') continue;
      const notes = lessonTimeline(pieceToLesson(p.illustration.piece, 'sup-c'));
      if (notes.every((n) => n.midiNote === 60)) notes.forEach((n) => durations.add(n.durationBeats));
    }
    expect([...durations].sort((a, b) => a - b)).toEqual([0.5, 1, 2, 4]);
  });

  it('bài Đô: câu đố có đủ 3 dạng hình (phím, khuông, ngón tay); thẻ phím không hiện tên nốt', () => {
    const quiz = SUPPLEMENT_LESSONS[0].exercises[0] as ChoiceQuizExercise;
    const types = new Set(quiz.questions.flatMap((q) => q.optionImages!.map((i) => i.type)));
    expect(types).toEqual(new Set(['keyboard', 'staff', 'hand']));
    for (const q of quiz.questions) {
      for (const img of q.optionImages!) if (img.type === 'keyboard') expect(img.noLabels).toBe(true);
      // Nhãn trung tính: không lộ đáp án.
      expect(q.options.every((o) => /^Hình \d$/.test(o as string))).toBe(true);
    }
  });

  it('bài Đô: đáp án đúng là hình có nốt Đô / ngón 1', () => {
    const quiz = SUPPLEMENT_LESSONS[0].exercises[0] as ChoiceQuizExercise;
    const isC = (img: Illustration) =>
      img.type === 'keyboard' ? Array.isArray(img.highlight) && img.highlight.every((m) => m % 12 === 0) : img.type === 'staff' ? img.piece.notation.startsWith('C4') : img.type === 'hand' && img.highlight === 1;
    for (const q of quiz.questions) {
      q.optionImages!.forEach((img, i) => expect(isC(img), `${q.prompt as string} — hình ${i + 1}`).toBe(i === q.answer));
    }
  });

  it('trò chơi bài Đô chỉ tìm nốt Đô', () => {
    for (const g of SUPPLEMENT_GAMES['sup-c']) {
      if (g.type === 'balloon-hunt') expect(g.letters).toEqual(['C']);
      else if (g.spec.kind === 'key-hunt') {
        for (const r of g.spec.rounds) {
          const keys = keysMatching(r.target, g.spec.keyboard.from, g.spec.keyboard.to);
          expect(keys.length).toBeGreaterThan(0);
          expect(keys.every((m) => m % 12 === 0)).toBe(true);
          expect(matchesKeyTarget(r.target, 62)).toBe(false);
        }
      } else if ('notes' in g.spec) expect(g.spec.notes.every((m) => m % 12 === 0)).toBe(true);
    }
  });

  it('validate báo lỗi khi số hình khác số lựa chọn', () => {
    const quiz = SUPPLEMENT_LESSONS[0].exercises[0] as ChoiceQuizExercise;
    const broken: Curriculum = {
      ...SUPPLEMENT,
      levels: [
        {
          ...SUPPLEMENT.levels[0],
          lessons: [{ ...SUPPLEMENT_LESSONS[0], exercises: [{ ...quiz, questions: [{ ...quiz.questions[0], optionImages: quiz.questions[0].optionImages!.slice(1) }] }] }],
        },
      ],
    };
    expect(validateCurriculum(broken).join('\n')).toMatch(/hình cho 3 lựa chọn/);
  });
});
