import { describe, expect, it } from 'vitest';
import { equationHolds, equationLabel, termBeats } from './noteValues';

describe('phép so sánh trường độ', () => {
  it('tính số phách của từng vế', () => {
    expect(termBeats({ count: 1, value: 'w' })).toBe(4);
    expect(termBeats({ count: 2, value: 'h' })).toBe(4);
    expect(termBeats({ count: 4, value: '16' })).toBe(1);
    expect(termBeats({ beats: 3 })).toBe(3);
  });

  it('nhận phép đúng, bắt phép sai', () => {
    expect(equationHolds({ left: { count: 1, value: 'w' }, right: { beats: 4 } })).toBe(true);
    expect(equationHolds({ left: { count: 2, value: '8' }, right: { count: 1, value: 'q' } })).toBe(true);
    expect(equationHolds({ left: { count: 2, value: 'q' }, right: { count: 1, value: 'w' } })).toBe(false);
  });

  it('ghi thành chữ', () => {
    expect(equationLabel({ left: { count: 2, value: 'h' }, right: { count: 1, value: 'w' } })).toBe('2 nốt trắng = 1 nốt tròn');
    expect(equationLabel({ left: { count: 1, value: 'w' }, right: { beats: 4 } })).toBe('1 nốt tròn = 4 phách');
  });
});
