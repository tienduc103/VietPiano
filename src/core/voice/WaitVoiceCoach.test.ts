import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PracticeEngine } from '../practice/PracticeEngine';
import { DEFAULT_WAIT_COACH, WaitVoiceCoach, type HelpLevel } from './WaitVoiceCoach';
import type { VoiceCue } from './types';

const C4 = 60;
const D4 = 62;
const E4 = 64;
const targets = [
  { pitch: 'C4', finger: 1 },
  { pitch: 'D4', finger: 2 },
  { pitch: 'E4', finger: 3 },
];

function setup(opts = DEFAULT_WAIT_COACH, custom?: VoiceCue[]) {
  const said: VoiceCue[] = [];
  const help: HelpLevel[] = [];
  const engine = new PracticeEngine([C4, D4, E4]);
  const coach = new WaitVoiceCoach((c) => said.push(c), targets, 'Đô Rê Mi', opts, custom, (h) => help.push(h));
  coach.start(engine.getState());
  engine.subscribe((s) => coach.update(s));
  const texts = () => said.map((c) => c.instructionText);
  const triggers = () => said.map((c) => c.trigger);
  return { engine, coach, said, texts, triggers, help };
}

describe('WaitVoiceCoach', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('bắt đầu: lời dặn + nốt đầu tiên kèm ngón', () => {
    const { texts, triggers } = setup();
    expect(triggers()).toEqual(['step_start', 'note_expected']);
    expect(texts()[1]).toBe('Đánh nốt Đô, ngón 1.');
  });

  it('đúng: khen lần đầu, nốt kế chỉ đọc khi bé chưa đánh sau hintDelayMs', () => {
    const { engine, said, triggers } = setup();
    said.length = 0;
    engine.handleNote(C4, 1000);
    expect(triggers()).toEqual(['note_correct']);
    // Bé đánh tiếp ngay → không nhắc nốt Rê.
    engine.handleNote(D4, 1500);
    vi.advanceTimersByTime(DEFAULT_WAIT_COACH.hintDelayMs + 10);
    expect(triggers()).toEqual(['note_correct', 'note_expected']);
    expect(said.at(-1)!.instructionText).toContain('Mi');
  });

  it('không khen mọi nốt (bé chơi nhanh cô không nói liên tục)', () => {
    const engine = new PracticeEngine([C4, D4, C4, D4, C4, D4], { minAdvanceIntervalMs: 0, octaveTolerant: false, advanceOnWrong: false });
    const said: VoiceCue[] = [];
    const coach = new WaitVoiceCoach((c) => said.push(c), Array(6).fill({ pitch: 'C4' }), 't', { ...DEFAULT_WAIT_COACH, autoRead: false });
    coach.start(engine.getState());
    engine.subscribe((s) => coach.update(s));
    [C4, D4, C4, D4, C4].forEach((m, i) => engine.handleNote(m, 1000 + i * 200));
    expect(said.filter((c) => c.trigger === 'note_correct')).toHaveLength(2); // lần 1 và lần 4
  });

  it('sai nhiều lần: hỗ trợ tăng dần, không chê', () => {
    const { engine, said, help } = setup();
    said.length = 0;
    engine.handleNote(E4, 1000);
    engine.handleNote(E4, 4000);
    engine.handleNote(E4, 8000);
    const texts = said.map((c) => c.instructionText);
    expect(texts[0]).toMatch(/Đô\.$/);
    expect(texts[1]).toContain('Đô nằm ngay bên trái hai phím đen');
    expect(texts[2]).toContain('phím đang sáng màu, ngón 1');
    expect(help).toEqual([1, 2]);
    for (const t of texts) expect(t).not.toMatch(/sai rồi|kém|tệ/i);
    // Sửa được → khen, hỗ trợ về 0.
    engine.handleNote(C4, 9000);
    expect(said.at(-1)!.trigger).toBe('note_correct');
    expect(help.at(-1)).toBe(0);
  });

  it('chưa thao tác: nhắc lại sau remindAfterMs, giãn dần, tối đa maxReminders', () => {
    const { said } = setup({ ...DEFAULT_WAIT_COACH, remindAfterMs: 1000, maxReminders: 2 });
    said.length = 0;
    vi.advanceTimersByTime(1000);
    expect(said.map((c) => c.trigger)).toEqual(['timeout']);
    vi.advanceTimersByTime(1499);
    expect(said).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(said).toHaveLength(2);
    expect(said[1].instructionText).toContain('bên trái hai phím đen');
    vi.advanceTimersByTime(60_000);
    expect(said).toHaveLength(2);
  });

  it('thao tác thì hoãn lời nhắc', () => {
    const { engine, said } = setup({ ...DEFAULT_WAIT_COACH, remindAfterMs: 1000 });
    vi.advanceTimersByTime(900);
    engine.handleNote(C4, 900);
    said.length = 0;
    vi.advanceTimersByTime(900);
    expect(said.filter((c) => c.trigger === 'timeout')).toHaveLength(0);
  });

  it('xong bài: chúc mừng, dừng mọi hẹn giờ', () => {
    const { engine, said } = setup({ ...DEFAULT_WAIT_COACH, remindAfterMs: 1000 });
    engine.handleNote(C4, 1000);
    engine.handleNote(D4, 2000);
    engine.handleNote(E4, 3000);
    expect(said.at(-1)!.trigger).toBe('lesson_complete');
    const n = said.length;
    vi.advanceTimersByTime(60_000);
    expect(said).toHaveLength(n);
  });

  it('tắt tự đọc + động viên: không nói gì ngoài lời sai', () => {
    const { engine, said } = setup({ ...DEFAULT_WAIT_COACH, autoRead: false, encourage: false });
    engine.handleNote(C4, 1000);
    engine.handleNote(C4, 2000);
    vi.advanceTimersByTime(60_000);
    expect(said.map((c) => c.trigger)).toEqual(['note_wrong']);
  });

  it('câu khai báo trong bài thay câu mặc định cùng trigger', () => {
    const { texts } = setup(DEFAULT_WAIT_COACH, [{ trigger: 'step_start', instructionText: 'Đặt ngón cái lên Đô nhé!', audioAsset: 'voice/x.mp3' }]);
    expect(texts()[0]).toBe('Đặt ngón cái lên Đô nhé!');
  });

  it('dispose huỷ hẹn giờ', () => {
    const { coach, said } = setup({ ...DEFAULT_WAIT_COACH, remindAfterMs: 1000 });
    coach.dispose();
    said.length = 0;
    vi.advanceTimersByTime(10_000);
    expect(said).toHaveLength(0);
  });
});
