// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { NotePoolProvider } from './NotePoolProvider';
import { clearDiscoveryProgressForTest, recordNoteAnswer, recordStageResult } from './storage';

describe('NotePoolProvider', () => {
  beforeEach(() => {
    clearDiscoveryProgressForTest();
  });
  it('trả về fallback an toàn (C4, D4, E4) khi người học chưa có dữ liệu', () => {
    const pool = NotePoolProvider.getLearnedNotes('brand-new-user');
    expect(pool).toContain(60);
    expect(pool).toContain(62);
    expect(pool).toContain(64);
  });

  it('cung cấp đúng danh sách nốt sau khi hoàn thành các chặng', () => {
    const profile = 'student-test-1';
    recordStageResult(profile, 'stage-2', { passed: true, score: 90 });
    recordStageResult(profile, 'stage-3', { passed: true, score: 88 }); // C4, D4, E4
    recordStageResult(profile, 'stage-4', { passed: true, score: 85 }); // F4, G4

    const notes = NotePoolProvider.getLearnedNotes(profile);
    expect(notes).toContain(60); // C4
    expect(notes).toContain(62); // D4
    expect(notes).toContain(64); // E4
    expect(notes).toContain(65); // F4
    expect(notes).toContain(67); // G4
  });

  it('ưu tiên nốt hay làm sai (trouble notes) lên đầu danh sách', () => {
    const profile = 'student-test-trouble';
    // Đánh sai nốt G4 (67) nhiều lần
    for (let i = 0; i < 4; i++) {
      recordNoteAnswer(profile, 67, {
        activityKind: 'find-key',
        isCorrect: false,
        responseTimeMs: 3000,
        usedHint: true,
        mistakeWithMidi: 65,
      });
    }

    // Đánh đúng C4 (60)
    for (let i = 0; i < 5; i++) {
      recordNoteAnswer(profile, 60, {
        activityKind: 'find-key',
        isCorrect: true,
        responseTimeMs: 800,
        usedHint: false,
      });
    }

    const prioritized = NotePoolProvider.getPrioritizedNotes(profile);
    expect(prioritized[0]).toBe(67); // Nốt G4 hay nhầm được ưu tiên đứng đầu!
  });

  it('tạo cấu hình tìm nốt cho Balloon Pop hunt mode', () => {
    const profile = 'student-balloon';
    recordStageResult(profile, 'stage-3', { passed: true, score: 90 });

    const config = NotePoolProvider.getForBalloonHunt(profile);
    expect(config.huntLetters).toContain('C');
    expect(config.huntLetters).toContain('D');
    expect(config.huntLetters).toContain('E');
    expect(config.targetMidis).toContain(60);
  });

  it('gợi ý độ khó và tập nốt cho Tomato Harvest', () => {
    const profileEasy = 'student-tomato-easy';
    recordStageResult(profileEasy, 'stage-2', { passed: true, score: 85 });
    const tomatoEasy = NotePoolProvider.getForTomatoHarvest(profileEasy);
    expect(tomatoEasy.suggestedDifficulty).toBe('easy');

    const profileHard = 'student-tomato-hard';
    recordStageResult(profileHard, 'stage-6', { passed: true, score: 95 });
    const tomatoHard = NotePoolProvider.getForTomatoHarvest(profileHard);
    expect(tomatoHard.suggestedDifficulty).toBe('hard');
  });

  it('cung cấp dải nốt cho F1 Racing', () => {
    const profile = 'student-f1';
    recordStageResult(profile, 'stage-4', { passed: true, score: 90 });
    const f1Config = NotePoolProvider.getForF1Racing(profile);
    expect(f1Config.lowMidi).toBeLessThanOrEqual(60);
    expect(f1Config.highMidi).toBeGreaterThanOrEqual(67);
  });
});
