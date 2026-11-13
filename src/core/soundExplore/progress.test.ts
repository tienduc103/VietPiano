// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { buildExploreMessages, parseAiAdvice, ruleAdvice, summaryForAi } from './ai';
import { assessSkill, gardenChoices, kidMessage, KID_MESSAGES, MIN_ATTEMPTS, recommend, suggestedLevel } from './assessment';
import { SOUND_EXPLORE_LESSON, soundExploreVoiceLines } from './lesson';
import {
  addSession,
  addStar,
  awardSticker,
  emptyProgress,
  markVisited,
  recordAttempt,
  recordGarden,
  recordReplay,
  resetProgress,
  sanitizeProgress,
  setRecording,
  updateSettings,
  type SkillId,
  type SoundExploreProgress,
} from './progress';
import { MAX_RECORD_MS, PerformanceRecorder, recordingLength } from './recorder';
import { clearExploreProgress, loadExploreProgress, saveExploreProgress, STORAGE_KEY } from './storage';
import { SUPPLEMENT } from '../curriculum/content/supplement';

function attempts(p: SoundExploreProgress, skill: SkillId, results: boolean[], input: 'midi' | 'touch' = 'touch') {
  return results.reduce((acc, success, i) => recordAttempt(acc, { skill, success, input, firstTry: true, at: i + 1 }), p);
}

describe('progress', () => {
  it('lần thử đầu tính vào tỷ lệ, thử lại chỉ đếm retries; nghe lại đếm riêng', () => {
    let p = emptyProgress();
    p = recordAttempt(p, { skill: 'pitchRecognition', success: false, input: 'touch', firstTry: true, at: 1 });
    p = recordAttempt(p, { skill: 'pitchRecognition', success: true, input: 'touch', firstTry: false, at: 2 });
    p = recordReplay(p, 'pitchRecognition', 3);
    expect(p.skills.pitchRecognition).toMatchObject({ attempts: 1, successfulAttempts: 0, retries: 1, replays: 1, recent: [false] });
  });

  it('đếm riêng lần thử trên đàn MIDI', () => {
    const p = attempts(emptyProgress(), 'durationExecution', [true, false, true], 'midi');
    expect(p.skills.durationExecution).toMatchObject({ midiAttempts: 3, midiSuccesses: 2 });
  });

  it('sanitize: dữ liệu hỏng → hợp lệ, không ném lỗi; giữ dữ liệu đúng', () => {
    expect(sanitizeProgress('rác')).toEqual(emptyProgress());
    let p = attempts(emptyProgress(), 'pitchRecognition', [true, true]);
    p = addStar(markVisited(p, 'rocket', 5), 'rocket', 5);
    p = awardSticker(p, 6).progress;
    p = addSession(p, { sessionId: 's1', learnerId: 'a', activityId: 'rocket', startedAt: 1, endedAt: 9, inputMode: 'midi', completed: true, assistanceLevel: 'some' });
    const round = sanitizeProgress(JSON.parse(JSON.stringify(p)));
    expect(round).toEqual(p);
    const bad = sanitizeProgress({ skills: { pitchRecognition: { attempts: 2, successfulAttempts: 9 } }, stickers: ['x', '🌟'], sessions: [{ sessionId: 1 }] });
    expect(bad.skills.pitchRecognition.successfulAttempts).toBe(2);
    expect(bad.stickers).toEqual(['🌟']);
    expect(bad.sessions).toEqual([]);
  });

  it('đặt lại: giữ cài đặt phụ huynh; đặt lại một hoạt động chỉ xoá phần của hoạt động đó', () => {
    let p = updateSettings(emptyProgress(), { level: 2, longMinMs: 2000 }, 1);
    p = addStar(markVisited(addStar(p, 'garden', 2), 'rocket', 2), 'rocket', 2);
    p = recordGarden(p, true, 3);
    const one = resetProgress(p, 4, 'garden');
    expect(one.stars).toMatchObject({ garden: 0, rocket: 1 });
    expect(one.gardenRecent).toEqual([]);
    const all = resetProgress(p, 5);
    expect(all.settings.level).toBe(2);
    expect(all.settings.longMinMs).toBe(2000);
    expect(all.stars.rocket).toBe(0);
  });
});

describe('storage — lưu và khôi phục theo hồ sơ', () => {
  beforeEach(() => localStorage.clear());
  it('mỗi hồ sơ một bản; tải lại đúng dữ liệu', () => {
    const a = addStar(emptyProgress(), 'rocket', 1);
    saveExploreProgress('p1', a);
    saveExploreProgress('p2', emptyProgress());
    expect(loadExploreProgress('p1').stars.rocket).toBe(1);
    expect(loadExploreProgress('p2').stars.rocket).toBe(0);
    expect(loadExploreProgress(null)).toEqual(emptyProgress());
    clearExploreProgress('p1');
    expect(loadExploreProgress('p1').stars.rocket).toBe(0);
  });
  it('JSON hỏng → dữ liệu rỗng', () => {
    localStorage.setItem(STORAGE_KEY, '{oops');
    expect(loadExploreProgress('p1')).toEqual(emptyProgress());
  });
});

describe('assessment — không kết luận từ vài lần chơi', () => {
  it('ít hơn MIN_ATTEMPTS lần → chưa đủ dữ liệu, kể cả khi đúng hết', () => {
    const p = attempts(emptyProgress(), 'pitchRecognition', Array(MIN_ATTEMPTS - 1).fill(true));
    expect(assessSkill(p, 'pitchRecognition').status).toBe('insufficient');
  });
  it('đủ lần thử: tốt / cần luyện thêm theo các lần gần nhất', () => {
    expect(assessSkill(attempts(emptyProgress(), 'pitchRecognition', [true, true, true, true, true, false, true, true]), 'pitchRecognition').status).toBe('good');
    expect(assessSkill(attempts(emptyProgress(), 'pitchRecognition', [true, false, false, true, false, false]), 'pitchRecognition').status).toBe('practice');
  });
  it('gợi ý lên mức chỉ khi kỹ năng của mức đều tốt qua ≥ 8 lần; cần phụ huynh duyệt', () => {
    let p = emptyProgress();
    expect(suggestedLevel(p)).toBeNull();
    for (const s of ['pitchRecognition', 'durationRecognition', 'durationExecution'] as SkillId[]) p = attempts(p, s, Array(8).fill(true));
    expect(suggestedLevel(p)).toBe(2);
    const rec = recommend(p, 1).find((r) => r.skill === 'level');
    expect(rec?.parentApprovalRequired).toBe(true);
    // Mức không tự đổi.
    expect(p.settings.level).toBe(1);
  });
  it('kỹ năng yếu → đề xuất đúng hoạt động', () => {
    let p = markVisited(emptyProgress(), 'intro', 1);
    p = attempts(p, 'durationExecution', [false, false, true, false, false, false]);
    expect(recommend(p, 1)[0]).toMatchObject({ skill: 'durationExecution', suggestedActivity: 'duration', generatedBy: 'rules' });
    expect(kidMessage(p)).toBe(KID_MESSAGES.holdLonger);
  });
  it('khu vườn: 2 lựa chọn tới khi ≥ 5/6 lượt gần nhất đạt; phụ huynh chọn tay thì theo phụ huynh', () => {
    let p = emptyProgress();
    expect(gardenChoices(p)).toBe(2);
    for (const b of [true, true, false, true, true, true]) p = recordGarden(p, b, 1);
    expect(gardenChoices(p)).toBe(4);
    expect(gardenChoices(updateSettings(p, { gardenChoices: 2 }, 2))).toBe(2);
  });
});

describe('AI — chỉ sư phạm, có dự phòng theo quy tắc', () => {
  it('tóm tắt không chứa tên bé, có trạng thái kỹ năng', () => {
    const p = attempts(emptyProgress(), 'pitchRecognition', [true, true]);
    const s = summaryForAi(p, 5, 1);
    expect(s).toContain('Chưa có đủ dữ liệu');
    expect(s).toContain('Tuổi của bé: 5');
    const msgs = buildExploreMessages(p, null, 1);
    expect(msgs[0].content).toContain('không nhận xét về trí thông minh');
    expect(msgs[1].content).not.toContain('Tuổi');
  });
  it('câu trả lời hợp lệ được nhận; suy diễn trí tuệ / sức khoẻ bị loại', () => {
    expect(parseAiAdvice('BÉ: Con giỏi lắm!\nPHỤ HUYNH:\n- Cùng bé hát lên xuống.')).toEqual({ kid: 'Con giỏi lắm!', parent: '- Cùng bé hát lên xuống.' });
    expect(parseAiAdvice('BÉ: Con rất thông minh!\nPHỤ HUYNH: - ok')).toBeNull();
    expect(parseAiAdvice('BÉ: Giỏi!\nPHỤ HUYNH: Bé có thể chậm phát triển thính giác.')).toBeNull();
    expect(parseAiAdvice('không đúng định dạng')).toBeNull();
  });
  it('nhận xét theo quy tắc luôn có', () => {
    const a = ruleAdvice(emptyProgress(), 1);
    expect(a.generatedBy).toBe('rules');
    expect(a.kid.length).toBeGreaterThan(0);
    expect(a.parent).toContain('Làm quen với âm thanh');
  });
});

describe('PerformanceRecorder — chỉ ghi dữ liệu nốt', () => {
  it('ghi nốt + thời gian giữ, đóng nốt còn giữ khi dừng', () => {
    const r = new PerformanceRecorder();
    r.start(1000);
    r.noteOn(60, 1100);
    r.noteOn(64, 1200);
    r.noteOff(60, 1600);
    const notes = r.stop(2200);
    expect(notes).toEqual([
      { midi: 60, at: 100, durationMs: 500 },
      { midi: 64, at: 200, durationMs: 1000 },
    ]);
    expect(recordingLength(notes)).toBe(1200);
    expect(r.isRecording()).toBe(false);
    expect(r.isFull(1000 + MAX_RECORD_MS)).toBe(false);
  });
  it('lưu bản ghi qua progress (sanitize bỏ nốt hỏng)', () => {
    const p = setRecording(emptyProgress(), [{ midi: 60, at: 0, durationMs: 300 }, { midi: 999, at: 0, durationMs: 1 } as never], 1);
    expect(p.recording).toEqual([{ midi: 60, at: 0, durationMs: 300 }]);
  });
});

describe('LessonDefinition', () => {
  it('thuộc giáo trình "Làm quen từng nốt", 6 hoạt động, mọi câu cô giáo không rỗng', () => {
    expect(SOUND_EXPLORE_LESSON.curriculumId).toBe(SUPPLEMENT.curriculumId);
    expect(SOUND_EXPLORE_LESSON.activities.map((a) => a.id)).toEqual(['intro', 'rocket', 'duration', 'garden', 'free', 'adventure']);
    const lines = soundExploreVoiceLines();
    expect(lines.length).toBeGreaterThan(50);
    for (const l of lines) expect(l.trim().length).toBeGreaterThan(3);
  });
});
