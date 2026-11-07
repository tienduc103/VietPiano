import { describe, expect, it } from 'vitest';
import { CURRICULUM } from './content/curriculum';
import { DISCOVERY, DISCOVERY_GAMES, DISCOVERY_LESSONS, DISCOVERY_NOTE, DISCOVERY_RANGE, isDiscoveryLesson, ladder, LISTEN_PAIRS, noteName } from './content/discovery';
import { findGuidedLesson, GUIDED_COURSES, guidedCourseOf } from './content/guided';
import { SUPPLEMENT, SUPPLEMENT_LESSONS, SUPPLEMENT_NOTES } from './content/supplement';
import { keysMatching, matchesKeyTarget } from './keys';
import { lessonTimeline, pieceToLesson } from './piece';
import { validateCurriculum, validatePiece } from './validate';
import type { ChoiceQuestion, ChoiceQuizExercise, CurriculumLesson, Illustration, KeyQuizExercise, KeyTarget, Piece } from './types';

const midisOf = (piece: Piece): number[] => lessonTimeline(pieceToLesson(piece, 'test')).flatMap((n) => (n.midiNote === null ? [] : [n.midiNote]));
const byId = (id: string) => DISCOVERY_LESSONS.find((l) => l.lessonId === id)!;
const choiceQuiz = (l: CurriculumLesson, id: string) => l.exercises.find((e) => e.id === id) as ChoiceQuizExercise;
const keyQuiz = (l: CurriculumLesson) => l.exercises.find((e) => e.kind === 'key-quiz') as KeyQuizExercise;
const pages = (l: CurriculumLesson) => l.activities[0].pages;
const pcs = (target: KeyTarget) => new Set(keysMatching(target, 36, 96).map((m) => m % 12));

/** Phím được tô / nốt trên khuông / ngón được tô của một hình. */
function shown(img: Illustration): number[] {
  if (img.type === 'keyboard') return Array.isArray(img.highlight) ? img.highlight : [];
  if (img.type === 'staff') return midisOf(img.piece);
  if (img.type === 'hand') return img.highlight === undefined ? [] : [img.highlight];
  return [];
}

/** Câu đố chọn hình: đúng MỘT hình khớp `expected`, và đó là đáp án. */
function expectOnlyAnswer(q: ChoiceQuestion, expected: number[]) {
  const images = q.optionImages!;
  const matches = images.map((img) => JSON.stringify(shown(img)) === JSON.stringify(expected));
  expect(matches.filter(Boolean), q.prompt as string).toHaveLength(1);
  expect(matches[q.answer], q.prompt as string).toBe(true);
}

const NOTE_LESSONS = SUPPLEMENT_NOTES.map((n, i) => [n.name, n, i, byId(`nd-${n.letter.toLowerCase()}`)] as const);

describe('giáo trình "Khám phá nốt nhạc"', () => {
  it('hợp lệ (đáp án, hình, tầm micro, tiên quyết, giọng nói…)', () => {
    expect(validateCurriculum(DISCOVERY)).toEqual([]);
  });

  it('11 buổi theo thứ tự: bàn phím → Đô … Si → đọc khuông → giai điệu → ôn tập; tiên quyết = buổi trước (chỉ gợi ý)', () => {
    expect(DISCOVERY_LESSONS.map((l) => l.lessonId)).toEqual(['nd-keyboard', 'nd-c', 'nd-d', 'nd-e', 'nd-f', 'nd-g', 'nd-a', 'nd-b', 'nd-staff', 'nd-melody', 'nd-review']);
    DISCOVERY_LESSONS.forEach((l, i) => {
      expect(l.number).toBe(i + 1);
      expect(l.prerequisites).toEqual(i === 0 ? [] : [DISCOVERY_LESSONS[i - 1].lessonId]);
    });
    expect(DISCOVERY.levels[0].weeks.flatMap((w) => w.lessonIds)).toEqual(DISCOVERY_LESSONS.map((l) => l.lessonId));
  });

  it('id riêng (tiền tố "nd-"), không trùng giáo trình chính / bổ sung; LessonPlayer tìm đúng giáo trình', () => {
    const others = new Set([...CURRICULUM.levels, ...SUPPLEMENT.levels].flatMap((l) => l.lessons.map((x) => x.lessonId)));
    for (const l of DISCOVERY_LESSONS) {
      expect(others.has(l.lessonId)).toBe(false);
      expect(isDiscoveryLesson(l.lessonId)).toBe(true);
      expect(guidedCourseOf(l.lessonId)?.id).toBe('discovery');
      expect(findGuidedLesson(l.lessonId)).toBe(l);
    }
    for (const id of others) expect(isDiscoveryLesson(id)).toBe(false);
    expect(guidedCourseOf('sup-c')?.id).toBe('supplement');
    expect(findGuidedLesson('sup-c')).toBe(SUPPLEMENT_LESSONS[0]);
    expect(guidedCourseOf('l1-01-keyboard')).toBeUndefined();
    expect(GUIDED_COURSES.map((c) => c.home)).toEqual(['supplement', 'note-discovery']);
  });

  it('cùng phương pháp "Làm quen từng nốt": giới thiệu có tiếng đàn ở MỌI trang, bài tập sai thì làm lại, trò chơi để bé tự chọn', () => {
    for (const l of DISCOVERY_LESSONS) {
      expect(l.activities.map((a) => a.kind)).toEqual(['intro']);
      for (const p of pages(l)) {
        const ills = [p.illustration, ...(p.moreIllustrations ?? [])];
        expect(ills.some((ill) => (ill?.type === 'keyboard' && !!ill.listen?.length) || (ill?.type === 'staff' && ill.listen)), `${l.lessonId}: ${p.title as string}`).toBe(true);
      }
      for (const e of l.exercises) {
        if (e.kind === 'choice-quiz' || e.kind === 'key-quiz') expect(e.retry, `${l.lessonId}/${e.id}`).toBe(true);
      }
      expect(DISCOVERY_GAMES[l.lessonId]?.length ?? 0, l.lessonId).toBeGreaterThanOrEqual(2);
    }
  });

  it('không dạy trường độ (đã có ở "Làm quen từng nốt"): không đố trường độ, không thẻ so sánh, không chữ trường độ dưới nốt', () => {
    for (const l of DISCOVERY_LESSONS) {
      expect(l.exercises.some((e) => e.id === 'duration-quiz')).toBe(false);
      for (const p of pages(l)) {
        for (const ill of [p.illustration, ...(p.moreIllustrations ?? [])]) {
          expect(ill?.type).not.toBe('note-values');
          if (ill?.type === 'staff') expect(ill.noteLabels).toBeUndefined();
        }
      }
    }
  });

  it('câu đố chọn hình: nhãn trung tính "Hình n", phím không ghi tên, câu đố nhìn khuông không ghi tên nốt', () => {
    for (const l of DISCOVERY_LESSONS) {
      for (const e of l.exercises) {
        if (e.kind !== 'choice-quiz') continue;
        for (const q of e.questions) {
          if (q.illustration?.type === 'staff') expect(q.illustration.hideNames, `${l.lessonId}: ${q.prompt as string}`).toBe(true);
          if (q.illustration?.type === 'keyboard') expect(q.illustration.highlight, 'bài nghe không tô phím (lộ đáp án)').toBeUndefined();
          if (!q.optionImages) continue;
          expect(q.options.every((o) => /^Hình \d$/.test(o as string))).toBe(true);
          for (const img of q.optionImages) if (img.type === 'keyboard') expect(img.noLabels).toBe(true);
        }
      }
    }
  });

  it('mọi buổi nốt cùng một khuôn (chỉ khác nốt); Đô — nốt đầu tiên — không có trang "và các nốt đã học"', () => {
    const shape = (l: CurriculumLesson) => ({
      pages: pages(l).map((p) => [p.illustration?.type, ...(p.moreIllustrations ?? []).map((i) => i.type)]),
      exercises: l.exercises.map((e) => [e.id, e.kind, 'questions' in e ? e.questions.length : 'rounds' in e ? e.rounds.length : 0]),
      games: DISCOVERY_GAMES[l.lessonId].map((g) => (g.type === 'lesson' ? g.spec.kind : g.type)),
    });
    const [, , , first] = NOTE_LESSONS[1];
    for (const [, , i, l] of NOTE_LESSONS.slice(1)) expect(shape(l), `buổi ${i + 2}`).toEqual(shape(first));
    const c = shape(NOTE_LESSONS[0][3]);
    const ref = shape(first);
    expect(c.pages).toEqual(ref.pages.slice(0, -1));
    expect(c.exercises).toEqual(ref.exercises);
    expect(c.games).toEqual(ref.games);
  });

  describe.each(NOTE_LESSONS)('buổi nốt %s', (name, note, index, lesson) => {
    const learned = SUPPLEMENT_NOTES.slice(0, index);
    const family = [...learned, note];
    const familyPcs = new Set(family.map((x) => x.midi % 12));
    const prev = learned[learned.length - 1];
    const older = learned[learned.length - 2] ?? prev;

    it('giới thiệu: khuông + bàn phím 3 quãng tám, vị trí theo nhóm phím đen, khuông, ngón, nốt thấp / giữa / cao', () => {
      const [first, landmark, staff, fingerPage, octaves] = pages(lesson);
      expect(first.title).toBe(`Đây là nốt ${name}`);
      if (first.illustration?.type !== 'staff') throw new Error('trang đầu phải có khuông nhạc');
      expect(midisOf(first.illustration.piece)).toEqual([note.midi]);
      const kb = first.moreIllustrations?.[0];
      if (kb?.type !== 'keyboard') throw new Error('trang đầu phải có bàn phím');
      expect(kb.highlight).toEqual([note.midi - 12, note.midi, note.midi + 12]);
      expect(kb.listen).toEqual([note.midi]);
      expect(landmark.title).toBe(note.landmark.title);
      if (staff.illustration?.type !== 'staff') throw new Error('trang khuông phải có khuông');
      expect(new Set(midisOf(staff.illustration.piece))).toEqual(new Set([note.midi]));
      // Phóng to để thấy rõ nốt so với dòng kẻ; khung phóng to cắt mất chữ dưới nốt nên tên phải ở chú thích.
      expect(staff.illustration).toMatchObject({ zoom: 2, hideNames: true, caption: `Nốt ${name} giữa` });
      if (fingerPage.illustration?.type !== 'keyboard') throw new Error('trang ngón phải có bàn phím');
      expect(fingerPage.illustration.fingers?.[note.midi]).toBe(note.finger.n);
      // Thế tay mới (thế Sol): câu cho bé phải nhắc chuyển ngón cái, không thì La ngón 2 trùng Rê ngón 2 mà không có lời giải thích.
      if (note.finger.position === 'G') expect(fingerPage.kids).toContain('Ngón cái chuyển sang bạn Sol');
      else expect(fingerPage.kids).not.toContain('chuyển sang');
      if (octaves.illustration?.type !== 'keyboard') throw new Error('trang quãng tám phải có bàn phím');
      expect(octaves.illustration.listen).toEqual([note.midi - 12, note.midi, note.midi + 12]);
    });

    it('trang "và các nốt đã học": bậc thang từ thấp lên cao, kết ở nốt mới (trừ Đô)', () => {
      expect(pages(lesson)).toHaveLength(prev ? 6 : 5);
      if (!prev) return;
      const page = pages(lesson)[5];
      expect(page.title).toBe(`${name} và các nốt đã học`);
      if (page.illustration?.type !== 'staff') throw new Error('phải có khuông bậc thang');
      expect(midisOf(page.illustration.piece)).toEqual(family.map((x) => x.midi));
      const kb = page.moreIllustrations?.[0];
      expect(kb?.type === 'keyboard' && kb.highlight).toEqual(family.map((x) => x.midi));
    });

    it('câu đố chọn hình: 4 câu về nốt mới + 2 câu ôn (nốt cũ đặt cạnh nốt mới để phân biệt), đáp án đúng', () => {
      const q = choiceQuiz(lesson, 'picture-quiz').questions;
      expect(q).toHaveLength(6);
      expectOnlyAnswer(q[0], [note.midi]);
      expectOnlyAnswer(q[1], [note.midi]);
      expectOnlyAnswer(q[2], [note.midi]);
      expectOnlyAnswer(q[3], [note.finger.n]);
      if (prev) {
        expectOnlyAnswer(q[4], [prev.midi]);
        expectOnlyAnswer(q[5], [older.midi]);
        // Nốt mới là một đáp án nhiễu của cả hai câu ôn.
        for (const x of [q[4], q[5]]) expect(x.optionImages!.some((img) => JSON.stringify(shown(img)) === JSON.stringify([note.midi]))).toBe(true);
      } else {
        expectOnlyAnswer(q[4], [61, 63]);
        expectOnlyAnswer(q[5], [66, 68, 70]);
      }
      // Đáp án không đứng cùng một chỗ ở mọi câu.
      expect(new Set(q.map((x) => x.answer)).size).toBeGreaterThan(1);
    });

    it('luyện phím: nốt mới xen nốt cũ, đủ nốt giữa / thấp / cao, chỉ nhận nốt của buổi', () => {
      const k = keyQuiz(lesson);
      expect(k.rounds).toHaveLength(6);
      expect(k.rounds[0].target).toEqual({ type: 'midi', midi: note.midi });
      const targets = k.rounds.map((r) => r.target);
      expect(targets).toContainEqual({ type: 'midi', midi: note.midi - 12 });
      expect(targets).toContainEqual({ type: 'midi', midi: note.midi + 12 });
      for (const r of k.rounds) expect(keysMatching(r.target, k.keyboard.from, k.keyboard.to).length, r.prompt as string).toBeGreaterThan(0);
      const review = [k.rounds[1], k.rounds[3]];
      if (prev) {
        for (const r of review) {
          expect(r.target.type === 'midi' || r.target.type === 'pitch-class').toBe(true);
          for (const pc of pcs(r.target)) expect(familyPcs.has(pc) && pc !== note.midi % 12, r.prompt as string).toBe(true);
        }
        expect(review[0].target).toEqual({ type: 'midi', midi: prev.midi });
        // Ôn cách quãng: lượt thứ hai hỏi nốt cách 3 buổi (buổi đầu chưa đủ nốt thì nốt gần hơn), bất kỳ quãng tám.
        expect(review[1].target).toEqual({ type: 'pitch-class', pc: (learned[index - 3] ?? older).midi % 12 });
      } else {
        expect(review.map((r) => r.target)).toEqual([
          { type: 'black-group', size: 2 },
          { type: 'black-group', size: 3 },
        ]);
      }
      for (const r of k.rounds.filter((_, i) => i !== 1 && i !== 3)) for (const pc of pcs(r.target)) expect(pc).toBe(note.midi % 12);
    });

    it('trò chơi: Bóng bay tìm nốt mới, Săn phím + Bắn bóng trên khuông dùng nốt mới và nốt đã học', () => {
      const games = DISCOVERY_GAMES[lesson.lessonId];
      expect(games[0]).toEqual({ type: 'balloon-hunt', letters: [note.letter] });
      for (const g of games) {
        if (g.type !== 'lesson') continue;
        if (g.spec.kind === 'key-hunt') {
          const spec = g.spec;
          for (const r of spec.rounds) {
            expect(keysMatching(r.target, spec.keyboard.from, spec.keyboard.to).length).toBeGreaterThan(0);
            for (const pc of pcs(r.target)) expect(familyPcs.has(pc), r.prompt as string).toBe(true);
          }
          for (const x of learned.slice(-3)) expect(spec.rounds.some((r) => matchesKeyTarget(r.target, x.midi))).toBe(true);
        } else if (g.spec.kind === 'staff-shoot') {
          expect(g.spec.notes).toEqual(family.map((x) => x.midi));
        }
      }
    });
  });

  it('ôn cách quãng: mỗi nốt được hỏi lại ở cả 3 buổi kế tiếp trong phần bắt buộc (câu đố + luyện phím)', () => {
    /** Các nốt cũ (lớp cao độ) mà phần bắt buộc của buổi hỏi tới — bỏ nốt mới của buổi. */
    const reviewed = (i: number) => {
      const lesson = NOTE_LESSONS[i][3];
      const own = SUPPLEMENT_NOTES[i].midi % 12;
      const quiz = choiceQuiz(lesson, 'picture-quiz').questions.flatMap((q) => shown(q.optionImages![q.answer]).filter((m) => m > 5).map((m) => m % 12));
      const keys = keyQuiz(lesson).rounds.flatMap((r) => [...pcs(r.target)]);
      return new Set([...quiz, ...keys].filter((pc) => pc !== own));
    };
    SUPPLEMENT_NOTES.forEach((note, i) => {
      for (let later = i + 1; later <= Math.min(i + 3, SUPPLEMENT_NOTES.length - 1); later++) {
        expect(reviewed(later).has(note.midi % 12), `${note.name} ở buổi ${SUPPLEMENT_NOTES[later].name}`).toBe(true);
      }
    });
  });

  it('buổi bàn phím: câu đố phím đen / trắng / nhóm phím đen đúng, nhóm không bị cắt ở mép bàn phím nhỏ', () => {
    const l = byId('nd-keyboard');
    const q = choiceQuiz(l, 'picture-quiz').questions;
    expectOnlyAnswer(q[0], [66]);
    expectOnlyAnswer(q[1], [65]);
    expectOnlyAnswer(q[2], [61, 63]);
    expectOnlyAnswer(q[3], [66, 68, 70]);
    expectOnlyAnswer(q[4], [61]);
    expectOnlyAnswer(q[5], [68]);
    // Phím đen tô sáng trong câu đố nằm trong nhóm thấy trọn (C#4 D#4 / F#4 G#4 A#4).
    for (const x of q) for (const img of x.optionImages!) for (const m of shown(img)) if ([1, 3, 6, 8, 10].includes(m % 12)) expect([61, 63, 66, 68, 70]).toContain(m);
    for (const r of keyQuiz(l).rounds) expect(['black', 'white', 'black-group']).toContain(r.target.type);
  });

  it('buổi bàn phím: đố nghe cao / thấp — đáp án đúng, quãng rộng → hẹp, có cả đi lên và đi xuống', () => {
    const q = choiceQuiz(byId('nd-keyboard'), 'listen-quiz').questions;
    expect(q).toHaveLength(LISTEN_PAIRS.length);
    q.forEach((x, i) => {
      const [a, b] = LISTEN_PAIRS[i];
      expect(x.illustration?.type === 'keyboard' && x.illustration.listen).toEqual([a, b]);
      expect(x.options[x.answer]).toBe(b > a ? 'Cao hơn' : 'Thấp hơn');
    });
    const gaps = LISTEN_PAIRS.map(([a, b]) => Math.abs(b - a));
    expect([...gaps].sort((a, b) => b - a)).toEqual(gaps);
    expect(new Set(LISTEN_PAIRS.map(([a, b]) => b > a)).size).toBe(2);
  });

  it('buổi đọc khuông: trang dạy dòng / khe đúng vị trí nốt, khuông phóng to, chú thích đúng tên nốt', () => {
    const [clef, lines, spaces] = pages(byId('nd-staff'));
    const pageNotes = (p: typeof clef) => (p.illustration?.type === 'staff' ? midisOf(p.illustration.piece) : []);
    // Khoá Sol quy ước dòng 2 = G4.
    expect(pageNotes(clef)).toEqual([67]);
    // Trên dòng: dòng kẻ phụ dưới khuông (C4), dòng 1 (E4), dòng 2 (G4), dòng 3 (B4).
    expect(pageNotes(lines)).toEqual([60, 64, 67, 71]);
    // Dưới dòng 1 (D4), khe 1 (F4), khe 2 (A4), khe 3 (C5).
    expect(pageNotes(spaces)).toEqual([62, 65, 69, 72]);
    for (const [p, caption] of [
      [clef, 'Nốt Sol trên dòng 2'],
      [lines, 'Đô – Mi – Sol – Si'],
      [spaces, 'Rê – Pha – La – Đô cao'],
    ] as const) {
      expect(p.illustration).toMatchObject({ zoom: 2, hideNames: true, caption });
    }
    // Rê không nằm trong khe: câu cho bé phải tách riêng Rê.
    expect(spaces.kids).toContain('Rê treo sát dưới dòng kẻ');
    expect(spaces.kids).not.toMatch(/Rê, Pha/);
  });

  it('buổi đọc khuông: câu đố tên → khuông và khuông → phím đúng; đọc – đánh đủ 8 nốt Đô giữa → Đô cao', () => {
    const l = byId('nd-staff');
    const q = choiceQuiz(l, 'picture-quiz').questions;
    for (const x of q) {
      if (x.illustration?.type === 'staff') expectOnlyAnswer(x, midisOf(x.illustration.piece));
      else expectOnlyAnswer(x, [{ Sol: 67, 'Đô cao': 72, Rê: 62 }[(x.prompt as string).replace('Khuông nào có nốt ', '').replace('?', '')]!]);
    }
    expect(q.filter((x) => x.illustration).length).toBe(3);
    const reading = l.exercises.find((e) => e.kind === 'note-reading');
    if (reading?.kind !== 'note-reading') throw new Error('thiếu bài đọc nốt');
    expect(reading.answer).toBe('play');
    expect(reading.sequence.map((p) => midisOf({ notation: `${p}/w`, clef: 'treble', hand: 'right', bpm: 60 })[0]).sort((a, b) => a - b)).toEqual(DISCOVERY_RANGE);
  });

  it('buổi giai điệu: toàn Wait Mode, chỉ nốt Đô giữa → Đô cao, nốt nào cũng có số ngón; bài dân gian ghi nguồn', () => {
    const l = byId('nd-melody');
    expect(l.exercises.length).toBeGreaterThanOrEqual(3);
    for (const e of l.exercises) {
      if (e.kind !== 'play') throw new Error('buổi giai điệu chỉ có bài chơi theo khuông');
      expect(e.mode).toBe('wait');
      const notes = pieceToLesson(e.piece, e.id).notes.filter((n) => !n.rest);
      for (const n of notes) {
        expect(DISCOVERY_RANGE, `${e.id}: ${n.pitch}`).toContain(n.midi);
        expect(n.finger, `${e.id}: ${n.pitch}`).toBeDefined();
      }
      expect(e.piece.source).toBeTruthy();
    }
  });

  it('buổi ôn tập: đủ 7 tên nốt khi tìm phím, đủ 8 nốt Đô giữa → Đô cao trong câu đố và đọc – đánh; câu đố xáo thứ tự', () => {
    const l = byId('nd-review');
    expect(new Set(keyQuiz(l).rounds.flatMap((r) => [...pcs(r.target)]))).toEqual(new Set([0, 2, 4, 5, 7, 9, 11]));
    const q = choiceQuiz(l, 'picture-quiz');
    expect(q.shuffle).toBe(true);
    const asked = q.questions.map((x) => shown(x.optionImages![x.answer])[0]).sort((a, b) => a - b);
    expect(asked).toEqual(DISCOVERY_RANGE);
    const reading = l.exercises.find((e) => e.kind === 'note-reading');
    if (reading?.kind !== 'note-reading') throw new Error('thiếu bài đọc nốt');
    expect(new Set(reading.sequence)).toEqual(new Set(['C4', 'D4', 'E4', 'F4', 'G4', 'A4', 'B4', 'C5']));
    expect(l.assessment.checkpoint).toBe(true);
  });

  it('thẻ nốt của danh sách buổi: đủ 7 nốt trắng', () => {
    expect(Object.values(DISCOVERY_NOTE).map((n) => n.name)).toEqual(['Đô', 'Rê', 'Mi', 'Pha', 'Sol', 'La', 'Si']);
  });
});

describe('hàm dựng của "Khám phá nốt nhạc"', () => {
  it('noteName: quãng 3 / 4 / 5 = thấp / giữa / cao; chỉ phím trắng', () => {
    expect(noteName(60)).toBe('Đô giữa');
    expect(noteName(72)).toBe('Đô cao');
    expect(noteName(52)).toBe('Mi thấp');
    expect(noteName(65)).toBe('Pha giữa');
    expect(() => noteName(61)).toThrow();
    expect(() => noteName(84)).toThrow();
  });

  it('ladder: 1–8 nốt thành ô nhịp 4/4 đủ phách, giữ đúng thứ tự nốt', () => {
    for (let n = 1; n <= 8; n++) {
      const notes = DISCOVERY_RANGE.slice(0, n);
      const piece = ladder(notes);
      expect(validatePiece(piece, `ladder ${n}`)).toEqual([]);
      expect(midisOf(piece)).toEqual(notes);
    }
  });
});
