/**
 * Canh tín hiệu micro: iOS đôi khi cấp stream "câm" (track bị mute, AudioContext chạy nhưng
 * không có mẫu, hoặc toàn mẫu 0) — app vẫn báo micro đang bật mà không nghe được gì.
 * Micro thật luôn có nhiễu nền khác 0, nên khung toàn số 0 nghĩa là không có tín hiệu.
 * Logic thuần: thời gian truyền vào từ ngoài.
 */
export const NO_SIGNAL_MS = 2500;

export class SignalWatchdog {
  private since = 0;
  private lastSignal = 0;
  frames = 0;
  silentFrames = 0;

  constructor(private readonly timeoutMs = NO_SIGNAL_MS) {}

  /** Gọi khi micro bắt đầu chạy (hoặc chạy lại sau khi tạm dừng). */
  reset(now: number): void {
    this.since = now;
    this.lastSignal = now;
    this.frames = 0;
    this.silentFrames = 0;
  }

  frame(samples: Float32Array, now: number): void {
    this.frames++;
    for (let i = 0; i < samples.length; i++) {
      if (samples[i] !== 0) {
        this.lastSignal = now;
        return;
      }
    }
    this.silentFrames++;
  }

  /** true khi đã quá `timeoutMs` kể từ khung có tín hiệu gần nhất (hoặc từ lúc bắt đầu). */
  isDead(now: number): boolean {
    return now - Math.max(this.lastSignal, this.since) >= this.timeoutMs;
  }
}
