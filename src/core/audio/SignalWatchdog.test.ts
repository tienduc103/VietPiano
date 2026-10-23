import { describe, expect, it } from 'vitest';
import { NO_SIGNAL_MS, SignalWatchdog } from './SignalWatchdog';

const noise = () => Float32Array.from({ length: 2048 }, (_, i) => (i % 7) * 1e-5);
const zeros = () => new Float32Array(2048);

describe('SignalWatchdog', () => {
  it('không có khung nào sau khi bật → chết sau NO_SIGNAL_MS', () => {
    const w = new SignalWatchdog();
    w.reset(1000);
    expect(w.isDead(1000 + NO_SIGNAL_MS - 1)).toBe(false);
    expect(w.isDead(1000 + NO_SIGNAL_MS)).toBe(true);
  });

  it('nhiễu nền nhỏ (khác 0) vẫn là có tín hiệu', () => {
    const w = new SignalWatchdog();
    w.reset(0);
    for (let t = 0; t <= 10_000; t += 23) w.frame(noise(), t);
    expect(w.isDead(10_000)).toBe(false);
    expect(w.silentFrames).toBe(0);
  });

  it('toàn mẫu 0 (track bị iOS tắt tiếng) → chết dù khung vẫn tới', () => {
    const w = new SignalWatchdog();
    w.reset(0);
    w.frame(noise(), 100);
    for (let t = 123; t <= 100 + NO_SIGNAL_MS; t += 23) w.frame(zeros(), t);
    expect(w.frames).toBeGreaterThan(100);
    expect(w.isDead(100 + NO_SIGNAL_MS)).toBe(true);
  });

  it('hasSignal: chỉ true sau khung có tín hiệu', () => {
    const w = new SignalWatchdog();
    w.reset(100);
    w.frame(zeros(), 120);
    expect(w.hasSignal).toBe(false);
    w.frame(noise(), 140);
    expect(w.hasSignal).toBe(true);
    w.reset(200);
    expect(w.hasSignal).toBe(false);
  });

  it('reset khi bật lại xoá trạng thái cũ', () => {
    const w = new SignalWatchdog();
    w.reset(0);
    expect(w.isDead(5000)).toBe(true);
    w.reset(5000);
    expect(w.isDead(5000 + NO_SIGNAL_MS - 1)).toBe(false);
    expect(w.frames).toBe(0);
  });
});
