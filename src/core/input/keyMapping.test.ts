import { describe, expect, it } from 'vitest';
import { chooseBaseC, keyToMidi, keyboardRange, keyHintsFor } from './keyMapping';
import { VirtualInputProvider } from './VirtualInputProvider';

describe('ánh xạ bàn phím máy tính', () => {
  it('A = Đô gốc, W = Đô#, K = Đô quãng tám trên', () => {
    expect(keyToMidi('a', 60)).toBe(60);
    expect(keyToMidi('W', 60)).toBe(61);
    expect(keyToMidi('k', 60)).toBe(72);
    expect(keyToMidi('q', 60)).toBeNull();
    expect(keyHintsFor(60).get(64)).toBe('d');
  });

  it('chọn Đô gốc bao nhiều nốt nhất', () => {
    expect(chooseBaseC([60, 62, 64, 67])).toBe(60);
    // Kìa con bướm vàng: G3..A4 → C4 bao nhiều nốt hơn C3
    expect(chooseBaseC([55, 60, 62, 64, 65, 67, 69])).toBe(60);
    expect(chooseBaseC([48, 50, 52, 55])).toBe(48);
  });

  it('phạm vi bàn phím tối thiểu hai quãng tám, bắt đầu từ Đô', () => {
    expect(keyboardRange([60, 64, 67])).toEqual({ from: 60, to: 83 });
    expect(keyboardRange([55, 69])).toEqual({ from: 48, to: 71 });
    expect(keyboardRange([48, 72])).toEqual({ from: 48, to: 83 });
  });
});

describe('VirtualInputProvider', () => {
  it('phát sự kiện khi bấm và ngừng khi stop()', async () => {
    const p = new VirtualInputProvider();
    const got: number[] = [];
    const unsub = p.onNote((e) => got.push(e.midi));
    p.press(60);
    await p.stop();
    p.press(62);
    await p.start();
    p.press(64);
    unsub();
    p.press(65);
    expect(got).toEqual([60, 64]);
  });
});
