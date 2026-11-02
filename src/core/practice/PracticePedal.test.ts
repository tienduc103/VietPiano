import { describe, expect, it } from 'vitest';
import { PracticePedal, stepPedalRanges, waitPedalPosition } from './PracticePedal';

/** Bốn ô, mỗi ô 2 nốt trắng trong 4/4: các bước bắt đầu ở phách 0, 2, 4…; pedal thay mỗi ô. */
const stepStarts = [0, 2, 4, 6, 8, 10, 12, 14];
const beatRanges = [0, 4, 8, 12].map((s) => ({ startBeat: s, endBeat: s + 4 }));
const ranges = stepPedalRanges(beatRanges, stepStarts);
const STEPS = stepStarts.length;

describe('PracticePedal — Chờ nốt / Đếm nốt (trục số bước)', () => {
  it('khoảng theo phách → theo bước; khoảng không có bước của tay đang tập bị bỏ', () => {
    expect(ranges).toEqual([
      { startBeat: 0, endBeat: 2 },
      { startBeat: 2, endBeat: 4 },
      { startBeat: 4, endBeat: 6 },
      { startBeat: 6, endBeat: 8 },
    ]);
    expect(stepPedalRanges(beatRanges, [0, 2, 12, 14])).toEqual([
      { startBeat: 0, endBeat: 2 },
      { startBeat: 2, endBeat: 4 },
    ]);
  });

  /** Thay pedal đúng kỹ thuật: đánh nốt đầu ô rồi mới nhả + đạp lại. */
  function perfect(p: PracticePedal) {
    for (const firstStep of [0, 2, 4, 6]) {
      const pos = waitPedalPosition(firstStep + 1, STEPS, false);
      p.handle(false, pos);
      p.handle(true, pos);
    }
  }

  it('thay pedal sau nốt đầu mỗi ô → 100%, dù dừng bao lâu cũng không đổi', () => {
    const p = new PracticePedal();
    perfect(p);
    expect(p.score(ranges, STEPS)).toBe(1);
  });

  it('không đạp lần nào → 0', () => {
    expect(new PracticePedal().score(ranges, STEPS)).toBe(0);
  });

  it('đạp một lần giữ suốt bài → chỉ đúng ô đầu một nửa', () => {
    const p = new PracticePedal();
    p.handle(true, waitPedalPosition(0, STEPS, false));
    expect(p.score(ranges, STEPS)).toBeCloseTo(0.5 / 4, 9);
  });

  it('đạp thừa giữa ô, kéo dài qua nốt khác → tính vào mẫu số', () => {
    const p = new PracticePedal();
    perfect(p);
    p.handle(false, 7.5);
    const clean = p.score(ranges, STEPS);
    p.handle(true, 7.6);
    p.handle(false, 9);
    expect(p.score(ranges, STEPS)).toBeLessThan(clean);
  });

  it('nốt cuối bài: đạp ngay sau khi đánh (bài đã "xong") vẫn được tính', () => {
    const single = stepPedalRanges([{ startBeat: 0, endBeat: 4 }], [0]);
    const p = new PracticePedal();
    p.handle(true, waitPedalPosition(0, 1, true));
    expect(p.score(single, 1)).toBe(1);
  });

  it('đang nghe mẫu: cập nhật trạng thái nhưng không chấm', () => {
    const p = new PracticePedal();
    p.handle(true, 0.5, false);
    expect(p.getState().down).toBe(true);
    p.handle(false, 1.5, false);
    expect(p.score(ranges, STEPS)).toBe(0);
  });

  it('lùi nốt: bỏ sự kiện phía sau; chân đang đạp thì vẫn tính từ vị trí đó', () => {
    const p = new PracticePedal();
    p.handle(true, 0.5);
    p.handle(false, 2.5);
    p.handle(true, 2.5);
    p.rewind(0.5);
    expect(p.getState().down).toBe(true);
    p.handle(false, 2.5);
    p.handle(true, 2.5);
    p.handle(false, 4.5);
    p.handle(true, 4.5);
    p.handle(false, 6.5);
    p.handle(true, 6.5);
    expect(p.score(ranges, STEPS)).toBe(1);
  });

  it('lượt mới: xoá sự kiện, chân đang đạp được tính là đạp sẵn', () => {
    const p = new PracticePedal();
    p.handle(true, 3);
    p.reset(-0.5);
    p.handle(false, 2.5);
    p.handle(true, 2.5);
    p.handle(false, 4.5);
    p.handle(true, 4.5);
    p.handle(false, 6.5);
    p.handle(true, 6.5);
    expect(p.score(ranges, STEPS)).toBe(1);
  });
});

describe('PracticePedal — Theo nhịp (trục phách thật)', () => {
  it('thay pedal ngay sau đầu mỗi ô → 100%', () => {
    const p = new PracticePedal();
    p.handle(true, 0.2);
    for (const bar of [4, 8, 12]) {
      p.handle(false, bar + 0.1);
      p.handle(true, bar + 0.2);
    }
    expect(p.score(beatRanges, 16)).toBe(1);
  });
});
