/**
 * Đánh giá người học từ lịch sử phiên luyện tập (hàm thuần, không phụ thuộc thời gian thực).
 *  - Thời gian học: tổng, 7 ngày gần nhất so với mục tiêu, số ngày tập, chuỗi ngày liên tiếp.
 *  - Khả năng chơi: điểm 0–100 từ trình độ khai báo + bài đã hoàn thành (theo độ khó) + độ chính xác.
 *  - Tiêu chí khác: đều đặn, độ chính xác gần đây, tiến bộ, đọc nốt, cân bằng hai tay, hoàn thành bài,
 *    độ phủ kỹ năng, độ dài buổi tập.
 */
import type { Lesson, LessonCategory } from '../lessons/types';
import { applySession, emptyProgress, type LessonProgress, type PracticeSession } from '../storage/ProgressStorage';
import { ageGroup, recommendedDailyMinutes, type Experience, type LearnerProfile } from './LearnerProfile';

const DAY_MS = 86_400_000;
/** Độ chính xác tối thiểu để coi một bài là đã "qua". */
export const PASS_ACCURACY = 0.8;
/** Độ chính xác để coi một bài là đã thuộc (không cần gợi ý lại). */
export const MASTERED_ACCURACY = 0.9;

export type CriterionKey = 'regularity' | 'weeklyGoal' | 'accuracy' | 'improvement' | 'reading' | 'hands' | 'completion' | 'coverage' | 'sessionLength';

export interface Criterion {
  key: CriterionKey;
  label: string;
  /** 0–100; null = chưa đủ dữ liệu để đánh giá. */
  score: number | null;
  detail: string;
  /** Lời khuyên khi điểm còn thấp. */
  tip?: string;
}

export type SkillLevel = 'Mới bắt đầu' | 'Cơ bản' | 'Khá' | 'Vững';

export interface Assessment {
  time: {
    totalMs: number;
    sessions: number;
    activeDays: number;
    streakDays: number;
    last7DaysMs: number;
    weeklyGoalMs: number;
    avgSessionMs: number;
  };
  skill: {
    score: number;
    level: SkillLevel;
    /** Độ khó bài nên tập lúc này (1–3). */
    targetDifficulty: 1 | 2 | 3;
    accuracy: number | null;
    recentAccuracy: number | null;
    lessonsPassed: number;
    hardestPassed: 0 | 1 | 2 | 3;
    /** Tay tập ít hẳn so với tay kia (< 40% số nốt đúng); null nếu cân bằng hoặc chưa đủ dữ liệu. */
    weakerHand: 'left' | 'right' | null;
  };
  criteria: Criterion[];
  /** Tiến độ từng bài của riêng người học này. */
  progress: Record<string, LessonProgress>;
}

const EXPERIENCE_BASE: Record<Experience, number> = { new: 0, beginner: 15, basic: 35, intermediate: 55 };

/** Số ngày (theo lịch địa phương) — dùng để đếm ngày tập và chuỗi liên tiếp. */
export function dayIndex(epochMs: number, tzOffsetMin = new Date(epochMs).getTimezoneOffset()): number {
  return Math.floor((epochMs - tzOffsetMin * 60_000) / DAY_MS);
}

export function skillLevel(score: number): SkillLevel {
  if (score < 20) return 'Mới bắt đầu';
  if (score < 45) return 'Cơ bản';
  if (score < 70) return 'Khá';
  return 'Vững';
}

const ratio = (a: number, b: number) => (b > 0 ? a / b : null);
const clamp100 = (x: number) => Math.round(Math.max(0, Math.min(100, x)));
const pct = (x: number) => `${Math.round(x * 100)}%`;

function accuracyOf(list: PracticeSession[]): number | null {
  const c = list.reduce((a, s) => a + s.correct, 0);
  const w = list.reduce((a, s) => a + s.wrong, 0);
  return c + w >= 10 ? c / (c + w) : null;
}

export function assessLearner(
  profile: LearnerProfile,
  sessions: PracticeSession[],
  lessons: Lesson[],
  now: number,
  tzOffsetMin = new Date(now).getTimezoneOffset(),
): Assessment {
  const sorted = [...sessions].sort((a, b) => a.startedAt - b.startedAt);
  const lessonById = new Map(lessons.map((l) => [l.id, l]));
  const progress: Record<string, LessonProgress> = {};
  for (const s of sorted) progress[s.lessonId] = applySession(progress[s.lessonId] ?? emptyProgress(s.lessonId), s);

  // ── Thời gian ──────────────────────────────────────────────
  const totalMs = sorted.reduce((a, s) => a + s.durationMs, 0);
  const today = dayIndex(now, tzOffsetMin);
  const days = new Set(sorted.map((s) => dayIndex(s.startedAt, tzOffsetMin)));
  let streak = 0;
  // Chuỗi vẫn giữ nếu hôm nay chưa tập nhưng hôm qua có tập.
  for (let d = days.has(today) ? today : today - 1; days.has(d); d--) streak++;
  const last7DaysMs = sorted.filter((s) => dayIndex(s.startedAt, tzOffsetMin) > today - 7).reduce((a, s) => a + s.durationMs, 0);
  const activeLast14 = [...days].filter((d) => d > today - 14).length;
  const weeklyGoalMs = profile.dailyMinutes * 7 * 60_000;
  const avgSessionMs = sorted.length ? totalMs / sorted.length : 0;

  // ── Khả năng chơi ──────────────────────────────────────────
  const passed = Object.values(progress).filter((p) => p.completions > 0 && p.bestAccuracy >= PASS_ACCURACY);
  const difficultyPoints = passed.reduce((a, p) => a + (lessonById.get(p.lessonId)?.difficulty ?? 1), 0);
  const hardestPassed = passed.reduce<number>((m, p) => Math.max(m, lessonById.get(p.lessonId)?.difficulty ?? 1), 0) as 0 | 1 | 2 | 3;
  const accuracy = accuracyOf(sorted);
  const recent = sorted.slice(-10);
  const earlier = sorted.slice(-20, -10);
  const recentAccuracy = accuracyOf(recent);
  const earlierAccuracy = accuracyOf(earlier);
  // Độ chính xác thấp kéo điểm xuống tối đa 30%; chưa đủ dữ liệu thì giữ nguyên.
  const accFactor = recentAccuracy === null ? 1 : 0.7 + 0.3 * Math.min(1, recentAccuracy / MASTERED_ACCURACY);
  const score = clamp100(Math.min(100, EXPERIENCE_BASE[profile.experience] + Math.min(45, difficultyPoints * 3)) * accFactor);
  const targetDifficulty: 1 | 2 | 3 = score < 25 ? 1 : score < 55 ? 2 : 3;

  // ── Tiêu chí khác ──────────────────────────────────────────
  const criteria: Criterion[] = [];
  const hasData = sorted.length > 0;

  criteria.push({
    key: 'regularity',
    label: 'Đều đặn',
    score: hasData ? clamp100((activeLast14 / 10) * 100) : null,
    detail: `${activeLast14}/14 ngày gần đây có tập · chuỗi ${streak} ngày`,
    tip: activeLast14 < 7 ? 'Tập ngắn mỗi ngày hiệu quả hơn tập dồn một buổi dài.' : undefined,
  });

  const goalRatio = last7DaysMs / weeklyGoalMs;
  criteria.push({
    key: 'weeklyGoal',
    label: 'Mục tiêu tuần',
    score: hasData ? clamp100(goalRatio * 100) : null,
    detail: `${Math.round(last7DaysMs / 60_000)}/${profile.dailyMinutes * 7} phút trong 7 ngày`,
    tip: goalRatio < 0.6 ? `Cố gắng tập khoảng ${profile.dailyMinutes} phút mỗi ngày.` : undefined,
  });

  criteria.push({
    key: 'accuracy',
    label: 'Độ chính xác',
    score: recentAccuracy === null ? null : clamp100((recentAccuracy / MASTERED_ACCURACY) * 100),
    detail: recentAccuracy === null ? 'Cần thêm vài lượt tập' : `${pct(recentAccuracy)} nốt đúng (10 phiên gần nhất)`,
    tip: recentAccuracy !== null && recentAccuracy < PASS_ACCURACY ? 'Chậm lại, nhìn nốt kỹ trước khi đánh; dùng chế độ Chờ.' : undefined,
  });

  const delta = recentAccuracy !== null && earlierAccuracy !== null ? recentAccuracy - earlierAccuracy : null;
  criteria.push({
    key: 'improvement',
    label: 'Tiến bộ',
    score: delta === null ? null : clamp100(50 + delta * 250),
    detail:
      delta === null
        ? 'Cần khoảng 20 phiên để so sánh'
        : `${delta >= 0 ? '+' : ''}${Math.round(delta * 100)} điểm % so với 10 phiên trước`,
    tip: delta !== null && delta < -0.05 ? 'Độ chính xác đang giảm — quay lại bài dễ hơn một chút.' : undefined,
  });

  const byCategory = (cats: LessonCategory[]) => sorted.filter((s) => cats.includes(lessonById.get(s.lessonId)?.category as LessonCategory));
  const readingAcc = accuracyOf(byCategory(['notes']));
  criteria.push({
    key: 'reading',
    label: 'Đọc nốt',
    score: readingAcc === null ? null : clamp100((readingAcc / MASTERED_ACCURACY) * 100),
    detail: readingAcc === null ? 'Chưa tập nhóm “Nhận biết nốt”' : `${pct(readingAcc)} đúng ở bài nhận biết nốt`,
    tip: readingAcc === null || readingAcc < PASS_ACCURACY ? 'Tập bài “Nhận biết nốt” và tắt tên nốt để tự đọc.' : undefined,
  });

  const correctByHand = { left: 0, right: 0 };
  for (const s of sorted) {
    // Bài hai tay không tính vào tay nào.
    const hand = lessonById.get(s.lessonId)?.hand;
    if (hand === 'left' || hand === 'right') correctByHand[hand] += s.correct;
  }
  const handMax = Math.max(correctByHand.left, correctByHand.right);
  const weakerHand: 'left' | 'right' | null =
    handMax >= 20 && Math.min(correctByHand.left, correctByHand.right) / handMax < 0.4 ? (correctByHand.left < correctByHand.right ? 'left' : 'right') : null;
  criteria.push({
    key: 'hands',
    label: 'Cân bằng hai tay',
    score: handMax >= 20 ? clamp100((Math.min(correctByHand.left, correctByHand.right) / handMax) * 200) : null,
    detail: handMax >= 20 ? `Tay phải ${correctByHand.right} · tay trái ${correctByHand.left} nốt đúng` : 'Cần thêm dữ liệu',
    tip: weakerHand ? `Tập thêm bài tay ${weakerHand === 'left' ? 'trái' : 'phải'}.` : undefined,
  });

  const completionRate = ratio(sorted.filter((s) => s.completed).length, sorted.length);
  criteria.push({
    key: 'completion',
    label: 'Kiên trì hết bài',
    score: completionRate === null ? null : clamp100(completionRate * 100),
    detail: completionRate === null ? 'Chưa có phiên tập' : `${pct(completionRate)} phiên chơi đến hết bài`,
    tip: completionRate !== null && completionRate < 0.5 ? 'Chọn bài ngắn hơn để chơi trọn vẹn rồi mới tăng độ khó.' : undefined,
  });

  const group = ageGroup(profile.age);
  const relevant: LessonCategory[] =
    group === 'preschool' ? ['notes', 'kids', 'song'] : group === 'child' ? ['notes', 'kids', 'right-hand', 'left-hand', 'song'] : ['notes', 'scale', 'right-hand', 'left-hand', 'song'];
  const coveredCats = new Set(passed.map((p) => lessonById.get(p.lessonId)?.category));
  const covered = relevant.filter((c) => coveredCats.has(c)).length;
  criteria.push({
    key: 'coverage',
    label: 'Độ phủ kỹ năng',
    score: hasData ? clamp100((covered / relevant.length) * 100) : null,
    detail: `Đã qua ${covered}/${relevant.length} nhóm bài phù hợp lứa tuổi`,
    tip: covered < relevant.length ? 'Thử bài ở nhóm chưa tập để kỹ năng đều hơn.' : undefined,
  });

  // Buổi tập quá ngắn → chưa vào nhịp; quá dài với trẻ nhỏ → mất tập trung.
  const idealMin = recommendedDailyMinutes(profile.age);
  const avgMin = avgSessionMs / 60_000;
  const lengthScore = avgMin <= idealMin ? (avgMin / idealMin) * 100 : 100 - ((avgMin - 2 * idealMin) / idealMin) * 100;
  criteria.push({
    key: 'sessionLength',
    label: 'Độ dài buổi tập',
    score: hasData ? clamp100(Math.min(100, lengthScore)) : null,
    detail: hasData ? `Trung bình ${avgMin < 1 ? '< 1' : Math.round(avgMin)} phút/phiên (nên ~${idealMin} phút)` : `Nên khoảng ${idealMin} phút/buổi`,
    tip: hasData && avgMin < idealMin / 2 ? 'Tập liền vài bài trong một buổi để tay quen hơn.' : hasData && avgMin > idealMin * 2.5 ? 'Nghỉ giải lao giữa buổi để giữ tập trung.' : undefined,
  });

  return {
    time: { totalMs, sessions: sorted.length, activeDays: days.size, streakDays: streak, last7DaysMs, weeklyGoalMs, avgSessionMs },
    skill: { score, level: skillLevel(score), targetDifficulty, accuracy, recentAccuracy, lessonsPassed: passed.length, hardestPassed, weakerHand },
    criteria,
    progress,
  };
}
