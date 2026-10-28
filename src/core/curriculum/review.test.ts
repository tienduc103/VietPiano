import { describe, expect, it } from 'vitest';
import { seeded } from '../games/random';
import { CURRICULUM } from './content/curriculum';
import { applyGameResult, applyReview, emptyRecord, sanitizeRecord } from './progress';
import { buildReview, missedReadingNotes, REVIEW_PREFIX } from './review';
import { findLesson } from './unlock';

const lesson = (id: string) => findLesson(CURRICULUM, id)!;

describe('buildReview', () => {
  it('tối đa 3 bài, ưu tiên bài điểm thấp, giữ thứ tự gốc; không tính điểm buổi', () => {
    const l = lesson('l1-05-week1-test');
    const best = Object.fromEntries(l.exercises.map((e, i) => [e.id, i === 0 ? 40 : 100]));
    const review = buildReview(l, { random: seeded(1), maxExercises: 1, bestScores: best });
    expect(review.map((e) => e.id)).toEqual([REVIEW_PREFIX + l.exercises[0].id]);
    for (const e of buildReview(l, { random: seeded(1) })) {
      expect(e).toMatchObject({ weight: 0, required: false });
      expect(e.id.startsWith(REVIEW_PREFIX)).toBe(true);
    }
  });

  it('tìm phím: thử lại tới khi đúng, đủ lượt tối thiểu, cùng các yêu cầu của bài gốc', () => {
    const l = lesson('l1-02-find-c');
    const src = l.exercises.find((e) => e.kind === 'key-quiz')!;
    const ex = buildReview(l, { random: seeded(3) }).find((e) => e.id === REVIEW_PREFIX + src.id)!;
    if (ex.kind !== 'key-quiz' || src.kind !== 'key-quiz') throw new Error('sai loại');
    expect(ex.retry).toBe(true);
    expect(ex.rounds.length).toBeGreaterThanOrEqual(6);
    expect(new Set(ex.rounds.map((r) => r.prompt))).toEqual(new Set(src.rounds.map((r) => r.prompt)));
  });

  it('đọc nốt: nốt hay nhầm được hỏi thêm (tối đa 2 lần mỗi nốt)', () => {
    const l = lesson('l1-06-staff');
    const src = l.exercises.find((e) => e.kind === 'note-reading')!;
    if (src.kind !== 'note-reading') throw new Error('sai loại');
    const ex = buildReview(l, { random: seeded(5), mistakes: { 'note:F4>E4': 5, 'note:A4>G4': 1, 'ask:x': 3 } }).find((e) => e.kind === 'note-reading')!;
    if (ex.kind !== 'note-reading') throw new Error('sai loại');
    const count = (seq: string[], p: string) => seq.filter((x) => x === p).length;
    expect(count(ex.sequence, 'F4')).toBe(count(src.sequence, 'F4') + 2);
    expect(count(ex.sequence, 'E4')).toBe(count(src.sequence, 'E4'));
    expect(ex.sequence).not.toContain('A4'); // không có trong bài gốc
  });

  it('chơi theo khuông: biểu diễn → Wait Mode, tiết tấu giữ nguyên', () => {
    const l = lesson('l1-11-quarter');
    const modes = buildReview(l, { random: seeded(1), maxExercises: 9 }).flatMap((e) => (e.kind === 'play' ? [e.mode] : []));
    expect(modes).toEqual(['rhythm', 'wait']);
  });

  it('mọi buổi đều sinh được phần luyện tập', () => {
    for (const level of CURRICULUM.levels) for (const l of level.lessons) expect(buildReview(l).length, l.lessonId).toBeGreaterThan(0);
  });
});

it('missedReadingNotes', () => {
  expect(missedReadingNotes({ 'note:E4>F4': 2, 'note:E4>G4': 1, 'miss:C4': 4 })).toEqual(new Map([['E4', 3]]));
});

describe('tiến độ luyện tập / trò chơi', () => {
  it('ghi lần luyện tập và điểm trò chơi cao nhất, không đổi trạng thái đạt của buổi', () => {
    const l = lesson('l1-01-keyboard');
    let rec = emptyRecord('p', l);
    rec = applyReview(rec, 60_000, 5);
    rec = applyGameResult(rec, { score: 900, stars: 2 }, 30_000, 6);
    rec = applyGameResult(rec, { score: 500, stars: 3 }, 30_000, 7);
    expect(rec).toMatchObject({ reviewCount: 1, gamePlays: 2, gameBestScore: 900, gameBestStars: 3, practiceMs: 120_000, passed: false, lastPracticedAt: 7 });
    expect(rec.exercises).toEqual({});
  });

  it('bản ghi cũ (chưa có trường mới) đọc lại về 0', () => {
    const { reviewCount, gamePlays, gameBestScore, gameBestStars, ...old } = emptyRecord('p', lesson('l1-01-keyboard'));
    void [reviewCount, gamePlays, gameBestScore, gameBestStars];
    expect(sanitizeRecord(old)).toMatchObject({ reviewCount: 0, gamePlays: 0, gameBestScore: 0, gameBestStars: 0 });
  });
});
