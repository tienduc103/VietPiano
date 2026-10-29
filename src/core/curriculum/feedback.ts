/** Nhận xét cuối buổi: ngắn, vui cho bé (Kids Mode); cụ thể tiêu chí yếu nhất cho người lớn. */
import type { ExerciseScore, LessonScore } from './scoring';
import type { UiMode } from './types';

const ADVICE: Record<string, string> = {
  accuracy: 'Đọc kỹ tên nốt trước khi đánh; bật tên nốt hoặc gợi ý bàn phím nếu cần.',
  pitch: 'Tập lại ở chế độ "Luyện tập → Chờ nốt" cho chắc nốt rồi mới chơi theo nhịp.',
  timing: 'Bật metronome, giảm BPM và đếm to "1 – 2 – 3 – 4" khi chơi.',
  duration: 'Giữ phím đủ số phách của nốt (nốt trắng 2 phách, nốt tròn 4 phách) rồi mới nhấc tay.',
  completion: 'Cố gắng chơi hết bài, đừng dừng giữa chừng — sai cũng cứ chơi tiếp.',
  dynamics: 'Làm rõ mạnh – nhẹ: đoạn "p" đặt ngón nhẹ, đoạn "f" thả sức nặng cánh tay xuống phím; giữ iPad đứng yên một chỗ.',
};

/** Tiêu chí thấp nhất (đo được) trong các bài tập đã làm. */
export function weakestCriterion(scores: readonly ExerciseScore[]): { key: string; value: number } | null {
  let worst: { key: string; value: number } | null = null;
  for (const s of scores) {
    for (const c of s.criteria) {
      if (c.value === null || c.weight === 0) continue;
      if (!worst || c.value < worst.value) worst = { key: c.key, value: c.value };
    }
  }
  return worst;
}

export function lessonFeedback(result: LessonScore, scores: readonly ExerciseScore[], mode: UiMode): string[] {
  const kids = mode === 'kids';
  const lines: string[] = [];
  if (result.passed) {
    lines.push(kids ? 'Tuyệt vời! Con đã hoàn thành buổi học! 🌟' : `Đạt yêu cầu với ${result.score}/100 điểm.`);
    if (!kids && result.score < 95) {
      const weak = weakestCriterion(scores);
      if (weak && weak.value < 0.9) lines.push(`Có thể cải thiện: ${ADVICE[weak.key] ?? ''}`.trim());
    }
    return lines;
  }
  if (!result.allAttempted) {
    lines.push(kids ? 'Còn bài tập chưa làm — mình làm tiếp nhé!' : 'Chưa làm đủ các bài tập của buổi.');
    return lines;
  }
  lines.push(kids ? 'Gần được rồi! Luyện thêm một chút nữa nhé 💪' : `Chưa đạt: ${result.score}/100 điểm.`);
  const weak = weakestCriterion(scores);
  if (weak && ADVICE[weak.key]) lines.push(kids ? ADVICE[weak.key].split(';')[0] : ADVICE[weak.key]);
  return lines;
}
