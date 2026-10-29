import { describe, expect, it } from 'vitest';
import { durationQuality, PerformanceTracker, timedSections, timingQuality, type TimedNote } from './PerformanceTracker';

/** 60 bpm → 1 nốt đen = 1000 ms; bắt đầu lúc t = 0, đếm vào 4 phách → phách 0 ở t = 4000. */
const BEAT = 1000;
const T0 = 4000;
const at = (beat: number) => T0 + beat * BEAT;

function quarters(midis: (number | null)[]): TimedNote[] {
  return midis.map((midi, i) => ({ startBeat: i, durationBeats: 1, midi }));
}

function started(notes: TimedNote[], config = {}) {
  const t = new PerformanceTracker(notes, { bpm: 60, countInBeats: 4, ...config });
  t.start(0);
  return t;
}

describe('PerformanceTracker', () => {
  it('đếm vào rồi chạy; gõ đúng phách + đúng nốt → correct, lệch thời điểm được ghi', () => {
    const t = started(quarters([60, 62, 64, 65]));
    t.tick(1000);
    expect(t.getState().status).toBe('countIn');
    expect(t.getState().beat).toBeCloseTo(-3);
    expect(t.handleNoteOn(60, at(0) + 40)).toBe('hit');
    expect(t.getState().status).toBe('running');
    expect(t.handleNoteOn(62, at(1) - 100)).toBe('hit');
    const s = t.getState();
    expect(s.results.slice(0, 2)).toEqual(['correct', 'correct']);
    expect(s.offsetsMs[0]).toBeCloseTo(40);
    expect(s.offsetsMs[1]).toBeCloseTo(-100);
  });

  it('sai cao độ đúng thời điểm → wrong (vẫn ghi lệch nhịp), không cho chấm lại nốt đó', () => {
    const t = started(quarters([60, 62]));
    expect(t.handleNoteOn(61, at(0))).toBe('wrong');
    // Gõ lại ngay trong cửa sổ: nốt 0 đã chấm → cửa sổ nốt 1 chưa tới → gõ thừa.
    expect(t.handleNoteOn(60, at(0) + 200)).toBe('extra');
    expect(t.getState().results[0]).toBe('wrong');
    expect(t.getState().playedMidis[0]).toBe(61);
    expect(t.getState().extras).toBe(1);
  });

  it('mỗi onset chấm tối đa một nốt; onset quá sát onset trước bị bỏ qua', () => {
    const t = started(quarters([60, 60, 60]));
    expect(t.handleNoteOn(60, at(0))).toBe('hit');
    expect(t.handleNoteOn(60, at(0) + 30)).toBe('ignored');
    expect(t.getState().results).toEqual(['correct', 'pending', 'pending']);
  });

  it('không gõ → nốt bị lỡ khi đồng hồ đi qua cửa sổ; hết bài → finished', () => {
    const t = started(quarters([60, 62, 64]));
    t.handleNoteOn(60, at(0));
    t.tick(at(1.6));
    expect(t.getState().results).toEqual(['correct', 'skipped', 'pending']);
    t.tick(at(3.6));
    expect(t.getState().status).toBe('finished');
    const r = t.result();
    expect(r).toMatchObject({ notes: 3, correct: 1, missed: 2, completion: 1 / 3 });
    expect(r.pitchAccuracy).toBeCloseTo(1 / 3);
  });

  it('dấu lặng không chấm; gõ giữa dấu lặng là gõ thừa', () => {
    const t = started(quarters([60, null, null, 62]));
    t.handleNoteOn(60, at(0));
    expect(t.handleNoteOn(60, at(1.5))).toBe('extra');
    expect(t.handleNoteOn(62, at(3))).toBe('hit');
    t.tick(at(4.6));
    const r = t.result();
    expect(r.notes).toBe(2);
    expect(r.extras).toBe(1);
    // Hai nốt đúng phách, một lần gõ thừa → 2 / (2 + 1).
    expect(r.timing).toBeCloseTo(2 / 3);
    expect(t.getState().results[1]).toBe('pending');
  });

  it('bài tiết tấu (checkPitch = false): nốt nào cũng đúng', () => {
    const t = started(quarters([60, 60]), { checkPitch: false });
    expect(t.handleNoteOn(72, at(0))).toBe('hit');
    expect(t.handleNoteOn(55, at(1))).toBe('hit');
  });

  it('gõ trong lúc đếm vào (xa nốt đầu) bị bỏ qua, không tính thừa', () => {
    const t = started(quarters([60]));
    expect(t.handleNoteOn(60, 1500)).toBe('ignored');
    expect(t.getState().extras).toBe(0);
    // Gõ sớm một chút trước phách 0 vẫn khớp nốt đầu.
    expect(t.handleNoteOn(60, at(0) - 120)).toBe('hit');
  });

  it('Note Off → tỉ lệ giữ phím; không có Note Off (micro) → điểm trường độ null', () => {
    const notes: TimedNote[] = [
      { startBeat: 0, durationBeats: 2, midi: 60 },
      { startBeat: 2, durationBeats: 2, midi: 62 },
    ];
    const t = started(notes);
    t.handleNoteOn(60, at(0));
    t.handleNoteOff(60, at(1.8));
    t.handleNoteOn(62, at(2));
    t.handleNoteOff(62, at(2.5)); // nhả quá sớm: 0.25 trường độ
    t.tick(at(5));
    expect(t.getState().heldRatios[0]).toBeCloseTo(0.9);
    expect(t.getState().heldRatios[1]).toBeCloseTo(0.25);
    expect(t.result().duration).toBeCloseTo((1 + durationQuality(0.25)) / 2);

    const mic = started(notes);
    mic.handleNoteOn(60, at(0));
    mic.handleNoteOn(62, at(2));
    mic.tick(at(5));
    expect(mic.result().duration).toBeNull();
  });

  it('tạm dừng giữ vị trí; chạy tiếp thì đếm vào lại từ chỗ dừng', () => {
    const t = started(quarters([60, 62, 64, 65]));
    t.handleNoteOn(60, at(0));
    t.pause(at(0.8));
    expect(t.getState().status).toBe('paused');
    // Lúc dừng không nhận nốt.
    expect(t.handleNoteOn(62, 20000)).toBe('ignored');
    t.start(30000); // đếm vào 4 phách → phách 0.8 ở t = 34000
    expect(t.getState().status).toBe('countIn');
    expect(t.handleNoteOn(62, 34200)).toBe('hit');
    expect(t.getState().offsetsMs[1]).toBeCloseTo(0);
  });

  it('đổi nhịp độ giữa chừng giữ nguyên vị trí', () => {
    const t = started(quarters([60, 62, 64, 65]));
    t.tick(at(1));
    t.setBpm(120, at(1));
    // Phách 2 tới sau 500 ms ở nhịp 120.
    expect(t.handleNoteOn(64, at(1) + 500)).toBe('hit');
    expect(t.getState().offsetsMs[2]).toBeCloseTo(0);
  });

  it('restart xoá hết kết quả', () => {
    const t = started(quarters([60]));
    t.handleNoteOn(60, at(0));
    t.restart();
    expect(t.getState()).toMatchObject({ status: 'idle', extras: 0 });
    expect(t.getState().results).toEqual(['pending']);
  });

  it('bài không có nốt nào cần chơi → lỗi', () => {
    expect(() => new PerformanceTracker(quarters([null]))).toThrow();
  });
});

describe('điểm thời điểm / trường độ', () => {
  it('trọn điểm trong onTimeMs, về 0 ở mép cửa sổ', () => {
    expect(timingQuality(100, 150, 500)).toBe(1);
    expect(timingQuality(-325, 150, 500)).toBeCloseTo(0.5);
    expect(timingQuality(600, 150, 500)).toBe(0);
  });

  it('giữ phím 60–125% trường độ là trọn điểm', () => {
    expect(durationQuality(0.9)).toBe(1);
    expect(durationQuality(0.35)).toBeCloseTo(0.5);
    expect(durationQuality(2)).toBe(0);
  });
});

describe('PerformanceTracker — sắc thái mạnh nhẹ', () => {
  const marked = (): TimedNote[] =>
    quarters([60, 62, 64, 65, 67, 65, 64, 62]).map((n, i) => ({ ...n, dynamic: i < 4 ? ('p' as const) : ('f' as const) }));

  it('timedSections gộp nốt liền nhau cùng sắc thái', () => {
    expect(timedSections(marked())).toEqual([
      { mark: 'p', from: 0, to: 4 },
      { mark: 'f', from: 4, to: 8 },
    ]);
    expect(timedSections(quarters([60, 62]))).toEqual([]);
  });

  it('đoạn f to hơn đoạn p → dynamics 1; đều tiếng → 0; không truyền độ to → null', () => {
    const run = (db: (i: number) => number | null) => {
      const t = started(marked());
      marked().forEach((n, i) => t.handleNoteOn(n.midi!, at(i), db(i)));
      t.tick(at(10));
      return t.result();
    };
    expect(run((i) => (i < 4 ? -20 : -12)).dynamics).toBe(1);
    expect(run(() => -20).dynamics).toBe(0);
    expect(run(() => null).dynamics).toBeNull();
    expect(run((i) => (i < 4 ? -20 : -12)).pitchAccuracy).toBe(1);
  });

  it('bài không có dấu sắc thái → không có trường dynamics', () => {
    const t = started(quarters([60, 62]));
    t.handleNoteOn(60, at(0), -10);
    t.handleNoteOn(62, at(1), -10);
    t.tick(at(4));
    expect('dynamics' in t.result()).toBe(false);
  });
});
