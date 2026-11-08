import { describe, expect, it } from 'vitest';
import { MetronomeClock } from './metronome';

const clock = (patch: Partial<ConstructorParameters<typeof MetronomeClock>[0]> = {}) =>
  new MetronomeClock({ originMs: 1000, beatMs: 500, beatsPerMeasure: 4, pickup: 0, countInBeats: 4, ...patch });

describe('MetronomeClock — lên lịch tiếng click trước', () => {
  it('đếm vào = phách âm; mỗi phách lên lịch đúng một lần, chỉ trong cửa sổ nhìn trước', () => {
    const c = clock();
    // Đếm vào bắt đầu ở 1000 − 4 × 500 = −1000.
    expect(c.due(-1000, 120).map((x) => [x.beat, x.atMs, x.countIn, x.accent])).toEqual([[-4, -1000, true, true]]);
    expect(c.due(-990, 120)).toEqual([]);
    expect(c.due(-560, 120).map((x) => x.beat)).toEqual([-3]);
    // Khung hình chậm: lên lịch các phách tới hạn, KHÔNG phát dồn phách đã trễ quá 40 ms.
    expect(c.due(450, 120).map((x) => x.beat)).toEqual([-1]);
    expect(c.due(900, 120).map((x) => [x.beat, x.countIn])).toEqual([[0, false]]);
  });

  it('huỷ tiếng click đã lên lịch → lên lịch lại từ phách đó (trừ phách đã trễ)', () => {
    const c = clock({ countInBeats: 0 });
    expect(c.due(1000, 600).map((x) => x.beat)).toEqual([0, 1]);
    c.rewind(1);
    expect(c.due(1010, 600).map((x) => x.beat)).toEqual([1]);
    // Huỷ từ phách 0 lúc 1100: phách 0 đã trễ quá 40 ms → bỏ, phách 1 lên lịch lại.
    c.rewind(0);
    expect(c.due(1100, 600).map((x) => x.beat)).toEqual([1]);
  });

  it('phách mạnh: theo số phách / ô và ô lấy đà (như metronome cũ)', () => {
    const c = clock({ pickup: 1 });
    const accents = [0, 1, 2, 3, 4, 5].map((b) => c.isAccent(b));
    expect(accents).toEqual([false, true, false, false, false, true]);
    // 3/8 = 1,5 phách nốt đen / ô → phách mạnh ở 0, 3, 6…
    const c38 = clock({ beatsPerMeasure: 1.5 });
    expect([0, 1, 2, 3, 6].map((b) => c38.isAccent(b))).toEqual([true, false, false, true, true]);
  });

  it('đếm vào lẻ (3/8 → 1,5 phách) chỉ phát phách nguyên −1 như cũ; lớp phủ đếm ngược', () => {
    const c = clock({ countInBeats: 1.5 });
    expect(c.due(-10_000, 1_000_000).map((x) => x.beat).slice(0, 2)).toEqual([-1, 0]);
    const d = clock();
    expect(d.countInLeft(-1000)).toBe(4);
    expect(d.countInLeft(600)).toBe(1);
    expect(d.countInLeft(1000)).toBeNull();
    expect(clock({ countInBeats: 0 }).countInLeft(900)).toBeNull();
  });
});
