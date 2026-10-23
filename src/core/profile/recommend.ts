/**
 * Gợi ý bài học theo hồ sơ: nhóm tuổi + mục tiêu + trình độ hiện tại + tiến độ từng bài.
 * Hàm thuần — chấm điểm từng bài rồi lấy các bài điểm cao, tối đa 2 bài mỗi nhóm cho đa dạng.
 */
import type { Lesson, LessonCategory } from '../lessons/types';
import type { LessonProgress } from '../storage/ProgressStorage';
import { MASTERED_ACCURACY, PASS_ACCURACY, type Assessment } from './assessment';
import { ageGroup, type AgeGroup, type LearnerProfile, type LearningGoal } from './LearnerProfile';

export interface Recommendation {
  lesson: Lesson;
  score: number;
  /** Lý do ngắn gọn hiển thị trên thẻ bài. */
  reason: string;
}

/** Mức ưu tiên từng nhóm bài theo lứa tuổi. */
const CATEGORY_WEIGHT: Record<AgeGroup, Record<LessonCategory, number>> = {
  preschool: { kids: 3, notes: 1.5, song: 1, 'right-hand': 0.5, 'left-hand': 0.5, scale: 0.2 },
  child: { kids: 2, notes: 2, song: 2, 'right-hand': 1.5, 'left-hand': 1.5, scale: 1 },
  teen: { kids: 0.3, notes: 2, song: 2.5, 'right-hand': 1.5, 'left-hand': 1.5, scale: 1.5 },
  adult: { kids: 0.2, notes: 2, song: 2.5, 'right-hand': 1.5, 'left-hand': 1.5, scale: 2 },
};

const GOAL_BONUS: Record<LearningGoal, Partial<Record<LessonCategory, number>>> = {
  fun: { song: 1, kids: 0.5 },
  reading: { notes: 1.5 },
  songs: { song: 1.5 },
  technique: { scale: 1, 'right-hand': 1, 'left-hand': 1 },
  'both-hands': { 'left-hand': 1.5, scale: 0.5 },
};

const MAX_PER_CATEGORY = 2;

export function recommendLessons(profile: LearnerProfile, assessment: Assessment, lessons: Lesson[], limit = 6): Recommendation[] {
  const group = ageGroup(profile.age);
  const { progress, skill } = assessment;
  const target = skill.targetDifficulty;
  const isPassed = (p?: LessonProgress) => !!p && p.completions > 0 && p.bestAccuracy >= PASS_ACCURACY;
  const isMastered = (p?: LessonProgress) => !!p && p.completions > 0 && p.bestAccuracy >= MASTERED_ACCURACY;

  // Bài đầu tiên chưa qua trong mỗi nhóm = "bài tiếp theo" theo thứ tự thư viện.
  const nextInCategory = new Map<LessonCategory, string>();
  for (const l of lessons) {
    if (!nextInCategory.has(l.category) && !isPassed(progress[l.id])) nextInCategory.set(l.category, l.id);
  }

  const scored: Recommendation[] = [];
  for (const lesson of lessons) {
    const p = progress[lesson.id];
    if (isMastered(p)) continue;
    // Mầm non chỉ nên chơi bài dễ nhất.
    if (group === 'preschool' && lesson.difficulty > 1) continue;

    const reasons: [number, string][] = [];
    let score = CATEGORY_WEIGHT[group][lesson.category];
    for (const g of profile.goals) {
      const bonus = GOAL_BONUS[g][lesson.category] ?? 0;
      score += bonus;
      if (bonus >= 1) reasons.push([bonus, `Hợp mục tiêu “${GOAL_LABEL_SHORT[g]}”`]);
    }

    const diff = lesson.difficulty - target;
    if (diff === 0) {
      score += 2;
      reasons.push([1.2, 'Vừa sức hiện tại']);
    } else if (diff === -1) {
      score += 0.5;
    } else if (diff === 1) {
      score -= 1;
      if (skill.score >= 40) reasons.push([0.8, 'Thử thách nâng cao']);
    } else {
      score -= 3;
    }

    if (p && p.sessions > 0 && p.completions === 0) {
      score += 2.5;
      reasons.push([3, 'Đang tập dở — chơi tiếp cho hết bài']);
    } else if (p && p.completions > 0) {
      score += 1;
      reasons.push([2.5, `Ôn lại để đạt ≥ ${Math.round(MASTERED_ACCURACY * 100)}% (hiện ${Math.round(p.bestAccuracy * 100)}%)`]);
    } else if (nextInCategory.get(lesson.category) === lesson.id) {
      score += 1.5;
      reasons.push([1.5, 'Bài tiếp theo của nhóm']);
    }

    if (skill.weakerHand && lesson.hand === skill.weakerHand) {
      score += 1;
      reasons.push([2, `Tập thêm tay ${skill.weakerHand === 'left' ? 'trái' : 'phải'}`]);
    }

    reasons.sort((a, b) => b[0] - a[0]);
    scored.push({ lesson, score, reason: reasons[0]?.[1] ?? 'Phù hợp lứa tuổi' });
  }

  scored.sort((a, b) => b.score - a.score);
  const perCategory = new Map<LessonCategory, number>();
  const out: Recommendation[] = [];
  for (const r of scored) {
    const n = perCategory.get(r.lesson.category) ?? 0;
    if (n >= MAX_PER_CATEGORY) continue;
    perCategory.set(r.lesson.category, n + 1);
    out.push(r);
    if (out.length >= limit) break;
  }
  return out;
}

const GOAL_LABEL_SHORT: Record<LearningGoal, string> = {
  fun: 'chơi cho vui',
  reading: 'đọc nốt',
  songs: 'bài hát',
  technique: 'kỹ thuật',
  'both-hands': 'hai tay',
};
