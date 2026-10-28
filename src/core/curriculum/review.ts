/**
 * Phần Luyện tập sau buổi học: tự sinh từ chính các bài tập của buổi (không soạn tay cho từng buổi).
 *  - Chọn tối đa `maxExercises` bài yếu nhất (điểm cao nhất thấp nhất; chưa làm = 0), giữ thứ tự gốc.
 *  - Tìm phím / trắc nghiệm / đọc nốt: trộn lại thứ tự lượt, tìm phím được thử lại tới khi đúng.
 *  - Đọc nốt: nốt hay nhầm (lỗi "note:E4>F4" trong tiến độ) được hỏi thêm.
 *  - Chơi theo khuông: Biểu diễn → Wait Mode (tập chậm, chắc nốt); Tiết tấu giữ nguyên.
 * Mọi bài ôn có `weight: 0`, `required: false` và id riêng — không ảnh hưởng điểm / trạng thái đạt của buổi.
 */
import { shuffle, type Random } from '../games/random';
import { text, type CurriculumLesson, type Exercise } from './types';

export interface ReviewOptions {
  random?: Random;
  maxExercises?: number;
  /** Điểm cao nhất từng bài tập của buổi (theo id). */
  bestScores?: Readonly<Record<string, number>>;
  /** Lỗi hay gặp của buổi (khoá như `note:E4>F4`). */
  mistakes?: Readonly<Record<string, number>>;
}

export const REVIEW_PREFIX = 'review-';
/** Số lượt tối thiểu của bài tìm phím khi ôn (bài gốc ít lượt thì lặp lại). */
const MIN_KEY_ROUNDS = 6;
/** Mỗi nốt hay nhầm được hỏi thêm tối đa chừng này lần. */
const MAX_EXTRA_PER_NOTE = 2;

/** Nốt cần đọc bị nhầm trong tiến độ → số lần. */
export function missedReadingNotes(mistakes: Readonly<Record<string, number>> = {}): Map<string, number> {
  const out = new Map<string, number>();
  for (const [key, n] of Object.entries(mistakes)) {
    const m = /^note:([^>]+)>/.exec(key);
    if (m) out.set(m[1], (out.get(m[1]) ?? 0) + n);
  }
  return out;
}

function reviewExercise(ex: Exercise, random: Random, missed: Map<string, number>): Exercise {
  const base = { id: REVIEW_PREFIX + ex.id, title: `Ôn: ${text(ex.title)}`, required: false, weight: 0, pass: {} };
  switch (ex.kind) {
    case 'key-quiz': {
      let rounds = ex.rounds.slice();
      while (rounds.length < MIN_KEY_ROUNDS) rounds = rounds.concat(ex.rounds);
      return { ...ex, ...base, rounds: shuffle(rounds, random), retry: true };
    }
    case 'choice-quiz':
      return { ...ex, ...base, questions: shuffle(ex.questions, random) };
    case 'note-reading': {
      const extra: string[] = [];
      for (const pitch of new Set(ex.sequence)) {
        const n = Math.min(MAX_EXTRA_PER_NOTE, missed.get(pitch) ?? 0);
        for (let i = 0; i < n; i++) extra.push(pitch);
      }
      return { ...ex, ...base, sequence: shuffle([...ex.sequence, ...extra], random) };
    }
    case 'play':
      return { ...ex, ...base, mode: ex.mode === 'rhythm' ? 'rhythm' : 'wait' };
  }
}

export function buildReview(lesson: CurriculumLesson, opts: ReviewOptions = {}): Exercise[] {
  const { random = Math.random, maxExercises = 3, bestScores = {}, mistakes = {} } = opts;
  const picked = lesson.exercises
    .map((ex, order) => ({ ex, order, best: bestScores[ex.id] ?? 0 }))
    .sort((a, b) => a.best - b.best || a.order - b.order)
    .slice(0, maxExercises)
    .sort((a, b) => a.order - b.order);
  const missed = missedReadingNotes(mistakes);
  return picked.map(({ ex }) => reviewExercise(ex, random, missed));
}
