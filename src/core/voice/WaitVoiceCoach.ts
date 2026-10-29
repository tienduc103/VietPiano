/**
 * WaitVoiceCoach — nối tiến trình Wait Mode (`PracticeState`) với cô giáo giọng nói. Thuần, không React:
 * nhận ảnh chụp state sau mỗi thay đổi (`update`), tự quyết định nói gì.
 *
 *  - Bắt đầu: lời dặn của bài + nốt đầu tiên.
 *  - Đúng nốt: khen (không phải lần nào cũng khen — bé chơi nhanh thì cô không nói liên tục); nốt kế tiếp
 *    chỉ đọc nếu bé chưa đánh sau `hintDelayMs` (chơi nhanh thì không bị nhắc).
 *  - Sai nốt: nhắc nhẹ, sai tiếp → chỉ vị trí phím → chỉ phím sáng màu; `helpLevel` tăng để màn hình
 *    hiện gợi ý rõ hơn. Không chê, không phạt.
 *  - Không thao tác `remindAfterMs`: nhắc lại (tối đa `maxReminders` lần, cách nhau dài dần).
 *  - Xong bài: chúc mừng.
 * Không chặn xử lý nốt: `update` được gọi sau khi engine đã xử lý xong (effect của React).
 */
import type { PracticeState } from '../practice/PracticeEngine';
import { overrideCue, phrases, type NoteTarget } from './phrases';
import type { VoiceCue } from './types';

export interface WaitCoachOptions {
  /** Tự đọc hướng dẫn (lời dặn, nốt cần đánh, nhắc khi chưa đánh). */
  autoRead: boolean;
  /** Khen khi đúng / chúc mừng khi xong. */
  encourage: boolean;
  /** Nhắc lại sau chừng này ms không thao tác; 0 = tắt. */
  remindAfterMs: number;
  hintDelayMs: number;
  maxReminders: number;
  /** Khen sau mỗi chừng này nốt đúng liên tiếp (ngoài lần đúng đầu tiên và lần sửa được nốt sai). */
  praiseEvery: number;
}

export const DEFAULT_WAIT_COACH: WaitCoachOptions = {
  autoRead: true,
  encourage: true,
  remindAfterMs: 10_000,
  hintDelayMs: 1500,
  maxReminders: 3,
  praiseEvery: 4,
};

/** 0 = bình thường, 1 = gợi ý thêm, 2 = chỉ thẳng phím (hiện bàn phím, phím nhấp nháy). */
export type HelpLevel = 0 | 1 | 2;

type Say = (cue: VoiceCue) => unknown;

export class WaitVoiceCoach {
  private prev: PracticeState | null = null;
  private wrongStreak = 0;
  private correctStreak = 0;
  private praiseCount = 0;
  private reminders = 0;
  private hintTimer: ReturnType<typeof setTimeout> | null = null;
  private remindTimer: ReturnType<typeof setTimeout> | null = null;
  private help: HelpLevel = 0;
  private disposed = false;

  constructor(
    private readonly say: Say,
    private readonly targets: readonly NoteTarget[],
    private readonly title: string,
    private readonly opts: WaitCoachOptions = DEFAULT_WAIT_COACH,
    private readonly custom?: readonly VoiceCue[],
    private readonly onHelp?: (level: HelpLevel) => void,
  ) {}

  get helpLevel(): HelpLevel {
    return this.help;
  }

  start(state: PracticeState): void {
    this.prev = state;
    if (this.opts.autoRead) {
      this.say(overrideCue(phrases.playStart(this.title), this.custom));
      this.sayExpected(state.index);
    }
    this.armReminder(this.opts.remindAfterMs);
  }

  update(state: PracticeState): void {
    const prev = this.prev;
    this.prev = state;
    if (!prev || this.disposed || state === prev) return;

    if (state.status === 'finished') {
      if (prev.status !== 'finished') {
        this.clearTimers();
        this.setHelp(0);
        if (this.opts.encourage) this.say(overrideCue(phrases.exerciseComplete(), this.custom));
      }
      return;
    }

    if (state.index !== prev.index || prev.status === 'finished') {
      const result = state.index > prev.index ? state.results[prev.index] : null;
      this.wrongStreak = 0;
      this.reminders = 0;
      this.setHelp(0);
      if (result === 'correct' || result === 'corrected') this.onCorrect(result === 'corrected');
      if (result === null) {
        // Lùi nốt / chơi lại: đọc ngay nốt cần đánh.
        if (this.opts.autoRead) this.sayExpected(state.index);
      } else this.scheduleHint(state.index);
      this.armReminder(this.opts.remindAfterMs);
      return;
    }

    if (state.wrong > prev.wrong) {
      this.correctStreak = 0;
      this.wrongStreak++;
      this.setHelp(this.wrongStreak >= 3 ? 2 : this.wrongStreak >= 2 ? 1 : 0);
      const t = this.targets[state.index];
      if (t) this.say(overrideCue(phrases.noteWrong(t, this.wrongStreak, state.wrong), this.custom));
      this.armReminder(this.opts.remindAfterMs);
    } else if (state.lastEventTime !== prev.lastEventTime) {
      // Có thao tác (vd một tay trong bài hai tay) → hoãn lời nhắc.
      this.armReminder(this.opts.remindAfterMs);
    }
  }

  dispose(): void {
    this.disposed = true;
    this.clearTimers();
  }

  private onCorrect(corrected: boolean): void {
    this.correctStreak++;
    if (!this.opts.encourage) return;
    if (corrected || this.correctStreak === 1 || this.correctStreak % this.opts.praiseEvery === 0) {
      this.say(overrideCue(phrases.noteCorrect(this.praiseCount++), this.custom));
    }
  }

  private sayExpected(index: number): void {
    const t = this.targets[index];
    if (t) this.say(overrideCue(phrases.noteExpected(t), this.custom));
  }

  private scheduleHint(index: number): void {
    if (this.hintTimer !== null) clearTimeout(this.hintTimer);
    this.hintTimer = null;
    if (!this.opts.autoRead) return;
    this.hintTimer = setTimeout(() => {
      this.hintTimer = null;
      if (this.prev?.index === index && this.prev.status !== 'finished') this.sayExpected(index);
    }, this.opts.hintDelayMs);
  }

  private armReminder(ms: number): void {
    if (this.remindTimer !== null) clearTimeout(this.remindTimer);
    this.remindTimer = null;
    if (!this.opts.autoRead || this.opts.remindAfterMs <= 0 || this.reminders >= this.opts.maxReminders) return;
    this.remindTimer = setTimeout(() => {
      this.remindTimer = null;
      const s = this.prev;
      if (!s || s.status === 'finished' || this.disposed) return;
      this.reminders++;
      if (this.reminders >= 2) this.setHelp(Math.max(this.help, 1) as HelpLevel);
      const t = this.targets[s.index];
      if (t) this.say(overrideCue(phrases.timeout(t, this.reminders), this.custom));
      this.armReminder(Math.round(ms * 1.5));
    }, ms);
  }

  private setHelp(level: HelpLevel): void {
    if (level === this.help) return;
    this.help = level;
    this.onHelp?.(level);
  }

  private clearTimers(): void {
    if (this.hintTimer !== null) clearTimeout(this.hintTimer);
    if (this.remindTimer !== null) clearTimeout(this.remindTimer);
    this.hintTimer = this.remindTimer = null;
  }
}
