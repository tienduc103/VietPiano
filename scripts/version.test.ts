import { describe, expect, it } from 'vitest';
import { nextVersion, parseVersion, vnTimestamp } from './version.ts';

const NOW = new Date('2026-10-20T07:35:07Z');

describe('nextVersion', () => {
  it('chưa có phiên bản → 1.01', () => {
    expect(nextVersion(null, NOW)).toBe('1.01.261020.143507');
  });

  it.each([
    ['1.01.250101.000000', '1.02'],
    ['1.09.250101.000000', '1.10'],
    ['1.99.250101.000000', '2.01'],
    ['2.99.250101.000000', '3.01'],
    ['12.42.250101.000000', '12.43'],
  ])('%s → %s', (current, expected) => {
    expect(nextVersion(current, NOW)).toBe(`${expected}.261020.143507`);
  });

  it.each(['0.1.0', '1.00.261020.143507', '1.1.261020.143507', '01.02.261020.143507', '1.02.26102.143507', '1.02.261020.14350', '0.01.261020.143507', '', 'dev'])(
    'từ chối "%s"',
    (bad) => {
      expect(() => parseVersion(bad)).toThrow();
      expect(() => nextVersion(bad, NOW)).toThrow();
    },
  );
});

describe('vnTimestamp', () => {
  it('đổi sang giờ Việt Nam (UTC+7)', () => {
    expect(vnTimestamp(new Date('2026-10-20T07:35:07Z'))).toBe('261020.143507');
  });

  it('qua ngày và qua năm', () => {
    expect(vnTimestamp(new Date('2026-12-31T17:00:00Z'))).toBe('270101.000000');
  });

  it('dạng 24 giờ', () => {
    expect(vnTimestamp(new Date('2026-03-05T16:59:59Z'))).toBe('260305.235959');
  });
});
