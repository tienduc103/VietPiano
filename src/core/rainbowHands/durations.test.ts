import { describe, expect, it } from 'vitest';
import { RainbowEngine } from './RainbowEngine';
import { buildRoute, DEFAULT_STARTS } from './route';
import { summarize, roundPassed } from './analysis';
import { durationAt, holdEnough, RHYTHM_PATTERNS, RHYTHM_PATTERN_IDS, cardNotation } from './durations';

describe('Trường độ', () => {
  it('mẫu tiết tấu: 5 loại nốt, chu kỳ tròn phách, gán theo bước', () => {
    expect(RHYTHM_PATTERNS.mix.cycle).toEqual(expect.arrayContaining(['w', 'h', 'q', '8', '16']));
    for (const id of RHYTHM_PATTERN_IDS) {
      const beats = RHYTHM_PATTERNS[id].cycle.reduce((s, d) => s + ({ w: 4, h: 2, q: 1, '8': 0.5, '16': 0.25 })[d], 0);
      expect(Number.isInteger(beats)).toBe(true);
    }
    expect([0, 1, 2, 3].map((i) => durationAt('h-q-q', i))).toEqual(['h', 'q', 'q', 'h']);
    const route = buildRoute({ hands: 'right', path: 'round', starts: DEFAULT_STARTS, rhythm: 'h-q-q' });
    expect(route.map((s) => s.beats).slice(0, 4)).toEqual([2, 1, 1, 2]);
    expect(buildRoute({ hands: 'right', path: 'round', starts: DEFAULT_STARTS })[0]).toMatchObject({ beats: 1 });
    expect(cardNotation('C4', 'q')).toBe('C4');
    expect(cardNotation('C4', '16')).toBe('C4/16');
  });

  it('giữ đủ: nốt dài cần ≥ 75%, nốt ngắn được nhả sớm ~120 ms', () => {
    expect(holdEnough(3000, 4000)).toBe(true);
    expect(holdEnough(2900, 4000)).toBe(false);
    expect(holdEnough(130, 250)).toBe(true);
    expect(holdEnough(90, 250)).toBe(false);
  });
});

describe('RainbowEngine — giữ nhịp với trường độ', () => {
  const beat = 500; // 120 bpm
  const make = (rhythm: 'h-q-q' | 'q-8-8') =>
    new RainbowEngine(buildRoute({ hands: 'right', path: 'up', starts: DEFAULT_STARTS, rhythm }), { timing: 'tempo', bpm: 120, countInBeats: 4, rounds: 1 });

  it('phách của bước theo trường độ: trắng 2 phách, đen 1 phách; cửa sổ co theo nốt ngắn', () => {
    const e = make('h-q-q');
    e.start(0);
    const t0 = 4 * beat;
    expect(e.getRecords().map((r) => r.beatTime! - t0).slice(0, 5)).toEqual([0, 1000, 1500, 2000, 3000]);
    expect(e.halfWindow(0)).toBe(250);
    const q8 = make('q-8-8');
    expect([q8.halfWindow(1), q8.halfWindow(2), q8.halfWindow(3)]).toEqual([125, 125, 125]);
    // Metronome: đếm vào 4 + 12 phách của 8 bước (2+1+1+2+1+1+2+1 = 11 → làm tròn lên 11).
    expect(e.beatTimes()).toHaveLength(4 + 11);
  });

  it('giữ phím: đủ / nhả sớm / micro không đo / thả lúc đạp pedal không tính nhả sớm', () => {
    const e = make('h-q-q');
    e.start(0);
    const t0 = 4 * beat;
    e.noteOn(60, t0, 'midi');
    e.noteOff(60, t0 + 900); // trắng = 1000 ms, giữ 900 → đủ
    e.noteOn(62, t0 + 1000, 'midi');
    e.noteOff(62, t0 + 1200); // đen = 500 ms, giữ 200 → nhả sớm
    e.setPedal(true);
    e.noteOn(64, t0 + 1500, 'midi');
    e.noteOff(64, t0 + 1600); // thả lúc đạp pedal → không đo
    e.setPedal(false);
    e.noteOn(65, t0 + 2000, 'microphone'); // micro: không có Note Off
    e.tick(t0 + 9000);
    const holds = e.getRecords().slice(0, 4).map((r) => r.hands.right!.hold);
    expect(holds).toEqual(['full', 'short', 'pedal', null]);
    const s = summarize(e.getRecords());
    expect(s.hands.right).toMatchObject({ holdFull: 1, holdShort: 1, holdUnmeasured: 2 });
    // 1/2 lần đo được giữ đủ < 70% → vòng chưa đạt.
    expect(roundPassed(s, true, 'tempo', { accuracy: 0, onTime: 0 })).toBe(true);
    expect(roundPassed(s, true, 'tempo', { accuracy: 0, onTime: 0.7 })).toBe(false);
  });

  it('nốt dài: chờ tới nốt sau KHÔNG hiện lại đếm vào', () => {
    const e = new RainbowEngine(buildRoute({ hands: 'right', path: 'up', starts: DEFAULT_STARTS, rhythm: 'w' }), { timing: 'tempo', bpm: 120, countInBeats: 4, rounds: 1 });
    e.start(0);
    const t0 = 4 * beat;
    e.noteOn(60, t0, 'midi');
    for (const t of [t0 + 300, t0 + 1000, t0 + 1600]) {
      e.tick(t);
      expect(e.getState()).toMatchObject({ status: 'playing', countdown: null });
    }
    expect(e.getState().index).toBe(1);
  });

  it('nốt móc đơn: cửa sổ hẹp → bấm sang phách sau là của bước sau, không bị tính hai lần', () => {
    const e = make('q-8-8');
    e.start(0);
    const t0 = 4 * beat;
    expect(e.noteOn(60, t0, 'midi')).toBe('hit');
    e.noteOff(60, t0 + 400);
    // Rê (móc đơn) ở t0+500, Mi ở t0+750.
    expect(e.noteOn(62, t0 + 560, 'midi')).toBe('hit');
    e.noteOff(62, t0 + 700);
    expect(e.noteOn(64, t0 + 760, 'midi')).toBe('hit');
    const [, r1, r2] = e.getRecords();
    expect(r1.hands.right).toMatchObject({ timing: 'on-time', hold: 'full' });
    expect(r2.hands.right!.timing).toBe('on-time');
  });
});
