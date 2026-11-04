import { describe, expect, it } from 'vitest';
import { NoteDiscoveryEngine } from './NoteDiscoveryEngine';
import { NOTE_DISCOVERY_STAGES } from './stages';

describe('NoteDiscoveryEngine', () => {
  it('khởi tạo đúng cho Activity 1 (Note Introduction) của Stage 2', () => {
    const stage2 = NOTE_DISCOVERY_STAGES[1]; // Stage 2: C4
    const engine = new NoteDiscoveryEngine(stage2, 0);
    const state = engine.getState();

    expect(state.activity.kind).toBe('intro');
    expect(state.currentNote?.scientificName).toBe('C4');
    expect(state.highlightedKeys).toContain(60);
    expect(state.expectedKey).toBe(60);
    expect(state.status).toBe('active');
  });

  it('xử lý bấm đúng nốt trong Activity 1 và chuyển bước', () => {
    const stage2 = NOTE_DISCOVERY_STAGES[1];
    const engine = new NoteDiscoveryEngine(stage2, 0);

    const res = engine.handleNoteOn(60);
    expect(res.isCorrect).toBe(true);
    expect(res.status).toBe('activity-complete'); // Stage 2 intro chỉ có 1 item C4
    expect(engine.getState().correctCount).toBe(1);
  });

  it('Activity 2 (Find Key): bấm sai không làm hỏng bài và có thể thử lại', () => {
    const stage2 = NOTE_DISCOVERY_STAGES[1];
    const engine = new NoteDiscoveryEngine(stage2, 1); // find-key activity
    expect(engine.getState().activity.kind).toBe('find-key');

    // Bấm sai nốt D4 (62) thay vì C4 (60)
    const wrongRes = engine.handleNoteOn(62);
    expect(wrongRes.isCorrect).toBe(false);
    expect(engine.getState().mistakes['60->62']).toBe(1);

    // Release phím
    engine.handleNoteOff(62);

    // Thử lại vòng này
    engine.retryCurrentRound();
    expect(engine.getState().status).toBe('active');

    // Bấm đúng C4 (60)
    const correctRes = engine.handleNoteOn(60);
    expect(correctRes.isCorrect).toBe(true);
  });

  it('Activity 3 (Staff Recognition): hỗ trợ cả gõ phím và chọn đáp án trắc nghiệm', () => {
    const stage2 = NOTE_DISCOVERY_STAGES[1];
    const engine = new NoteDiscoveryEngine(stage2, 2); // staff-recognition
    expect(engine.getState().activity.kind).toBe('staff-recognition');

    // Round 0: answerType = 'play'
    const playRes = engine.handleNoteOn(60);
    expect(playRes.isCorrect).toBe(true);
    engine.handleNoteOff(60);

    // Advance sang round 1: answerType = 'choice'
    engine.advance();
    expect(engine.getState().roundIndex).toBe(1);

    // Choice 0 là "Đô"
    const choiceRes = engine.handleChoice(0);
    expect(choiceRes.isCorrect).toBe(true);
  });

  it('Activity 4 (Listening): kiểm tra so sánh cao độ hai âm thanh', () => {
    const stage1 = NOTE_DISCOVERY_STAGES[0];
    const engine = new NoteDiscoveryEngine(stage1, 2); // listening activity
    expect(engine.getState().activity.kind).toBe('listening');

    // Round 0: C3 (48) vs C5 (72) -> higher (choice 0)
    const res = engine.handleChoice(0);
    expect(res.isCorrect).toBe(true);
  });

  it('Activity 5 (Note Sequence): đánh chuỗi nốt, đúng thì tiến con trỏ, sai không tự chuyển', () => {
    const stage3 = NOTE_DISCOVERY_STAGES[2]; // Stage 3: C4, D4, E4
    const engine = new NoteDiscoveryEngine(stage3, 3); // sequence activity
    expect(engine.getState().activity.kind).toBe('sequence');
    expect(engine.getState().sequenceMidis).toEqual([60, 62, 64]);
    expect(engine.getState().sequenceIndex).toBe(0);

    // Đánh nốt đầu tiên đúng: C4 (60)
    const r1 = engine.handleNoteOn(60);
    expect(r1.isCorrect).toBe(true);
    engine.handleNoteOff(60);
    expect(engine.getState().sequenceIndex).toBe(1);
    expect(engine.getState().currentNote?.scientificName).toBe('D4');

    // Đánh nốt thứ hai sai: gõ lại C4 (60) thay vì D4 (62)
    const rWrong = engine.handleNoteOn(60);
    expect(rWrong.isCorrect).toBe(false);
    engine.handleNoteOff(60);
    // Vẫn ở nguyên vị trí index 1, không tự chuyển!
    expect(engine.getState().sequenceIndex).toBe(1);

    // Đánh đúng nốt thứ hai: D4 (62)
    const r2 = engine.handleNoteOn(62);
    expect(r2.isCorrect).toBe(true);
    engine.handleNoteOff(62);
    expect(engine.getState().sequenceIndex).toBe(2);

    // Đánh đúng nốt thứ ba: E4 (64) -> hoàn thành chuỗi
    const r3 = engine.handleNoteOn(64);
    expect(r3.isCorrect).toBe(true);
    expect(r3.status).toBe('activity-complete');
  });

  it('chống lặp note-on khi đang giữ phím (held key protection)', () => {
    const stage2 = NOTE_DISCOVERY_STAGES[1];
    const engine = new NoteDiscoveryEngine(stage2, 0);

    // Nhấn C4 lần đầu
    const r1 = engine.handleNoteOn(60);
    expect(r1.isCorrect).toBe(true);

    // Nhấn lại C4 khi chưa có note-off (do giữ phím lặp lại tín hiệu MIDI)
    const rDuplicate = engine.handleNoteOn(60);
    // Bị chặn không tính lại
    expect(rDuplicate.responseTimeMs).toBe(0);

    // Sau khi release
    engine.handleNoteOff(60);
  });
});
