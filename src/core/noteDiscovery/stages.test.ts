import { describe, expect, it } from 'vitest';
import { NOTE_DISCOVERY_STAGES } from './stages';

describe('Note Discovery - 8 Stages Definition & Validation', () => {
  it('chứa đủ 8 Stages theo đúng thứ tự 1..8', () => {
    expect(NOTE_DISCOVERY_STAGES.length).toBe(8);
    NOTE_DISCOVERY_STAGES.forEach((stage, idx) => {
      expect(stage.number).toBe(idx + 1);
      expect(stage.stageId).toBe(`stage-${idx + 1}`);
      expect(stage.title).toBeTruthy();
      expect(stage.description).toBeTruthy();
      expect(stage.learningObjectives.length).toBeGreaterThan(0);
      expect(stage.activities.length).toBeGreaterThan(0);
    });
  });

  it('chuỗi điều kiện tiên quyết (prerequisites) liền mạch và hợp lệ', () => {
    expect(NOTE_DISCOVERY_STAGES[0].prerequisites).toEqual([]);
    for (let i = 1; i < NOTE_DISCOVERY_STAGES.length; i++) {
      const prevStageId = NOTE_DISCOVERY_STAGES[i - 1].stageId;
      expect(NOTE_DISCOVERY_STAGES[i].prerequisites).toContain(prevStageId);
    }
  });

  it('bao quát đủ 6 loại hoạt động (Activity Types) trong toàn bộ giáo trình', () => {
    const allKinds = new Set<string>();
    NOTE_DISCOVERY_STAGES.forEach((stage) => {
      stage.activities.forEach((act) => {
        allKinds.add(act.kind);
      });
    });

    expect(allKinds.has('intro')).toBe(true);
    expect(allKinds.has('find-key')).toBe(true);
    expect(allKinds.has('staff-recognition')).toBe(true);
    expect(allKinds.has('listening')).toBe(true);
    expect(allKinds.has('sequence')).toBe(true);
    expect(allKinds.has('memory-challenge')).toBe(true);
  });

  it('tiêu chuẩn đánh giá (assessment) không dưới 80% độ chính xác', () => {
    NOTE_DISCOVERY_STAGES.forEach((stage) => {
      expect(stage.assessment.minPracticeAccuracy).toBeGreaterThanOrEqual(0.8);
      expect(stage.assessment.minTestAccuracy).toBeGreaterThanOrEqual(0.85);
      expect(stage.assessment.requiresIndependentConfirmations).toBeGreaterThanOrEqual(2);
    });
  });
});
