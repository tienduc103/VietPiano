/**
 * AdaptiveReviewService: Quản lý học tập thích ứng (Adaptive Learning),
 * tính toán Mastery Level cho từng nốt và lên lịch ôn tập cách quãng (Spaced Repetition).
 */
import type {
  ActivityKind,
  DiscoveryStage,
  MasteryLevel,
  NoteDiscoveryProgress,
  NoteSkillStats,
} from './types';

const DAY_MS = 86_400_000;

export class AdaptiveReviewService {
  /**
   * Tạo bản ghi kỹ năng ban đầu cho một nốt
   */
  public static createDefaultNoteSkill(midi: number): NoteSkillStats {
    return {
      midi,
      noteRecognitionAccuracy: 0,
      keyboardLocationAccuracy: 0,
      staffRecognitionAccuracy: 0,
      listeningDiscriminationAccuracy: 0,
      totalAttempts: 0,
      totalCorrect: 0,
      averageResponseTimeMs: 0,
      hintUsageCount: 0,
      consecutiveCorrect: 0,
      recentMistakes: {},
      lastPracticedAt: 0,
      nextReviewAt: 0,
      masteryLevel: 'new',
      evaluationCount: 0,
    };
  }

  /**
   * Cập nhật số liệu kỹ năng của một nốt sau mỗi lượt làm bài
   */
  public static updateNoteSkill(
    current: NoteSkillStats,
    record: {
      activityKind: ActivityKind;
      isCorrect: boolean;
      responseTimeMs: number;
      usedHint: boolean;
      mistakeWithMidi?: number;
      now?: number;
      isIndependentEvaluation?: boolean;
    },
  ): NoteSkillStats {
    const now = record.now ?? Date.now();
    const attempts = current.totalAttempts + 1;
    const correct = current.totalCorrect + (record.isCorrect ? 1 : 0);
    const consecutive = record.isCorrect ? current.consecutiveCorrect + 1 : 0;
    const hints = current.hintUsageCount + (record.usedHint ? 1 : 0);

    // Tính response time trung bình trượt
    const avgResponseTime =
      current.averageResponseTimeMs === 0
        ? record.responseTimeMs
        : Math.round(current.averageResponseTimeMs * 0.8 + record.responseTimeMs * 0.2);

    // Cập nhật độ chính xác theo từng kỹ năng riêng biệt
    let keyboardAcc = current.keyboardLocationAccuracy;
    let staffAcc = current.staffRecognitionAccuracy;
    let listeningAcc = current.listeningDiscriminationAccuracy;
    let generalAcc = current.noteRecognitionAccuracy;

    const alpha = 0.25; // Trọng số học trượt cho lần làm gần nhất
    const scoreVal = record.isCorrect ? 1 : 0;

    switch (record.activityKind) {
      case 'find-key':
        keyboardAcc = keyboardAcc === 0 ? scoreVal : keyboardAcc * (1 - alpha) + scoreVal * alpha;
        break;
      case 'staff-recognition':
        staffAcc = staffAcc === 0 ? scoreVal : staffAcc * (1 - alpha) + scoreVal * alpha;
        break;
      case 'listening':
        listeningAcc = listeningAcc === 0 ? scoreVal : listeningAcc * (1 - alpha) + scoreVal * alpha;
        break;
      default:
        generalAcc = generalAcc === 0 ? scoreVal : generalAcc * (1 - alpha) + scoreVal * alpha;
        break;
    }

    const mistakes = { ...current.recentMistakes };
    if (!record.isCorrect && record.mistakeWithMidi !== undefined) {
      const key = `${current.midi}->${record.mistakeWithMidi}`;
      mistakes[key] = (mistakes[key] ?? 0) + 1;
    }

    const evaluationCount = current.evaluationCount + (record.isIndependentEvaluation && record.isCorrect ? 1 : 0);

    // Tính toán Mastery Level
    const masteryLevel = this.computeMasteryLevel({
      attempts,
      overallAccuracy: correct / attempts,
      keyboardAcc,
      staffAcc,
      consecutive,
      hints,
      evaluationCount,
      avgResponseTime,
    });

    // Lên lịch ôn tập tiếp theo (Spaced Repetition)
    const nextReviewAt = this.computeNextReviewTime(now, masteryLevel, consecutive);

    return {
      ...current,
      totalAttempts: attempts,
      totalCorrect: correct,
      averageResponseTimeMs: avgResponseTime,
      hintUsageCount: hints,
      consecutiveCorrect: consecutive,
      keyboardLocationAccuracy: Math.round(keyboardAcc * 100) / 100,
      staffRecognitionAccuracy: Math.round(staffAcc * 100) / 100,
      listeningDiscriminationAccuracy: Math.round(listeningAcc * 100) / 100,
      noteRecognitionAccuracy: Math.round(generalAcc * 100) / 100,
      recentMistakes: mistakes,
      lastPracticedAt: now,
      nextReviewAt,
      masteryLevel,
      evaluationCount,
    };
  }

  /**
   * Tính toán mức độ thành thạo (Mastery Level)
   * New -> Learning -> Practicing -> Remembered -> Mastered
   */
  public static computeMasteryLevel(stats: {
    attempts: number;
    overallAccuracy: number;
    keyboardAcc: number;
    staffAcc: number;
    consecutive: number;
    hints: number;
    evaluationCount: number;
    avgResponseTime: number;
  }): MasteryLevel {
    if (stats.attempts < 3) {
      return 'new';
    }

    if (stats.overallAccuracy < 0.7 || stats.consecutive < 2) {
      return 'learning';
    }

    // Đạt >= 90% độ chính xác, không dùng gợi ý, và qua ít nhất 2 lần đánh giá độc lập
    if (
      stats.overallAccuracy >= 0.88 &&
      stats.evaluationCount >= 2 &&
      stats.consecutive >= 4 &&
      stats.hints <= 1
    ) {
      return 'mastered';
    }

    // Nhớ tốt (Remembered): accuracy >= 0.85 và có ít nhất 1 lần đánh giá
    if (stats.overallAccuracy >= 0.82 && (stats.evaluationCount >= 1 || stats.consecutive >= 3)) {
      return 'remembered';
    }

    return 'practicing';
  }

  /**
   * Tính toán thời điểm ôn tập tiếp theo theo thuật toán cách quãng
   */
  public static computeNextReviewTime(now: number, level: MasteryLevel, consecutive: number): number {
    switch (level) {
      case 'new':
      case 'learning':
        return now + 1 * DAY_MS; // Ôn lại sau 1 ngày
      case 'practicing':
        return now + 2 * DAY_MS; // Ôn lại sau 2 ngày
      case 'remembered':
        return now + 5 * DAY_MS; // Ôn lại sau 5 ngày
      case 'mastered':
        // Càng trả lời đúng liên tục nhiều, khoảng cách càng giãn (tối đa 30 ngày)
        const days = Math.min(30, 7 + Math.min(consecutive, 5) * 4);
        return now + days * DAY_MS;
    }
  }

  /**
   * Phát hiện các nốt học viên hay bị nhầm lẫn (Trouble notes)
   */
  public static getTroubleNotes(noteSkills: Record<number, NoteSkillStats>): number[] {
    const trouble: number[] = [];
    for (const [midiStr, stat] of Object.entries(noteSkills)) {
      const midi = Number(midiStr);
      if (stat.totalAttempts >= 3) {
        const errorRate = 1 - stat.totalCorrect / stat.totalAttempts;
        if (errorRate >= 0.25 || stat.masteryLevel === 'learning') {
          trouble.push(midi);
        }
      }
    }
    return trouble;
  }

  /**
   * Kiểm tra điều kiện mở khóa Stage tiếp theo
   */
  public static canUnlockStage(stage: DiscoveryStage, progress: NoteDiscoveryProgress): boolean {
    if (stage.prerequisites.length === 0) return true;

    for (const prereqId of stage.prerequisites) {
      const p = progress.completedStages[prereqId];
      if (!p || !p.passed) {
        return false;
      }
      // Đòi hỏi số lần đánh giá độc lập
      if (p.independentEvaluationsPassed < 1) {
        return false;
      }
    }
    return true;
  }
}
