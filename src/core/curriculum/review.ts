/**
 * Phần Luyện tập sau buổi học: tự sinh từ chính các bài tập của buổi (không soạn tay cho từng buổi).
 *  - Chọn tối đa `maxExercises` bài yếu nhất (điểm cao nhất thấp nhất; chưa làm = 0), giữ thứ tự gốc.
 *  - Tìm phím / trắc nghiệm / đọc nốt: trộn lại thứ tự lượt, tìm phím được thử lại tới khi đúng.
 *  - Đọc nốt: nốt hay nhầm (lỗi "note:E4>F4" trong tiến độ) được hỏi thêm.
 *  - Chơi theo khuông: Biểu diễn → Wait Mode (tập chậm, chắc nốt); Tiết tấu giữ nguyên.
 *  - Ôn cộng dồn: thêm MỘT bài ngắn (≤ `CUMULATIVE_ROUNDS` lượt) từ các buổi đã học gần đây — bài tìm phím / đọc nốt /
 *    trắc nghiệm yếu nhất — đặt đầu tiên như bài khởi động (vd Buổi 4 ôn lại nốt Đô của Buổi 2).
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
  /** Các buổi đã học trước buổi này (theo thứ tự học) — nguồn cho bài ôn cộng dồn. */
  earlier?: readonly EarlierLesson[];
}

export interface EarlierLesson {
  lesson: CurriculumLesson;
  bestScores: Readonly<Record<string, number>>;
  mistakes: Readonly<Record<string, number>>;
}

export const REVIEW_PREFIX = 'review-';
export const CUMULATIVE_PREFIX = 'review-cum-';
/** Số lượt của bài ôn cộng dồn. */
export const CUMULATIVE_ROUNDS = 4;
/** Chỉ ôn lại từ chừng này buổi đã học gần nhất. */
const CUMULATIVE_LOOKBACK = 4;
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

/** Bài ngắn ôn lại buổi cũ: bài yếu nhất (đã làm) trong các buổi gần nhất; ưu tiên buổi gần hơn khi bằng điểm. */
export function cumulativeExercise(earlier: readonly EarlierLesson[], random: Random = Math.random): Exercise | null {
  const recent = earlier.slice(-CUMULATIVE_LOOKBACK);
  const candidates = recent.flatMap((e, order) =>
    e.lesson.exercises
      .filter((ex) => ex.kind !== 'play' && e.bestScores[ex.id] !== undefined)
      .map((ex) => ({ e, ex, order, best: e.bestScores[ex.id] })),
  );
  if (candidates.length === 0) return null;
  const { e, ex } = candidates.sort((a, b) => a.best - b.best || b.order - a.order)[0];
  const r = reviewExercise(ex, random, missedReadingNotes(e.mistakes));
  const base = { id: `${CUMULATIVE_PREFIX}${e.lesson.lessonId}-${ex.id}`, title: `Ôn lại buổi ${e.lesson.number}: ${text(ex.title)}` };
  switch (r.kind) {
    case 'key-quiz':
      return { ...r, ...base, rounds: r.rounds.slice(0, CUMULATIVE_ROUNDS) };
    case 'choice-quiz':
      return { ...r, ...base, questions: r.questions.slice(0, CUMULATIVE_ROUNDS) };
    case 'note-reading': {
      // Giữ nốt hay nhầm trong số lượt được cắt bớt.
      const missed = [...new Set(r.sequence.filter((p) => missedReadingNotes(e.mistakes).has(p)))];
      const rest = r.sequence.filter((p) => !missed.includes(p));
      return { ...r, ...base, sequence: shuffle([...missed, ...rest].slice(0, CUMULATIVE_ROUNDS), random) };
    }
    case 'play':
      return null;
  }
}

export function buildReview(lesson: CurriculumLesson, opts: ReviewOptions = {}): Exercise[] {
  const { random = Math.random, maxExercises = 3, bestScores = {}, mistakes = {}, earlier = [] } = opts;
  const picked = lesson.exercises
    .map((ex, order) => ({ ex, order, best: bestScores[ex.id] ?? 0 }))
    .sort((a, b) => a.best - b.best || a.order - b.order)
    .slice(0, maxExercises)
    .sort((a, b) => a.order - b.order);
  const missed = missedReadingNotes(mistakes);
  const cumulative = cumulativeExercise(earlier, random);
  return [...(cumulative ? [cumulative] : []), ...picked.map(({ ex }) => reviewExercise(ex, random, missed))];
}
