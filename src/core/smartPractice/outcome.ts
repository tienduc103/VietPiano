/**
 * Đánh giá hiệu quả luyện bổ trợ (đặc tả §14, §22 bước 9–10): bài bổ trợ đã ổn định chưa, đoạn đó trong bài gốc có bớt lỗi không,
 * và nên làm gì tiếp (luyện tiếp / chậm lại / mở rộng đoạn / quay về bài gốc). Thuần, tất định.
 */
import type { ScoreReference, ScoringResult } from '../coach/types';
import { passageErrorRate } from './passages';
import { isPassed } from './tempo';
import type { RemedialExercise, RemedialOutcome } from './types';

/** Bài bổ trợ đạt khi điểm cao hơn mức đạt thường (đoạn ngắn nên đòi hỏi chắc hơn). */
export const REMEDIAL_PASS_SCORE = 85;

export function evaluateRemedialOutcome(
  remedial: Pick<RemedialExercise, 'startGroup' | 'endGroup' | 'variant'>,
  remedialResults: readonly ScoringResult[],
  sourceReference: ScoreReference,
  sourceResults: readonly ScoringResult[],
): RemedialOutcome {
  const rem = [...remedialResults].sort((a, b) => a.createdAt - b.createdAt);
  const passes = rem.map((r) => isPassed(r, REMEDIAL_PASS_SCORE));
  const passed = passes.filter(Boolean).length;
  const stable = passes.length >= 2 && passes[passes.length - 1] && passes[passes.length - 2];
  const firstAt = rem[0]?.createdAt ?? Infinity;
  const lastAt = rem[rem.length - 1]?.createdAt ?? Infinity;
  const before = passageErrorRate(sourceReference, sourceResults.filter((r) => r.createdAt < firstAt), remedial.startGroup, remedial.endGroup);
  const after = passageErrorRate(sourceReference, sourceResults.filter((r) => r.createdAt > lastAt), remedial.startGroup, remedial.endGroup);
  const verdict: RemedialOutcome['verdict'] = !before || !after ? 'not-enough-data' : after.rate <= before.rate - 0.25 || after.rate === 0 ? 'improved' : 'no-change';

  let next: RemedialOutcome['next'];
  let reason: string;
  const lastTwoFail = passes.length >= 2 && !passes[passes.length - 1] && !passes[passes.length - 2];
  if (!rem.length) {
    next = 'keep-practicing';
    reason = 'Chưa luyện bài bổ trợ này.';
  } else if (stable && remedial.variant < 2) {
    next = 'extend';
    reason = 'Đã chơi chắc đoạn ngắn 2 lượt liên tiếp — mở rộng thêm một nốt.';
  } else if (stable) {
    next = 'return-to-source';
    reason = 'Đã chơi chắc đoạn này 2 lượt liên tiếp — quay lại bài gốc.';
  } else if (lastTwoFail) {
    next = 'slower';
    reason = 'Hai lượt gần nhất chưa đạt — giảm tốc độ và chơi thật đều.';
  } else {
    next = 'keep-practicing';
    reason = `Cần ${REMEDIAL_PASS_SCORE} điểm trở lên 2 lượt liên tiếp (đã đạt ${passed}/${rem.length} lượt).`;
  }
  return {
    remedialAttempts: rem.length,
    remedialPassed: passed,
    stable,
    errorRateBefore: before ? Math.round(before.rate * 100) / 100 : null,
    errorRateAfter: after ? Math.round(after.rate * 100) / 100 : null,
    verdict,
    next,
    reason,
  };
}
