import { describe, expect, it } from 'vitest';
import { nameToMidi } from '../music/notes';
import { clefPitches, clefRange, ledgerLines, letterOf, positionText, QUIZ_CLEFS, staffStep } from './staff';

const m = (n: string) => nameToMidi(n)!;

describe('vị trí nốt trên khuông theo khoá', () => {
  it('khoá Sol: Mi4 dòng 1, Sol4 dòng 2, Fa5 dòng 5, Đô4 dòng kẻ phụ dưới', () => {
    expect(staffStep(m('E4'), 'treble')).toBe(0);
    expect(staffStep(m('G4'), 'treble')).toBe(2);
    expect(staffStep(m('B4'), 'treble')).toBe(4);
    expect(staffStep(m('F5'), 'treble')).toBe(8);
    expect(staffStep(m('C4'), 'treble')).toBe(-2);
  });
  it('khoá Fa: Sol2 dòng 1, Fa3 dòng 4 (dấu khoá), La3 dòng 5, Đô4 dòng kẻ phụ trên', () => {
    expect(staffStep(m('G2'), 'bass')).toBe(0);
    expect(staffStep(m('F3'), 'bass')).toBe(6);
    expect(staffStep(m('A3'), 'bass')).toBe(8);
    expect(staffStep(m('C4'), 'bass')).toBe(10);
  });
  it('khoá Đô Alto: Đô4 ở dòng giữa (dòng 3)', () => {
    expect(staffStep(m('F3'), 'alto')).toBe(0);
    expect(staffStep(m('C4'), 'alto')).toBe(4);
    expect(staffStep(m('G4'), 'alto')).toBe(8);
  });
  it('khoá Đô Tenor: Đô4 ở dòng 4', () => {
    expect(staffStep(m('D3'), 'tenor')).toBe(0);
    expect(staffStep(m('C4'), 'tenor')).toBe(6);
    expect(staffStep(m('E4'), 'tenor')).toBe(8);
  });
  it('dòng kẻ phụ', () => {
    expect([-1, 0, 8, 9].map(ledgerLines)).toEqual([0, 0, 0, 0]);
    expect([-2, -3, -4, 10, 11, 12].map(ledgerLines)).toEqual([1, 1, 2, 1, 1, 2]);
  });
  it('giải thích vị trí bằng lời', () => {
    expect(positionText(m('E4'), 'treble')).toBe('nằm trên dòng kẻ thứ 1');
    expect(positionText(m('F4'), 'treble')).toBe('nằm ở khe thứ 1');
    expect(positionText(m('D4'), 'treble')).toBe('nằm ngay dưới dòng kẻ thứ 1');
    expect(positionText(m('C4'), 'treble')).toBe('nằm trên dòng kẻ phụ thứ 1 dưới khuông');
    expect(positionText(m('C4'), 'alto')).toBe('nằm trên dòng kẻ thứ 3');
    expect(positionText(m('B5'), 'treble')).toBe('nằm trên dòng kẻ phụ thứ 1 trên khuông');
  });
});

describe('dải nốt của khoá', () => {
  it('mỗi khoá đủ 7 tên nốt trong một quãng tám, 14 nốt trong hai quãng tám', () => {
    for (const c of QUIZ_CLEFS) {
      expect(new Set(clefPitches(c, 1).map(letterOf)).size).toBe(7);
      expect(clefPitches(c, 1)).toHaveLength(7);
      expect(clefPitches(c, 2)).toHaveLength(14);
    }
  });
  it('một quãng tám không cần quá 1 dòng kẻ phụ, hai quãng tám không quá 3', () => {
    for (const c of QUIZ_CLEFS) {
      expect(Math.max(...clefPitches(c, 1).map((p) => ledgerLines(staffStep(p, c))))).toBeLessThanOrEqual(1);
      expect(Math.max(...clefPitches(c, 2).map((p) => ledgerLines(staffStep(p, c))))).toBeLessThanOrEqual(3);
    }
  });
  it('khoá Sol bắt đầu từ Đô giữa', () => {
    expect(clefRange('treble', 1)).toEqual({ from: 60, to: 71 });
    expect(clefRange('bass', 2)).toEqual({ from: 36, to: 59 });
  });
});
