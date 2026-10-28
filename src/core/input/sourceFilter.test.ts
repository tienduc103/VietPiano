import { describe, expect, it } from 'vitest';
import { acceptSource } from './sourceFilter';

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
