import { describe, expect, it } from 'vitest';
import { dynamicAt, dynamicSections, dynamicsQuality, FULL_STEP_DB, loudnessDb } from './dynamics';

describe('loudnessDb', () => {
  it('velocity MIDI ưu tiên; micro dùng RMS; bàn phím ảo → null', () => {
    expect(loudnessDb({ velocity: 127 })).toBeCloseTo(0);
    expect(loudnessDb({ velocity: 100 })! - loudnessDb({ velocity: 50 })!).toBeCloseTo(40 * Math.log10(2));
    expect(loudnessDb({ level: 0.1 })).toBeCloseTo(-20);
    expect(loudnessDb({ velocity: 90, level: 0.1 })).toBeCloseTo(40 * Math.log10(90 / 127));
    expect(loudnessDb({})).toBeNull();
    expect(loudnessDb({ level: 0 })).toBeNull();
  });
});

describe('dynamicSections / dynamicAt', () => {
  it('chia đoạn theo dấu; nốt trước dấu đầu không có sắc thái', () => {
    const marks = [
      { index: 4, mark: 'f' as const },
      { index: 1, mark: 'p' as const },
    ];
    expect(dynamicSections(marks, 8)).toEqual([
      { mark: 'p', from: 1, to: 4 },
      { mark: 'f', from: 4, to: 8 },
    ]);
    expect(dynamicAt(marks, 6)).toEqual([undefined, 'p', 'p', 'p', 'f', 'f']);
  });
});

describe('dynamicsQuality', () => {
  const sections = dynamicSections(
    [
      { index: 0, mark: 'p' },
      { index: 4, mark: 'f' },
      { index: 8, mark: 'p' },
    ],
    12,
  );
  const all = Array(12).fill(true);
  const levels = (p: number, f: number) => [p, p, p, p, f, f, f, f, p, p, p, p];

  it('đoạn f to hơn đoạn p ≥ FULL_STEP_DB ở cả hai chỗ đổi → 1', () => {
    expect(dynamicsQuality(sections, levels(-20, -20 + FULL_STEP_DB), all)).toBe(1);
  });

  it('đều tiếng → 0; ngược chiều → 0; chênh nửa mức → 0.5', () => {
    expect(dynamicsQuality(sections, levels(-20, -20), all)).toBe(0);
    expect(dynamicsQuality(sections, levels(-10, -20), all)).toBe(0);
    expect(dynamicsQuality(sections, levels(-20, -20 + FULL_STEP_DB / 2), all)).toBeCloseTo(0.5);
  });

  it('so sánh tương đối: cả bài to/nhỏ hơn (micro xa gần) không đổi điểm', () => {
    expect(dynamicsQuality(sections, levels(-40, -36), all)).toBe(1);
    expect(dynamicsQuality(sections, levels(-6, -2), all)).toBe(1);
  });

  it('dùng trung vị: một nốt lạc trong đoạn không làm hỏng điểm', () => {
    const l = levels(-20, -14);
    l[1] = -5; // một nốt p lỡ tay đánh mạnh
    expect(dynamicsQuality(sections, l, all)).toBe(1);
  });

  it('không đo được (bàn phím ảo / quá ít nốt) → null; dấu lặng không tính', () => {
    expect(dynamicsQuality(sections, Array(12).fill(null), all)).toBeNull();
    const one = levels(-20, -14).map((v, i) => (i === 4 ? v : i < 4 ? v : null));
    expect(dynamicsQuality(sections, one, all)).toBeNull();
    // Đoạn f chỉ có một nốt đánh được (còn lại là dấu lặng) → một nốt là đủ.
    const playable = all.map((_, i) => i < 5 || i >= 8);
    expect(dynamicsQuality(sections, levels(-20, -14).map((v, i) => (playable[i] ? v : null)), playable)).toBe(1);
  });

  it('chỉ một sắc thái → không có chỗ đổi → null', () => {
    expect(dynamicsQuality(dynamicSections([{ index: 0, mark: 'mf' }], 4), [-1, -1, -1, -1], [true, true, true, true])).toBeNull();
  });
});
