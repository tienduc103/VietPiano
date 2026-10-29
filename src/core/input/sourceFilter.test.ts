import { describe, expect, it } from 'vitest';
import { acceptSource, micOnlyInput } from './sourceFilter';

describe('acceptSource', () => {
  it('auto: ưu tiên đàn MIDI khi đã nối, không thì micro; bàn phím ảo luôn nhận', () => {
    expect(acceptSource('microphone', 'auto', false)).toBe(true);
    expect(acceptSource('microphone', 'auto', true)).toBe(false);
    expect(acceptSource('midi', 'auto', true)).toBe(true);
    expect(acceptSource('virtual', 'auto', true)).toBe(true);
  });

  it('chọn riêng một nguồn', () => {
    expect(acceptSource('midi', 'microphone', true)).toBe(false);
    expect(acceptSource('microphone', 'microphone', true)).toBe(true);
    expect(acceptSource('microphone', 'midi', false)).toBe(false);
    expect(acceptSource('virtual', 'midi', false)).toBe(true);
  });
});

describe('micOnlyInput (bài có phần đệm: micro → chỉ chấm tay phải)', () => {
  it('micro tắt → không phải chỉ micro (bàn phím ảo chấm được hai tay)', () => {
    expect(micOnlyInput('auto', false, false)).toBe(false);
    expect(micOnlyInput('microphone', false, false)).toBe(false);
  });
  it('micro bật: tự động → chỉ micro khi chưa nối đàn MIDI', () => {
    expect(micOnlyInput('auto', true, false)).toBe(true);
    expect(micOnlyInput('auto', true, true)).toBe(false);
  });
  it('micro bật: chọn hẳn nguồn', () => {
    expect(micOnlyInput('microphone', true, true)).toBe(true);
    expect(micOnlyInput('midi', true, false)).toBe(false);
  });
});
