import { describe, expect, it } from 'vitest';
import { resolveUiMode } from './uiMode';

describe('resolveUiMode', () => {
  it('auto theo tuổi hồ sơ; chọn tay thì theo cài đặt', () => {
    expect(resolveUiMode('auto', 5)).toBe('kids');
    expect(resolveUiMode('auto', 11)).toBe('kids');
    expect(resolveUiMode('auto', 12)).toBe('adult');
    expect(resolveUiMode('auto', null)).toBe('adult');
    expect(resolveUiMode('kids', 40)).toBe('kids');
    expect(resolveUiMode('adult', 5)).toBe('adult');
  });
});
