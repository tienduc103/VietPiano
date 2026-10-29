import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MIC_GUARD_MS, PENDING_MAX_AGE_MS, VoiceTeacher } from './VoiceTeacher';
import type { SpeechHandle, Speaker, VoiceCue } from './types';

/** Nguồn phát giả: ghi lại câu đã đọc, câu kết thúc khi gọi `finish()`. */
function fakeSpeaker(available = true) {
  const spoken: string[] = [];
  const cancelled: string[] = [];
  let finishCurrent: (() => void) | null = null;
  const speaker: Speaker & { unlocked: number } = {
    unlocked: 0,
    unlock() {
      this.unlocked++;
    },
    speak(cue): SpeechHandle | null {
      if (!available) return null;
      spoken.push(cue.text);
      let resolve!: () => void;
      const done = new Promise<void>((r) => (resolve = r));
      finishCurrent = resolve;
      return { done, cancel: () => (cancelled.push(cue.text), resolve()) };
    },
  };
  return {
    speaker,
    spoken,
    cancelled,
    finish: async () => {
      finishCurrent?.();
      await Promise.resolve();
      await Promise.resolve();
    },
  };
}

const cue = (trigger: VoiceCue['trigger'], text: string, extra: Partial<VoiceCue> = {}): VoiceCue => ({ trigger, instructionText: text, ...extra });

describe('VoiceTeacher', () => {
  let now = 0;
  beforeEach(() => {
    now = 1000;
    vi.useFakeTimers();
  });
  afterEach(() => vi.useRealTimers());
  const make = (f = fakeSpeaker(), quiet = () => 0) => ({ f, t: new VoiceTeacher({ speaker: f.speaker, now: () => now, quietUntil: quiet }) });

  it('đọc voiceText, hiện instructionText', () => {
    const { f, t } = make();
    t.say(cue('lesson_start', 'Chào bé! (C4)', { voiceText: 'Chào bé! Đô' }));
    expect(f.spoken).toEqual(['Chào bé! Đô']);
    expect(t.getState()).toMatchObject({ caption: 'Chào bé! (C4)', speaking: true });
  });

  it('không đọc chồng: câu ưu tiên thấp hơn chờ câu đang đọc xong', async () => {
    const { f, t } = make();
    t.say(cue('lesson_start', 'A'));
    t.say(cue('note_expected', 'B'));
    expect(f.spoken).toEqual(['A']);
    await f.finish();
    expect(f.spoken).toEqual(['A', 'B']);
  });

  it('chỉ giữ một câu chờ — câu mới hơn thay câu cũ', async () => {
    const { f, t } = make();
    t.say(cue('lesson_start', 'A'));
    t.say(cue('note_expected', 'B1'));
    t.say(cue('note_expected', 'B2'));
    await f.finish();
    expect(f.spoken).toEqual(['A', 'B2']);
  });

  it('câu chờ ưu tiên thấp không thay câu chờ ưu tiên cao', async () => {
    const { f, t } = make();
    t.say(cue('lesson_complete', 'Xong'));
    t.say(cue('note_wrong', 'Sai'));
    t.say(cue('note_expected', 'Nốt'));
    await f.finish();
    expect(f.spoken).toEqual(['Xong', 'Sai']);
  });

  it('câu ưu tiên ≥ ngắt câu đang đọc', () => {
    const { f, t } = make();
    t.say(cue('note_expected', 'Đô'));
    t.say(cue('note_wrong', 'Thử lại'));
    expect(f.cancelled).toEqual(['Đô']);
    expect(f.spoken).toEqual(['Đô', 'Thử lại']);
  });

  it('câu chờ quá lâu bị bỏ', async () => {
    const { f, t } = make();
    t.say(cue('lesson_start', 'A'));
    t.say(cue('note_expected', 'B'));
    now += PENDING_MAX_AGE_MS + 1;
    await f.finish();
    expect(f.spoken).toEqual(['A']);
  });

  it('cooldown theo id', () => {
    const { f, t } = make();
    expect(t.say(cue('note_wrong', 'Sai', { cooldownMs: 2000 }))).toBe(true);
    now += 500;
    expect(t.say(cue('note_wrong', 'Sai', { cooldownMs: 2000 }))).toBe(false);
    now += 2000;
    expect(t.say(cue('note_wrong', 'Sai', { cooldownMs: 2000 }))).toBe(true);
    expect(f.spoken).toEqual(['Sai', 'Sai']);
  });

  it('không nói khi đang phát tiếng đàn mẫu, nói sau khi phát xong', () => {
    const quietUntil = 3000;
    const { f, t } = make(fakeSpeaker(), () => quietUntil);
    t.say(cue('step_start', 'Nghe xong rồi đánh nhé'));
    expect(f.spoken).toEqual([]);
    now = 3200;
    vi.advanceTimersByTime(quietUntil - 1000 + 200);
    expect(f.spoken).toEqual(['Nghe xong rồi đánh nhé']);
  });

  it('cancelAll khi đổi bài: huỷ câu đang đọc, câu chờ và hẹn giờ', async () => {
    let quiet = 0;
    const { f, t } = make(fakeSpeaker(), () => quiet);
    t.say(cue('lesson_start', 'Bài cũ'));
    t.say(cue('note_expected', 'Nốt bài cũ'));
    t.cancelAll();
    expect(f.cancelled).toEqual(['Bài cũ']);
    await f.finish();
    expect(f.spoken).toEqual(['Bài cũ']);
    expect(t.getState()).toMatchObject({ caption: null, speaking: false });

    quiet = 5000;
    t.say(cue('lesson_start', 'Chờ mẫu'));
    t.cancelAll();
    now = 6000;
    vi.runAllTimers();
    expect(f.spoken).toEqual(['Bài cũ']);
  });

  it('tắt giọng: chỉ hiện chữ, không phát', () => {
    const { f, t } = make();
    t.setConfig({ enabled: false });
    t.say(cue('lesson_start', 'Chào'));
    expect(f.spoken).toEqual([]);
    expect(t.getState().caption).toBe('Chào');
  });

  it('không có giọng tiếng Việt → silent, câu sau vẫn hiện', () => {
    const { t } = make(fakeSpeaker(false));
    t.say(cue('lesson_start', 'A'));
    t.say(cue('note_expected', 'B'));
    expect(t.getState()).toMatchObject({ caption: 'B', silent: true, speaking: false });
    expect(t.blocksMic(now)).toBe(false);
  });

  it('nghe lại câu gần nhất, bỏ qua cooldown', () => {
    const { f, t } = make();
    t.say(cue('note_wrong', 'Sai rồi', { cooldownMs: 99999 }));
    t.replay();
    expect(f.spoken).toEqual(['Sai rồi', 'Sai rồi']);
  });

  it('chặn nốt micro trong lúc nói và ngay sau đó', async () => {
    const { f, t } = make();
    t.say(cue('lesson_start', 'A'));
    expect(t.blocksMic(now)).toBe(true);
    now = 2000;
    await f.finish();
    expect(t.blocksMic(2000 + MIC_GUARD_MS - 1)).toBe(true);
    expect(t.blocksMic(2000 + MIC_GUARD_MS + 1)).toBe(false);
  });

  it('unlock một lần', () => {
    const { f, t } = make();
    t.unlock();
    t.unlock();
    expect(f.speaker.unlocked).toBe(1);
    expect(t.getState().unlocked).toBe(true);
  });
});
