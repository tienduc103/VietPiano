import { describe, expect, it } from 'vitest';
import { HAPPY_BIRTHDAY_LESSONS } from '../lessons/arrangements/happyBirthday';
import { accompanimentByNote, harmonyMidis } from '../lessons/types';
import { practiceTrack } from './handPractice';
import { DEFAULT_PRACTICE_CONFIG, PracticeEngine } from './PracticeEngine';
import { frequentMistakes, handAccuracy, handSplitMidi, measureErrorsFrom, stepMeasures, WaitTally } from './waitBreakdown';

const intermediate = HAPPY_BIRTHDAY_LESSONS[1];

describe('Chờ nốt hai tay — chấm từng tay, ô hay sai', () => {
  const left = accompanimentByNote(intermediate)!;
  const extras = intermediate.notes.map((n, i) => [...harmonyMidis(n), ...left[i].midis]);
  const track = practiceTrack(intermediate, 'both', false)!;

  function setup() {
    const engine = new PracticeEngine(track.steps.map((s) => s.midis[0]), { ...DEFAULT_PRACTICE_CONFIG, twoHands: true }, extras);
    const tally = new WaitTally(intermediate, 'both', left.map((s) => s.midis));
    let time = 1000;
    const press = (midi: number) => {
      const before = engine.getState();
      engine.handleNote(midi, (time += 500));
      tally.record(before, engine.getState(), midi);
    };
    return { engine, tally, press };
  }

  it('điểm chia hai tay nằm giữa nốt cao nhất tay trái và nốt thấp nhất tay phải', () => {
    // Tay trái cao nhất Đô4 (60), tay phải thấp nhất Mi4 (64).
    expect(handSplitMidi(intermediate)).toBe(62);
  });

  it('đánh đúng hết → mỗi tay 100%; phím sai vùng thấp tính cho tay trái, vùng cao cho tay phải', () => {
    const { engine, tally, press } = setup();
    // Bước 0 (ô lấy đà, chỉ tay phải): sai một phím cao (A5) rồi đúng.
    press(81);
    press(67);
    // Bước 1: tay phải G4, tay trái nghỉ.
    press(67);
    // Bước 2 (ô 1 phách 1): A4 + Đô3 — sai tay trái (C#3) trước.
    press(49);
    press(48);
    press(69);
    expect(engine.getState().index).toBe(3);
    const t = tally.handTallies();
    expect(t.right).toEqual({ correct: 3, wrong: 1 });
    expect(t.left).toEqual({ correct: 1, wrong: 1 });
    expect(handAccuracy(t.right)).toBe(0.75);
    expect(handAccuracy({ correct: 0, wrong: 0 })).toBeNull();
    // Lỗi theo ô: bước 0 ở ô 0 (lấy đà), bước 2 ở ô 1.
    const measures = stepMeasures(intermediate, track);
    expect(measures.slice(0, 5)).toEqual([0, 0, 1, 1, 1]);
    expect(measureErrorsFrom(tally.wrongPerStep(), engine.getState().results, measures)).toEqual({ 0: 1, 1: 1 });
  });

  it('phím bị bỏ qua (không đổi trạng thái) không tính; bỏ qua bước thì tính lỗi cho ô', () => {
    const { engine, tally, press } = setup();
    press(67);
    press(67); // cách lần chuyển nốt trước 500 ms (> 120 ms) nên được nhận: bước 1 đúng
    expect(tally.handTallies().right.correct).toBe(2);
    engine.skip(10_000);
    const measures = stepMeasures(intermediate, track);
    expect(measureErrorsFrom(tally.wrongPerStep(), engine.getState().results, measures)).toEqual({ 1: 1 });
  });

  it('lịch sử: gộp lỗi theo ô của nhiều phiên, ô nhiều lỗi trước', () => {
    expect(frequentMistakes([{ 5: 2, 6: 1 }, undefined, { 5: 1, 3: 4 }])).toEqual([
      { measure: 3, total: 4 },
      { measure: 5, total: 3 },
      { measure: 6, total: 1 },
    ]);
    expect(frequentMistakes([{ 2: 1, 3: 1 }], 1)).toEqual([{ measure: 2, total: 1 }]);
  });
});
