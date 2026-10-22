import { describe, expect, it } from 'vitest';
import { NoteRecognizer, isHarmonicallyRelated, type TimedPitchFrame } from './NoteRecognizer';
import { midiToFrequency } from '../music/notes';

const HOP_MS = (1024 / 48000) * 1000; // ≈ 21.3 ms giữa hai khung

/** Bộ dựng kịch bản: nối các đoạn âm thanh theo thời gian. */
class Timeline {
  frames: TimedPitchFrame[] = [];
  private t = 0;

  /** Một nốt piano: attack nhanh rồi tắt dần theo hàm mũ. */
  note(midi: number, durationMs: number, { peak = 0.2, decayPerSec = 1.2, cents = 0 } = {}): this {
    const f = midiToFrequency(midi) * Math.pow(2, cents / 1200);
    const start = this.t;
    while (this.t - start < durationMs) {
      const age = (this.t - start) / 1000;
      // Khung đầu đã có ~70% năng lượng: không có "khoảng lặng giả" giữa hai nốt liền nhau.
      const attack = Math.min(1, (this.t - start + HOP_MS) / 30);
      const rms = peak * attack * Math.exp(-decayPerSec * age);
      this.frames.push({ time: this.t, frequency: f, confidence: 0.95, rms });
      this.t += HOP_MS;
    }
    return this;
  }

  /** Đoạn có năng lượng nhưng cao độ đổi (vd hoạ âm nổi lên khi tắt dần). */
  pitch(midi: number, durationMs: number, rms: number): this {
    const start = this.t;
    while (this.t - start < durationMs) {
      this.frames.push({ time: this.t, frequency: midiToFrequency(midi), confidence: 0.92, rms });
      this.t += HOP_MS;
    }
    return this;
  }

  silence(durationMs: number): this {
    const start = this.t;
    while (this.t - start < durationMs) {
      this.frames.push({ time: this.t, frequency: null, confidence: 0, rms: 0.001 });
      this.t += HOP_MS;
    }
    return this;
  }

  noisyBurst(durationMs: number, rms = 0.05): this {
    const start = this.t;
    while (this.t - start < durationMs) {
      this.frames.push({ time: this.t, frequency: null, confidence: 0.3, rms });
      this.t += HOP_MS;
    }
    return this;
  }
}

function run(frames: TimedPitchFrame[], recognizer = new NoteRecognizer()): number[] {
  const out: number[] = [];
  for (const f of frames) {
    const r = recognizer.process(f);
    if (r.noteOn) out.push(r.noteOn.midi);
  }
  return out;
}

describe('NoteRecognizer', () => {
  it('phát đúng một sự kiện cho một nốt đơn', () => {
    expect(run(new Timeline().note(60, 800).frames)).toEqual([60]);
  });

  it('âm ngân kéo dài 4 giây chỉ tạo MỘT sự kiện', () => {
    expect(run(new Timeline().note(60, 4000, { decayPerSec: 0.5 }).frames)).toEqual([60]);
  });

  it('không chấp nhận cao độ thoáng qua ngắn hơn stableMs', () => {
    // Chỉ 2 khung (~42 ms) rồi im lặng
    expect(run(new Timeline().pitch(64, 40, 0.1).silence(300).frames)).toEqual([]);
  });

  it('đánh lại cùng nốt sau khoảng lặng → hai sự kiện', () => {
    expect(run(new Timeline().note(60, 500).silence(150).note(60, 500).frames)).toEqual([60, 60]);
  });

  it('đánh lại cùng nốt khi nốt trước còn ngân (onset) → hai sự kiện', () => {
    // Nốt đầu tắt dần tới ~0.2*e^-1.5 ≈ 0.045, nốt sau đánh lên 0.2
    expect(run(new Timeline().note(60, 1200, { decayPerSec: 1.2 }).note(60, 600).frames)).toEqual([60, 60]);
  });

  it('chuyển sang nốt khác khi nốt trước còn ngân → nhận nốt mới', () => {
    expect(run(new Timeline().note(60, 600).note(62, 600).note(64, 600).frames)).toEqual([60, 62, 64]);
  });

  it('hoạ âm quãng 8 nổi lên khi tắt dần KHÔNG bị tính là nốt mới', () => {
    const tl = new Timeline().note(48, 700).pitch(60, 800, 0.03);
    expect(run(tl.frames)).toEqual([48]);
  });

  it('hoạ âm quãng 12 (19 nửa cung) trong đuôi âm không bị tính', () => {
    const tl = new Timeline().note(48, 700).pitch(67, 800, 0.03);
    expect(run(tl.frames)).toEqual([48]);
  });

  it('legato: đổi sang nốt không liên quan hoạ âm mà không có onset vẫn được nhận sau legatoStableMs', () => {
    const tl = new Timeline().note(60, 600).pitch(62, 400, 0.05);
    expect(run(tl.frames)).toEqual([60, 62]);
  });

  it('bỏ qua tiếng ồn không có cao độ', () => {
    expect(run(new Timeline().noisyBurst(500).silence(200).frames)).toEqual([]);
  });

  it('bỏ qua âm thanh dưới noise gate', () => {
    expect(run(new Timeline().note(60, 600, { peak: 0.004 }).frames)).toEqual([]);
  });

  it('bỏ qua cao độ lệch quá maxCentsDeviation', () => {
    const r = new NoteRecognizer({ maxCentsDeviation: 30 });
    expect(run(new Timeline().note(60, 600, { cents: 40 }).frames, r)).toEqual([]);
  });

  it('dao động năng lượng nhỏ (beating) trong âm ngân không bị coi là onset', () => {
    const tl = new Timeline().note(60, 300);
    // Đuôi âm cùng cao độ, năng lượng dao động ±20% quanh 0.08
    for (let i = 0; i < 80; i++) tl.pitch(60, HOP_MS, 0.08 * (1 + 0.2 * Math.sin(i / 3)));
    expect(run(tl.frames)).toEqual([60]);
  });

  it('beating nhanh hơn (chu kỳ ~130 ms, ±15%) cũng không bị coi là onset', () => {
    const tl = new Timeline().note(60, 300);
    for (let i = 0; i < 100; i++) tl.pitch(60, HOP_MS, 0.08 * (1 + 0.15 * Math.sin(i)));
    expect(run(tl.frames)).toEqual([60]);
  });

  it('đánh lại cùng nốt khi nốt trước còn ~70% năng lượng vẫn được nhận', () => {
    const tl = new Timeline().note(60, 600, { decayPerSec: 0.6 }).note(60, 600, { decayPerSec: 0.6 });
    expect(run(tl.frames)).toEqual([60, 60]);
  });

  it('hỗ trợ A4 tuỳ chỉnh', () => {
    const r = new NoteRecognizer({ a4: 446 });
    // 446 Hz là A4 với a4=446; với a4=440 thì lệch +23.5 cents nhưng vẫn là A4
    expect(run(new Timeline().pitch(69, 300, 0.1).frames, r)).toEqual([69]);
  });

  it('reset() cho phép nhận lại ngay', () => {
    const r = new NoteRecognizer();
    const tl = new Timeline().note(60, 2000, { decayPerSec: 0.3 });
    const half = Math.floor(tl.frames.length / 2);
    expect(run(tl.frames.slice(0, half), r)).toEqual([60]);
    r.reset();
    expect(run(tl.frames.slice(half), r)).toEqual([60]);
  });

  it('nhận diện quan hệ hoạ âm', () => {
    expect(isHarmonicallyRelated(48, 60)).toBe(true);
    expect(isHarmonicallyRelated(60, 48)).toBe(true);
    expect(isHarmonicallyRelated(48, 67)).toBe(true);
    expect(isHarmonicallyRelated(60, 62)).toBe(false);
  });
});
