import { describe, expect, it } from 'vitest';
import { CURRICULUM } from './content/curriculum';
import { isSupplementLesson, SUPPLEMENT, SUPPLEMENT_GAMES, SUPPLEMENT_LESSONS, SUPPLEMENT_NOTE, SUPPLEMENT_NOTES, SUPPLEMENT_UPCOMING } from './content/supplement';
import { keysMatching, matchesKeyTarget } from './keys';
import { lessonTimeline, pieceToLesson } from './piece';
import { validateCurriculum } from './validate';
import type { ChoiceQuizExercise, Curriculum, Illustration } from './types';

const pictureQuiz = () => SUPPLEMENT_LESSONS[0].exercises.find((e) => e.id === 'picture-quiz') as ChoiceQuizExercise;

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
      expect(l.exercises.map((e) => e.kind)).toEqual(['choice-quiz', 'choice-quiz', 'key-quiz']);
      const quiz = l.exercises.find((e) => e.id === 'picture-quiz') as ChoiceQuizExercise;
      expect(quiz.questions.every((q) => q.optionImages?.length === q.options.length)).toBe(true);
      expect(l.activities[0].pages.some((p) => p.illustration?.type === 'keyboard' && p.illustration.listen?.length)).toBe(true);
      expect(SUPPLEMENT_NOTE[l.lessonId]).toBeDefined();
      expect(SUPPLEMENT_GAMES[l.lessonId]?.length ?? 0).toBeGreaterThanOrEqual(2);
    }
  });

  it('đủ 7 nốt trắng Đô → Si, theo thứ tự, không còn nốt "sắp có"', () => {
    expect(SUPPLEMENT_LESSONS.map((l) => SUPPLEMENT_NOTE[l.lessonId].name)).toEqual(['Đô', 'Rê', 'Mi', 'Pha', 'Sol', 'La', 'Si']);
    expect(SUPPLEMENT_LESSONS.map((l) => l.lessonId)).toEqual(['sup-c', 'sup-d', 'sup-e', 'sup-f', 'sup-g', 'sup-a', 'sup-b']);
    expect(SUPPLEMENT_UPCOMING).toEqual([]);
  });

  it('mọi nốt cùng một khuôn: cùng số trang, cùng loại hình từng trang, cùng bài tập (chỉ khác nốt)', () => {
    const shape = (l: (typeof SUPPLEMENT_LESSONS)[number]) => ({
      pages: l.activities[0].pages.map((p) => [p.illustration?.type, ...(p.moreIllustrations ?? []).map((i) => i.type)]),
      exercises: l.exercises.map((e) => [e.id, e.kind, 'questions' in e ? e.questions.length : 'rounds' in e ? e.rounds.length : 0]),
      games: SUPPLEMENT_GAMES[l.lessonId].map((g) => (g.type === 'lesson' ? g.spec.kind : g.type)),
    });
    const first = shape(SUPPLEMENT_LESSONS[0]);
    for (const l of SUPPLEMENT_LESSONS) expect(shape(l), l.lessonId).toEqual(first);
  });

  describe.each(SUPPLEMENT_NOTES.map((n, i) => [n.name, n, SUPPLEMENT_LESSONS[i]] as const))('bài %s', (name, note, lesson) => {
    const pages = lesson.activities[0].pages;
    const pc = note.midi % 12;
    const NAME: Record<number, string> = { 4: 'Tròn', 2: 'Trắng', 1: 'Đen', 0.5: 'Móc đơn', 0.25: 'Móc đôi' };
    const quiz = (id: string) => lesson.exercises.find((e) => e.id === id) as ChoiceQuizExercise;

    it('trang đầu: khuông trường độ (có tên trường độ dưới từng nốt) + bàn phím, toàn nốt của bài', () => {
      const first = pages[0].illustration;
      if (first?.type !== 'staff' || !first.noteLabels || !first.caption) throw new Error('trang đầu phải có khuông nhạc có tiêu đề');
      const notes = lessonTimeline(pieceToLesson(first.piece, lesson.lessonId));
      expect(notes.every((n) => n.midiNote === note.midi)).toBe(true);
      expect(new Set(notes.map((n) => n.durationBeats))).toEqual(new Set([0.25, 0.5, 1, 2, 4]));
      expect(first.noteLabels).toEqual(notes.map((n) => NAME[n.durationBeats]));
      const kb = pages[0].moreIllustrations?.[0];
      expect(kb?.type === 'keyboard' && kb.caption && kb.highlight).toEqual([note.midi - 12, note.midi, note.midi + 12]);
    });

    it('5 trang giới thiệu từng trường độ (một ô nhịp, phóng to), trang cuối = tổng hợp trường độ', () => {
      const expected: [string, number, number][] = [['tròn', 4, 1], ['trắng', 2, 2], ['đen', 1, 4], ['móc đơn', 0.5, 8], ['móc đôi', 0.25, 16]];
      expected.forEach(([dur, beats, count], i) => {
        const page = pages[i + 1];
        expect(page.title).toBe(`Đây là ${name} ${dur}`);
        const ill = page.illustration;
        if (ill?.type !== 'staff') throw new Error('trang trường độ phải có khuông nhạc');
        expect(ill.listen).toBe(true);
        expect(ill.zoom).toBeGreaterThan(1);
        const notes = lessonTimeline(pieceToLesson(ill.piece, lesson.lessonId));
        expect(notes).toHaveLength(count);
        expect(notes.every((n) => n.midiNote === note.midi && n.durationBeats === beats)).toBe(true);
      });
      expect(pages[pages.length - 1].title).toBe(`Nốt ${name} dài, ngắn khác nhau`);
    });

    it('trang bàn phím: nốt của bài ở mọi quãng tám nằm cạnh đúng nhóm phím đen', () => {
      const page = pages.find((p) => p.title === note.landmark.title)!;
      const ill = page.illustration;
      if (ill?.type !== 'keyboard' || !Array.isArray(ill.highlight)) throw new Error('trang vị trí phải có bàn phím tô phím');
      const whites = ill.highlight.filter((m) => [0, 2, 4, 5, 7, 9, 11].includes(m % 12));
      expect(whites).toEqual([48 + pc, 60 + pc, 72 + pc]);
      expect(ill.highlight.length).toBe(pc <= 4 ? 9 : 12);
    });

    it('trang ngón tay: thế tay có ngón của bài trên đúng phím', () => {
      const page = pages.find((p) => p.title === `Ngón ${note.finger.n} tay phải đánh ${name}`)!;
      const ill = page.illustration;
      if (ill?.type !== 'keyboard') throw new Error('trang ngón phải có bàn phím');
      expect(ill.fingers?.[note.midi]).toBe(note.finger.n);
    });

    it('đố trường độ: 10 câu ngẫu nhiên, mỗi trường độ 2 lần, đáp án đúng', () => {
      const q = lesson.exercises[0] as ChoiceQuizExercise;
      expect(q.id).toBe('duration-quiz');
      expect(q.shuffle).toBe(true);
      expect(q.questions).toHaveLength(10);
      const asked = new Map<string, number>();
      for (const x of q.questions) {
        expect(x.options).toEqual(['Tròn', 'Trắng', 'Đen', 'Móc đơn', 'Móc đôi']);
        if (x.illustration?.type !== 'staff') throw new Error('câu hỏi phải có khuông nhạc');
        const notes = lessonTimeline(pieceToLesson(x.illustration.piece, 'q'));
        expect(notes.every((n) => n.midiNote === note.midi && n.durationBeats === notes[0].durationBeats)).toBe(true);
        const dur = NAME[notes[0].durationBeats];
        expect(x.options[x.answer]).toBe(dur);
        asked.set(dur, (asked.get(dur) ?? 0) + 1);
      }
      expect([...asked.values()]).toEqual([2, 2, 2, 2, 2]);
    });

    it('câu đố chọn hình: đủ 3 dạng hình, nhãn trung tính, đúng MỘT hình là đáp án', () => {
      const q = quiz('picture-quiz');
      expect(new Set(q.questions.flatMap((x) => x.optionImages!.map((i) => i.type)))).toEqual(new Set(['keyboard', 'staff', 'hand']));
      const isNote = (img: Illustration) =>
        img.type === 'keyboard'
          ? Array.isArray(img.highlight) && img.highlight.every((m) => m === note.midi)
          : img.type === 'staff'
            ? lessonTimeline(pieceToLesson(img.piece, 'q')).every((n) => n.midiNote === note.midi)
            : img.type === 'hand' && img.highlight === note.finger.n;
      for (const x of q.questions) {
        expect(x.options.every((o) => /^Hình \d$/.test(o as string))).toBe(true);
        for (const img of x.optionImages!) if (img.type === 'keyboard') expect(img.noLabels).toBe(true);
        x.optionImages!.forEach((img, i) => expect(isNote(img), `${x.prompt as string} — hình ${i + 1}`).toBe(i === x.answer));
      }
    });

    it('luyện phím + trò chơi chỉ tìm nốt của bài', () => {
      const keys = lesson.exercises.find((e) => e.kind === 'key-quiz');
      if (keys?.kind !== 'key-quiz') throw new Error('thiếu bài luyện phím');
      for (const r of keys.rounds) expect(keysMatching(r.target, keys.keyboard.from, keys.keyboard.to).every((m) => m % 12 === pc)).toBe(true);
      for (const g of SUPPLEMENT_GAMES[lesson.lessonId]) {
        if (g.type === 'balloon-hunt') expect(g.letters).toEqual([note.letter]);
        else if (g.spec.kind === 'key-hunt') {
          for (const r of g.spec.rounds) {
            const found = keysMatching(r.target, g.spec.keyboard.from, g.spec.keyboard.to);
            expect(found.length).toBeGreaterThan(0);
            expect(found.every((m) => m % 12 === pc)).toBe(true);
            expect(matchesKeyTarget(r.target, note.midi + 1)).toBe(false);
          }
        } else if ('notes' in g.spec) expect(g.spec.notes).toEqual([note.midi]);
      }
    });
  });

  it('validate báo lỗi khi số hình khác số lựa chọn', () => {
    const quiz = pictureQuiz();
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
