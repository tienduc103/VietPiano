import { describe, expect, it } from 'vitest';
import { TempoFollower, noteOnsets } from './TempoFollower';
import { NoteRecognizer, type TimedPitchFrame } from '../audio/NoteRecognizer';
import { midiToFrequency } from '../music/notes';

/** 60 BPM → 1 nốt đen = 1000 ms, dễ tính. */
const BEAT = 1000;
const cfg = { bpm: 60, countInBeats: 4 };

/** Chạy đồng hồ từng 16 ms tới thời điểm `to`. */
function run(f: TempoFollower, from: number, to: number) {
  for (let t = from; t <= to; t += 16) f.tick(t);
  f.tick(to);
}

describe('TempoFollower — chạy theo nhịp', () => {
  it('vị trí bắt đầu của nốt tính từ trường độ', () => {
    expect(noteOnsets([1, 1, 2, 0.5, 0.5])).toEqual([0, 1, 2, 4, 4.5]);
  });

  it('nốt đầu tiên được đánh (cao độ bất kỳ) thì bắt đầu chạy', () => {
    const f = new TempoFollower([1, 1, 1], cfg);
    expect(f.getState().status).toBe('idle');
    expect(f.handleOnset(5000)).toBe('hit');
    expect(f.getState()).toMatchObject({ status: 'running', index: 0, hits: 1, startedAt: 5000 });
    expect(f.getState().results).toEqual(['correct', 'pending', 'pending']);
  });

  it('tự chạy đúng nhịp khi không ai đánh: nốt bị lỡ và hết bài', () => {
    const f = new TempoFollower([1, 1, 2], cfg);
    f.start(0);
    run(f, 0, 3 * BEAT);
    expect(f.getState()).toMatchObject({ status: 'countIn', beat: -1, index: 0 });
    run(f, 3 * BEAT, 4 * BEAT + 1100);
    expect(f.getState()).toMatchObject({ status: 'running', index: 1 });
    expect(f.getState().results).toEqual(['skipped', 'pending', 'pending']);
    run(f, 4 * BEAT + 1100, 4 * BEAT + 4000);
    expect(f.getState()).toMatchObject({ status: 'finished', missed: 3, hits: 0 });
  });

  it('đánh đúng lúc → tính là đã đánh và đúng nhịp', () => {
    const f = new TempoFollower([1, 1, 1, 1], cfg);
    f.handleOnset(0);
    for (let i = 1; i < 4; i++) {
      run(f, (i - 1) * BEAT, i * BEAT);
      expect(f.handleOnset(i * BEAT)).toBe('hit');
    }
    expect(f.getState()).toMatchObject({ hits: 4, onTime: 4, missed: 0, index: 3 });
    expect(f.getState().lastOffsetMs).toBeCloseTo(0);
    expect(f.getState().currentBpm).toBeCloseTo(60);
  });

  it('đánh nhanh hơn → đồng hồ tăng nhịp độ theo người chơi', () => {
    const f = new TempoFollower(Array(8).fill(1), cfg);
    f.handleOnset(0);
    // Người chơi giữ đều 80 BPM (750 ms mỗi nốt).
    for (let i = 1; i < 8; i++) {
      run(f, (i - 1) * 750, i * 750);
      expect(f.handleOnset(i * 750)).toBe('hit');
    }
    const s = f.getState();
    expect(s.missed).toBe(0);
    expect(s.currentBpm).toBeGreaterThan(72);
    expect(s.currentBpm).toBeLessThanOrEqual(80.5);
  });

  it('đánh chậm hơn → nhịp độ giảm nhưng không dưới giới hạn', () => {
    const f = new TempoFollower(Array(10).fill(1), { ...cfg, minRate: 0.7 });
    f.handleOnset(0);
    for (let i = 1; i < 10; i++) {
      run(f, (i - 1) * 1400, i * 1400);
      f.handleOnset(i * 1400);
    }
    expect(f.getState().currentBpm).toBeLessThan(55);
    expect(f.getState().currentBpm).toBeGreaterThanOrEqual(42 - 1e-9);
  });

  it('mỗi onset khớp tối đa một nốt; onset quá sát bị bỏ qua', () => {
    const f = new TempoFollower([0.5, 0.5, 0.5, 0.5], cfg);
    f.handleOnset(0);
    expect(f.handleOnset(30)).toBe('ignored');
    run(f, 0, 500);
    expect(f.handleOnset(500)).toBe('hit');
    expect(f.getState().hits).toBe(2);
    expect(f.getState().results).toEqual(['correct', 'correct', 'pending', 'pending']);
  });

  it('onset lạc giữa hai nốt dài không khớp nốt nào', () => {
    const f = new TempoFollower([4, 4], cfg);
    f.handleOnset(0);
    run(f, 0, 1500);
    expect(f.handleOnset(1500)).toBe('extra');
    expect(f.getState()).toMatchObject({ extra: 1, hits: 1, index: 0 });
  });

  it('đánh sớm một chút → con trỏ nhảy tới nốt vừa đánh và đồng hồ kéo lên', () => {
    const f = new TempoFollower([1, 1, 1], cfg);
    f.handleOnset(0);
    run(f, 0, 800);
    expect(f.handleOnset(800)).toBe('hit');
    expect(f.getState().index).toBe(1);
    expect(f.getState().lastOffsetMs).toBeCloseTo(-200);
    expect(f.positionAt(800)).toBeGreaterThan(0.8);
  });

  it('bỏ qua một nốt rồi đánh nốt sau → nốt bị bỏ tính là lỡ', () => {
    const f = new TempoFollower([1, 1, 1, 1], cfg);
    f.handleOnset(0);
    run(f, 0, 2000);
    expect(f.handleOnset(2000)).toBe('hit');
    expect(f.getState().results).toEqual(['correct', 'skipped', 'correct', 'pending']);
    expect(f.getState().missed).toBe(1);
  });

  it('đánh trong lúc đếm vào, sát phách đầu → khớp nốt đầu và bắt đầu chạy', () => {
    const f = new TempoFollower([1, 1], cfg);
    f.start(0);
    run(f, 0, 3800);
    expect(f.handleOnset(3800)).toBe('hit');
    expect(f.getState().status).toBe('running');
    run(f, 3800, 3900);
    expect(f.getState().status).toBe('running');
  });

  it('tạm dừng giữ nguyên vị trí, tiếp tục chạy từ đó', () => {
    const f = new TempoFollower([1, 1, 1], cfg);
    f.handleOnset(0);
    run(f, 0, 1200);
    f.pause(1200);
    run(f, 1200, 9000);
    expect(f.getState()).toMatchObject({ status: 'paused', index: 1 });
    expect(f.handleOnset(9000)).toBe('ignored');
    f.start(10_000);
    expect(f.positionAt(10_500)).toBeCloseTo(1.7);
  });

  it('đổi nhịp độ khi đang chạy không làm nhảy vị trí', () => {
    const f = new TempoFollower([1, 1, 1, 1], cfg);
    f.handleOnset(0);
    run(f, 0, 1000);
    f.setBpm(120, 1000);
    expect(f.positionAt(1000)).toBeCloseTo(1);
    expect(f.positionAt(1500)).toBeCloseTo(2);
    expect(f.getState().currentBpm).toBeCloseTo(120);
  });

  it('restart về trạng thái ban đầu', () => {
    const f = new TempoFollower([1, 1], cfg);
    f.handleOnset(0);
    f.restart();
    expect(f.getState()).toMatchObject({ status: 'idle', hits: 0, index: 0 });
  });
});

describe('Tích hợp NoteRecognizer + TempoFollower: không xét đúng sai cao độ', () => {
  const HOP = (1024 / 48000) * 1000;

  function sustained(midi: number, startMs: number, durationMs: number): TimedPitchFrame[] {
    const frames: TimedPitchFrame[] = [];
    for (let t = 0; t < durationMs; t += HOP) {
      const attack = Math.min(1, (t + HOP) / 30);
      frames.push({ time: startMs + t, frequency: midiToFrequency(midi), confidence: 0.95, rms: 0.2 * attack * Math.exp((-0.6 * t) / 1000) });
    }
    return frames;
  }

  it('giai điệu bất kỳ đánh đúng nhịp → mọi nốt đều được tính đã đánh', () => {
    const f = new TempoFollower([1, 1, 1, 1], cfg);
    const recognizer = new NoteRecognizer();
    // Bài cần C D E F nhưng người chơi đánh nốt khác hẳn.
    [67, 69, 60, 72].forEach((m, i) => {
      for (const frame of sustained(m, i * BEAT, BEAT)) {
        f.tick(frame.time);
        const out = recognizer.process(frame);
        if (out.noteOn) f.handleOnset(out.noteOn.time);
      }
    });
    f.tick(4 * BEAT + 500);
    expect(f.getState()).toMatchObject({ hits: 4, missed: 0, extra: 0 });
  });

  it('một nốt ngân dài không đẩy nhiều nốt', () => {
    const f = new TempoFollower([0.5, 0.5, 0.5, 0.5], cfg);
    const recognizer = new NoteRecognizer();
    for (const frame of sustained(60, 0, 2000)) {
      f.tick(frame.time);
      const out = recognizer.process(frame);
      if (out.noteOn) f.handleOnset(out.noteOn.time);
    }
    expect(f.getState().hits).toBe(1);
  });
});
