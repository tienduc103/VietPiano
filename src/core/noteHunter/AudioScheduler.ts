/**
 * AudioScheduler — lên lịch tiếng đàn tự phát của trò Săn nốt theo đồng hồ của `NoteHunterGame`.
 *
 * Lên lịch trước ngắn (`lookaheadMs`) và KHÔNG BAO GIỜ vượt `game.stopBeat()` (đầu mục tiêu đang chờ / sắp tới):
 * khi đồng hồ dừng ở mục tiêu, không có nốt phía sau nào đã được đặt lịch để lộ ra. Tạm dừng → huỷ mọi nốt
 * (cả nốt đang kêu); nốt chưa kịp kêu được lên lịch lại khi chạy tiếp, nốt đã kêu thì không phát lại.
 * Nốt mục tiêu không bao giờ tự phát (người chơi đánh) → không có hai tiếng trùng nhau.
 *
 * Ghi lại các nốt đã phát (`recentPlayback`) để lọc tiếng vọng: micro nghe thấy loa của chính app.
 */
import type { NoteHunterGame } from './NoteHunterGame';
import { songMeasureBeats } from './songs';

export interface ScheduledVoice {
  cancel(): void;
}

export interface ScheduleOutput {
  playNote(midi: number, delayMs: number, durationMs: number, velocity: number): ScheduledVoice;
  click(delayMs: number, accent: boolean): ScheduledVoice;
}

export interface PlaybackRecord {
  midi: number;
  /** ms, cùng gốc performance.now(). */
  start: number;
  end: number;
}

interface Entry {
  voice: ScheduledVoice;
  start: number;
  record?: PlaybackRecord;
}

export class AudioScheduler {
  private entries = new Map<string, Entry>();
  private played: PlaybackRecord[] = [];

  constructor(
    private readonly output: ScheduleOutput,
    private readonly opts: { lookaheadMs: number; countIn: boolean } = { lookaheadMs: 150, countIn: true },
  ) {}

  /** Gọi mỗi khung hình sau `game.tick(now)`. */
  update(game: NoteHunterGame, now: number): void {
    const { status } = game.getState();
    if (status === 'IDLE') return this.reset(now);
    if (status === 'PAUSED') return this.cancel(now, true);
    if (status !== 'PLAYING') return this.cancel(now, false);

    const from = game.positionAt(now);
    const stop = game.stopBeat();
    const horizon = Math.min(game.positionAt(now + this.opts.lookaheadMs), stop);
    const msPerBeat = game.msPerBeat;

    if (this.opts.countIn) {
      const lead = game.leadInBeats;
      const perMeasure = songMeasureBeats(game.song);
      for (let b = Math.ceil(from - 1e-6); b < Math.min(0, horizon); b++) {
        if (b < -lead) continue;
        const key = `click:${b}`;
        if (this.entries.has(key)) continue;
        const at = game.timeAtBeat(b);
        this.entries.set(key, { voice: this.output.click(Math.max(0, at - now), (b + lead) % perMeasure === 0), start: at });
      }
    }

    for (const n of game.song.notes) {
      if (n.startBeat >= horizon) break;
      if (n.midiNumber === null || game.targetNoteIndices.has(n.index)) continue;
      const key = `note:${n.index}`;
      // Đã qua đầu nốt mà chưa phát (chạy tiếp giữa chừng) → bỏ, không phát muộn.
      if (this.entries.has(key) || n.startBeat < from - 1e-6) continue;
      const at = game.timeAtBeat(n.startBeat);
      const durationMs = (Math.min(n.startBeat + n.durationBeats, stop) - n.startBeat) * msPerBeat;
      const record = { midi: n.midiNumber, start: at, end: at + durationMs };
      this.entries.set(key, { voice: this.output.playNote(n.midiNumber, Math.max(0, at - now), durationMs, n.velocity), start: at, record });
      this.played.push(record);
    }
  }

  /**
   * Huỷ nốt chưa kêu (để lên lịch lại); `all` = dừng luôn nốt đang kêu (tạm dừng).
   * Nốt đã kêu vẫn giữ dấu đã phát → chạy tiếp không phát lại.
   */
  private cancel(now: number, all: boolean): void {
    for (const [key, e] of this.entries) {
      if (e.start > now) {
        e.voice.cancel();
        this.entries.delete(key);
        if (e.record) this.played = this.played.filter((r) => r !== e.record);
      } else if (all) {
        e.voice.cancel();
        if (e.record && e.record.end > now) e.record.end = now;
      }
    }
  }

  /** Dừng mọi âm thanh, quên lịch đã đặt (về đầu bài). */
  reset(now = Infinity): void {
    for (const e of this.entries.values()) {
      e.voice.cancel();
      if (e.record && e.record.end > now) e.record.end = now;
    }
    this.entries.clear();
  }

  /** Ghi thêm tiếng app phát ngoài lịch (vd tiếng phím ảo) để lọc tiếng vọng. */
  notePlayed(record: PlaybackRecord): void {
    this.played.push(record);
  }

  /** Các nốt app đã/đang phát còn trong khoảng `keepMs` trước `now`. */
  recentPlayback(now: number, keepMs = 3000): PlaybackRecord[] {
    this.played = this.played.filter((r) => r.end > now - keepMs);
    return this.played;
  }

  /** Số nốt đang được giữ lịch (cho test). */
  scheduledKeys(): string[] {
    return [...this.entries.keys()];
  }
}

/** Độ lệch MIDI giữa nốt micro nghe được và nốt loa phát mà có thể là cùng một âm (âm cơ bản, hoạ âm 2–4, quãng 8 dưới). */
const ECHO_INTERVALS = new Set([0, 12, 19, 24, -12]);

/**
 * Nốt micro nghe được có khả năng là tiếng loa của chính app không: trùng (hoặc là hoạ âm của) một nốt app đang
 * phát / vừa tắt chưa quá `tailMs`. Nốt KHÁC cao độ vẫn được nhận dù loa đang kêu — người chơi đánh mục tiêu
 * ngay lúc nốt trước còn ngân. Không hoàn hảo (vọng phòng, loa méo) → khuyên dùng tai nghe / MIDI.
 */
export function isLikelyEcho(midi: number, time: number, played: readonly PlaybackRecord[], tailMs = 450): boolean {
  return played.some((p) => time >= p.start - 30 && time <= p.end + tailMs && ECHO_INTERVALS.has(midi - p.midi));
}
