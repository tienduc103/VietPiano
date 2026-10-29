import { describe, expect, it } from 'vitest';
import { pedalIntervals, pedalQuality, sustainUnderPedal, type PedalEvent } from './pedal';

/** Chuỗi sự kiện từ các lần đạp [down, up]. */
const presses = (...ivs: [number, number][]): PedalEvent[] => ivs.flatMap(([d, u]) => [{ beat: d, down: true }, { beat: u, down: false }]);
// Valse 3/4, thay pedal mỗi ô: [0,3] [3,6] [6,9].
const PER_MEASURE = [0, 3, 6].map((s) => ({ startBeat: s, endBeat: s + 3 }));

describe('pedal', () => {
  it('ghép sự kiện thành các lần đạp; bỏ đạp/nhả lặp; chưa nhả → Infinity', () => {
    const ev: PedalEvent[] = [{ beat: 0, down: true }, { beat: 0.5, down: true }, { beat: 2, down: false }, { beat: 2.1, down: false }, { beat: 3, down: true }];
    expect(pedalIntervals(ev)).toEqual([{ down: 0, up: 2 }, { down: 3, up: Infinity }]);
  });

  it('pedal nối đúng kỹ thuật (nhả rồi đạp lại ngay sau phách đầu ô) → trọn điểm', () => {
    expect(pedalQuality(PER_MEASURE, presses([0.2, 3.1], [3.3, 6.1], [6.3, 9.4]), 9)).toBe(1);
    // Đạp sẵn trước khi vào bài, chưa nhả khi hết bài cũng được.
    expect(pedalQuality(PER_MEASURE, [...presses([-1, 3.1], [3.3, 6.1]), { beat: 6.3, down: true }], 9)).toBe(1);
  });

  it('giữ pedal suốt không thay → chỉ được nửa điểm khoảng đầu', () => {
    expect(pedalQuality(PER_MEASURE, presses([0.2, 9.2]), 9)).toBeCloseTo(0.5 / 3, 9);
  });

  it('không đạp → 0; nhả quá sớm → mất nửa điểm khoảng đó', () => {
    expect(pedalQuality(PER_MEASURE, [], 9)).toBe(0);
    expect(pedalQuality(PER_MEASURE, presses([0.2, 1.5], [3.3, 6.1], [6.3, 9]), 9)).toBeCloseTo(2.5 / 3, 9);
  });

  it('đạp quá muộn (sau phách 2) không khớp ký hiệu và thành đạp thừa', () => {
    expect(pedalQuality(PER_MEASURE, presses([1.8, 3.1], [3.3, 6.1], [6.3, 9]), 9)).toBeCloseTo(2 / 4, 9);
  });

  it('đạp thừa ngoài ký hiệu bị trừ; chạm nhầm rất ngắn thì bỏ qua', () => {
    const one = [{ startBeat: 0, endBeat: 4 }];
    expect(pedalQuality(one, presses([0.2, 4.1], [6, 8]), 8)).toBe(0.5);
    expect(pedalQuality(one, presses([0.2, 4.1], [6, 6.1]), 8)).toBe(1);
    // Bài không có ký hiệu: không đạp = trọn điểm.
    expect(pedalQuality([], [], 8)).toBe(1);
  });

  it('phát mẫu: nốt trong khoảng pedal ngân tới hết khoảng', () => {
    const notes = [{ startBeat: 0, durationBeats: 1 }, { startBeat: 1, durationBeats: 1 }, { startBeat: 3, durationBeats: 1 }, { startBeat: 5, durationBeats: 1 }];
    expect(sustainUnderPedal(notes, [{ startBeat: 0, endBeat: 3 }, { startBeat: 3, endBeat: 4 }]).map((n) => n.durationBeats)).toEqual([3, 2, 1, 1]);
  });
});
