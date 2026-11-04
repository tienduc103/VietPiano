// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { AdaptiveReviewService } from './AdaptiveReviewService';
import { loadDiscoveryProgress, recordStageResult } from './storage';

describe('AdaptiveReviewService & Storage', () => {
  it('khởi tạo kỹ năng mặc định cho một nốt', () => {
    const skill = AdaptiveReviewService.createDefaultNoteSkill(60);
    expect(skill.midi).toBe(60);
    expect(skill.masteryLevel).toBe('new');
    expect(skill.totalAttempts).toBe(0);
    expect(skill.totalCorrect).toBe(0);
  });

  it('cập nhật độ chính xác theo đúng từng loại kỹ năng', () => {
    let skill = AdaptiveReviewService.createDefaultNoteSkill(60);

    // Lần 1: find-key đúng -> keyboardLocationAccuracy tăng
    skill = AdaptiveReviewService.updateNoteSkill(skill, {
      activityKind: 'find-key',
      isCorrect: true,
      responseTimeMs: 1200,
      usedHint: false,
    });
    expect(skill.keyboardLocationAccuracy).toBeGreaterThan(0);
    expect(skill.staffRecognitionAccuracy).toBe(0);

    // Lần 2: staff-recognition đúng -> staffRecognitionAccuracy tăng
    skill = AdaptiveReviewService.updateNoteSkill(skill, {
      activityKind: 'staff-recognition',
      isCorrect: true,
      responseTimeMs: 1500,
      usedHint: false,
    });
    expect(skill.staffRecognitionAccuracy).toBeGreaterThan(0);

    // Lần 3: listening đúng -> listeningDiscriminationAccuracy tăng
    skill = AdaptiveReviewService.updateNoteSkill(skill, {
      activityKind: 'listening',
      isCorrect: true,
      responseTimeMs: 900,
      usedHint: false,
    });
    expect(skill.listeningDiscriminationAccuracy).toBeGreaterThan(0);
  });

  it('tính toán Mastery Level chính xác theo tiêu chí sư phạm', () => {
    let skill = AdaptiveReviewService.createDefaultNoteSkill(60);

    // Ít hơn 3 lần làm -> 'new'
    skill = AdaptiveReviewService.updateNoteSkill(skill, {
      activityKind: 'find-key',
      isCorrect: true,
      responseTimeMs: 1200,
      usedHint: false,
    });
    expect(skill.masteryLevel).toBe('new');

    // Sau nhiều lần đúng liên tiếp nhưng chưa có đánh giá độc lập -> 'practicing'
    for (let i = 0; i < 4; i++) {
      skill = AdaptiveReviewService.updateNoteSkill(skill, {
        activityKind: 'staff-recognition',
        isCorrect: true,
        responseTimeMs: 1100,
        usedHint: false,
      });
    }
    expect(['practicing', 'remembered']).toContain(skill.masteryLevel);

    // Qua 2 lần đánh giá độc lập thành công -> 'mastered'
    skill = AdaptiveReviewService.updateNoteSkill(skill, {
      activityKind: 'staff-recognition',
      isCorrect: true,
      responseTimeMs: 800,
      usedHint: false,
      isIndependentEvaluation: true,
    });
    skill = AdaptiveReviewService.updateNoteSkill(skill, {
      activityKind: 'memory-challenge',
      isCorrect: true,
      responseTimeMs: 750,
      usedHint: false,
      isIndependentEvaluation: true,
    });

    expect(skill.masteryLevel).toBe('mastered');
  });

  it('lên lịch ôn tập cách quãng (Spaced Repetition) giãn cách khi mastery cao', () => {
    const now = 10000000;
    const tNew = AdaptiveReviewService.computeNextReviewTime(now, 'new', 0);
    const tPracticing = AdaptiveReviewService.computeNextReviewTime(now, 'practicing', 2);
    const tMastered = AdaptiveReviewService.computeNextReviewTime(now, 'mastered', 5);

    expect(tPracticing - now).toBeGreaterThan(tNew - now);
    expect(tMastered - now).toBeGreaterThan(tPracticing - now);
  });

  it('phát hiện các nốt hay bị nhầm lẫn (Trouble notes)', () => {
    let skillC4 = AdaptiveReviewService.createDefaultNoteSkill(60);
    // C4 làm đúng 10 lần
    for (let i = 0; i < 10; i++) {
      skillC4 = AdaptiveReviewService.updateNoteSkill(skillC4, {
        activityKind: 'staff-recognition',
        isCorrect: true,
        responseTimeMs: 1000,
        usedHint: false,
      });
    }

    let skillD4 = AdaptiveReviewService.createDefaultNoteSkill(62);
    // D4 làm sai nhiều (5 lần sai, 1 lần đúng)
    for (let i = 0; i < 5; i++) {
      skillD4 = AdaptiveReviewService.updateNoteSkill(skillD4, {
        activityKind: 'staff-recognition',
        isCorrect: false,
        responseTimeMs: 3000,
        usedHint: true,
        mistakeWithMidi: 60,
      });
    }

    const troubles = AdaptiveReviewService.getTroubleNotes({
      60: skillC4,
      62: skillD4,
    });

    expect(troubles).toContain(62);
    expect(troubles).not.toContain(60);
  });

  it('storage lưu và nạp tiến độ theo từng hồ sơ (multi-profile)', () => {
    const profileA = 'user-alice';
    const profileB = 'user-bob';

    recordStageResult(profileA, 'stage-1', { passed: true, score: 95, isIndependentEvaluation: true });

    const pA = loadDiscoveryProgress(profileA);
    expect(pA.completedStages['stage-1']?.passed).toBe(true);
    expect(pA.completedStages['stage-1']?.bestScore).toBe(95);

    const pB = loadDiscoveryProgress(profileB);
    expect(pB.completedStages['stage-1']?.passed).toBeUndefined();
  });
});
