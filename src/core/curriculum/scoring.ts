/**
 * Chấm điểm theo rubric riêng từng loại bài tập (0–100) và gộp thành điểm buổi học.
 *
 *  theory / keyboard / recognition : % lượt đúng ngay lần đầu.
 *  wait        : 90% độ chính xác nốt + 10% hoàn thành. KHÔNG có tiêu chí nhịp (Wait Mode không tính thời gian).
 *  performance : đúng nốt 45% + đúng nhịp 30% + đúng trường độ 15% + hoàn thành 10%
 *                (+ mạnh – nhẹ 15% khi bản nhạc có dấu sắc thái; bàn phím ảo không có lực gõ → "không đo")
 *                (+ pedal 15% khi bản nhạc có ký hiệu pedal; chỉ đàn MIDI gửi pedal → micro / bàn phím ảo "không đo").
 *  rhythm      : đúng nhịp 70% + đúng trường độ 15% + hoàn thành 15% (không xét cao độ).
 * Trường độ chỉ chấm được khi nguồn vào báo thả phím (MIDI, bàn phím ảo); với micro phần trọng số đó
 * được chia lại theo tỉ lệ cho các tiêu chí còn lại — không đoán trường độ từ âm ngân.
 */
import { pitchToLabel, type NoteLabelStyle } from '../music/notes';
import type { PerformanceResult } from '../practice/PerformanceTracker';
import type { CurriculumLesson, Exercise, PassRule, Rubric } from './types';

export interface Criterion {
  key: 'accuracy' | 'pitch' | 'timing' | 'duration' | 'completion' | 'dynamics' | 'pedal';
  label: string;
  /** 0..1, null = không đo được với nguồn vào này. */
  value: number | null;
  /** Trọng số gốc (%). */
  weight: number;
}

export interface ExerciseScore {
  exerciseId: string;
  rubric: Rubric;
  /** 0–100, làm tròn. */
  score: number;
  passed: boolean;
  /** Độ chính xác nốt / câu trả lời 0..1. */
  accuracy: number;
  completion: number;
  criteria: Criterion[];
  /** Lỗi trong lần làm này: "C4→D4" (đánh D4 thay vì C4), "q2" (sai câu 2)… */
  mistakes: string[];
}

export const PERFORMANCE_WEIGHTS = { pitch: 45, timing: 30, duration: 15, completion: 10 } as const;
/** Trọng số thêm cho tiêu chí mạnh – nhẹ (bài có dấu sắc thái). */
export const DYNAMICS_WEIGHT = 15;
/** Trọng số thêm cho tiêu chí pedal (bài có ký hiệu pedal). */
export const PEDAL_WEIGHT = 15;
export const RHYTHM_WEIGHTS = { timing: 70, duration: 15, completion: 15 } as const;
export const WAIT_WEIGHTS = { accuracy: 90, completion: 10 } as const;

/** Trung bình có trọng số, bỏ tiêu chí không đo được (null) và chia lại trọng số. */
export function weightedScore(criteria: readonly Criterion[]): number {
  const measured = criteria.filter((c) => c.value !== null);
  const total = measured.reduce((a, c) => a + c.weight, 0);
  if (total === 0) return 0;
  return (measured.reduce((a, c) => a + c.weight * (c.value as number), 0) / total) * 100;
}

export function checkPass(rule: PassRule, s: { score: number; accuracy: number; completion: number; correct?: number }): boolean {
  if (rule.minScore !== undefined && s.score < rule.minScore) return false;
  if (rule.minAccuracy !== undefined && s.accuracy + 1e-9 < rule.minAccuracy) return false;
  if (rule.minCompletion !== undefined && s.completion + 1e-9 < rule.minCompletion) return false;
  if (rule.minCorrect !== undefined && (s.correct ?? 0) < rule.minCorrect) return false;
  return true;
}

function finish(ex: Exercise, rubric: Rubric, criteria: Criterion[], accuracy: number, completion: number, mistakes: string[], correct?: number): ExerciseScore {
  const score = Math.round(weightedScore(criteria));
  return {
    exerciseId: ex.id,
    rubric,
    score,
    passed: checkPass(ex.pass, { score, accuracy, completion, correct }),
    accuracy,
    completion,
    criteria,
    mistakes,
  };
}

/** Bài nhiều lượt (lý thuyết, tìm phím, nhận diện nốt): điểm = % lượt đúng ngay lần đầu. */
export function scoreQuiz(ex: Exercise, rubric: 'theory' | 'keyboard' | 'recognition', r: { correct: number; rounds: number; answered: number; mistakes: string[] }): ExerciseScore {
  const accuracy = r.rounds ? r.correct / r.rounds : 0;
  const completion = r.rounds ? r.answered / r.rounds : 0;
  return finish(ex, rubric, [{ key: 'accuracy', label: 'Trả lời đúng', value: accuracy, weight: 100 }], accuracy, completion, r.mistakes, r.correct);
}

/** Wait Mode: độ chính xác = nốt đúng / số lần đánh (như màn Luyện tập); không có tiêu chí nhịp. */
export function scoreWait(ex: Exercise, r: { correct: number; wrong: number; notes: number; reached: number; mistakes: string[] }): ExerciseScore {
  const attempts = r.correct + r.wrong;
  const accuracy = attempts ? r.correct / attempts : 0;
  const completion = r.notes ? r.reached / r.notes : 0;
  return finish(
    ex,
    'wait',
    [
      { key: 'accuracy', label: 'Đúng nốt', value: accuracy, weight: WAIT_WEIGHTS.accuracy },
      { key: 'completion', label: 'Hoàn thành', value: completion, weight: WAIT_WEIGHTS.completion },
    ],
    accuracy,
    completion,
    r.mistakes,
  );
}

export function scorePerformance(ex: Exercise, r: PerformanceResult, mistakes: string[]): ExerciseScore {
  return finish(
    ex,
    'performance',
    [
      { key: 'pitch', label: 'Đúng nốt', value: r.pitchAccuracy, weight: PERFORMANCE_WEIGHTS.pitch },
      { key: 'timing', label: 'Đúng nhịp', value: r.timing, weight: PERFORMANCE_WEIGHTS.timing },
      { key: 'duration', label: 'Đúng trường độ', value: r.duration, weight: PERFORMANCE_WEIGHTS.duration },
      { key: 'completion', label: 'Hoàn thành bài', value: r.completion, weight: PERFORMANCE_WEIGHTS.completion },
      ...(r.dynamics !== undefined ? [{ key: 'dynamics' as const, label: 'Mạnh – nhẹ', value: r.dynamics, weight: DYNAMICS_WEIGHT }] : []),
      ...(r.pedal !== undefined ? [{ key: 'pedal' as const, label: 'Pedal', value: r.pedal, weight: PEDAL_WEIGHT }] : []),
    ],
    r.pitchAccuracy,
    r.completion,
    mistakes,
  );
}

export function scoreRhythm(ex: Exercise, r: PerformanceResult, mistakes: string[]): ExerciseScore {
  return finish(
    ex,
    'rhythm',
    [
      { key: 'timing', label: 'Đúng nhịp', value: r.timing, weight: RHYTHM_WEIGHTS.timing },
      { key: 'duration', label: 'Đúng trường độ', value: r.duration, weight: RHYTHM_WEIGHTS.duration },
      { key: 'completion', label: 'Hoàn thành bài', value: r.completion, weight: RHYTHM_WEIGHTS.completion },
    ],
    // Bài tiết tấu: "độ chính xác" là tỉ lệ nốt đánh đúng phách.
    r.onTimeRatio * r.completion,
    r.completion,
    mistakes,
  );
}

export interface LessonScore {
  /** 0–100: trung bình có trọng số điểm cao nhất từng bài tập (bài chưa làm = 0). */
  score: number;
  passed: boolean;
  /** Bài tập bắt buộc chưa đạt. */
  missingRequired: string[];
  /** Đã làm đủ mọi bài tập ít nhất một lần. */
  allAttempted: boolean;
}

/**
 * Điểm buổi học từ điểm từng bài tập. Đạt khi: điểm ≥ `assessment.passScore` VÀ mọi bài tập bắt buộc đạt.
 * Buổi không có bài tập (chỉ giới thiệu) đạt khi đã xem xong (`activitiesDone`).
 */
export function scoreLesson(
  lesson: Pick<CurriculumLesson, 'exercises' | 'assessment'>,
  exerciseScores: Record<string, { score: number; passed: boolean } | undefined>,
  activitiesDone = true,
): LessonScore {
  if (lesson.exercises.length === 0) return { score: activitiesDone ? 100 : 0, passed: activitiesDone, missingRequired: [], allAttempted: true };
  // Bài luyện tập (weight 0) không tính vào điểm; buổi chỉ có bài luyện tập thì lấy trung bình thường.
  const anyWeighted = lesson.exercises.some((ex) => (ex.weight ?? 1) > 0);
  let sum = 0;
  let weights = 0;
  const missingRequired: string[] = [];
  for (const ex of lesson.exercises) {
    const w = anyWeighted ? (ex.weight ?? 1) : 1;
    const s = exerciseScores[ex.id];
    sum += w * (s?.score ?? 0);
    weights += w;
    if ((ex.required ?? true) && !s?.passed) missingRequired.push(ex.id);
  }
  const score = Math.round(sum / weights);
  return {
    score,
    passed: missingRequired.length === 0 && score >= lesson.assessment.passScore,
    missingRequired,
    allAttempted: lesson.exercises.every((ex) => exerciseScores[ex.id] !== undefined),
  };
}

/** Sao cho kết quả (Kids Mode): 3 ≥ 95, 2 ≥ 80, 1 khi có làm. */
export function starsFor(score: number): 0 | 1 | 2 | 3 {
  if (score >= 95) return 3;
  if (score >= 80) return 2;
  return score > 0 ? 1 : 0;
}

// ── Lỗi hay gặp ─────────────────────────────────────────────────────
// Khoá ổn định (lưu trong tiến độ), định dạng lúc hiển thị theo kiểu tên nốt người dùng chọn.

/** Cần nốt `expected`, người học đánh / chọn `played` (tên nốt "C4"). */
export const wrongNoteKey = (expected: string, played: string) => `note:${expected}>${played}`;
export const missedNoteKey = (expected: string) => `miss:${expected}`;
export const EXTRA_KEY = 'extra';
/** Câu hỏi / lượt tìm phím trả lời sai. */
export const questionKey = (prompt: string) => `ask:${prompt}`;

function label(pitch: string, style: NoteLabelStyle): string {
  try {
    return pitchToLabel(pitch, style);
  } catch {
    return pitch;
  }
}

export function formatMistake(key: string, style: NoteLabelStyle): string {
  if (key === EXTRA_KEY) return 'Gõ thừa (trong dấu lặng hoặc ngoài phách)';
  const note = /^note:(.+)>(.+)$/.exec(key);
  if (note) return `Cần ${label(note[1], style)}, bạn đánh ${label(note[2], style)}`;
  const miss = /^miss:(.+)$/.exec(key);
  if (miss) return `Lỡ nốt ${label(miss[1], style)}`;
  if (key.startsWith('ask:')) return `Trả lời sai: ${key.slice(4)}`;
  return key;
}
