import { describe, expect, it } from 'vitest';
import { LESSONS } from '../lessons/library';
import { displayChordSymbol, parseChordSymbol } from './chordSymbols';

/** Lớp cao độ của hợp âm, tăng dần (thứ tự trong `tones` không quan trọng). */
const tones = (symbol: string) => [...parseChordSymbol(symbol).tones].sort((a, b) => a - b);

describe('ký hiệu hợp âm', () => {
  it('nốt gốc + dấu thăng / giáng (Cb, B# vòng qua quãng tám)', () => {
    expect(parseChordSymbol('C')).toEqual({ root: 0, bass: 0, tones: [0, 4, 7] });
    expect(parseChordSymbol('Bb').root).toBe(10);
    expect(parseChordSymbol('F#m').root).toBe(6);
    expect(parseChordSymbol('Cb').root).toBe(11);
    expect(parseChordSymbol('B#').root).toBe(0);
  });

  it('các loại hợp âm hỗ trợ', () => {
    expect(tones('Am')).toEqual([0, 4, 9]);
    expect(tones('Bdim')).toEqual([2, 5, 11]);
    expect(tones('Gsus4')).toEqual([0, 2, 7]);
    expect(tones('G7')).toEqual([2, 5, 7, 11]);
    expect(tones('Dm7')).toEqual([0, 2, 5, 9]);
    expect(tones('Cmaj7')).toEqual([0, 4, 7, 11]);
    expect(tones('C6')).toEqual([0, 4, 7, 9]);
    expect(tones('Am6')).toEqual([0, 4, 6, 9]);
    expect(tones('G9')).toEqual([2, 5, 7, 9, 11]);
    expect(tones('Cadd9')).toEqual([0, 2, 4, 7]);
  });

  it('hợp âm có nốt trầm "/": nốt trầm luôn nằm trong tones, kể cả khi không thuộc hợp âm', () => {
    expect(parseChordSymbol('G7/B')).toMatchObject({ root: 7, bass: 11 });
    expect(tones('G7/B')).toEqual([2, 5, 7, 11]);
    expect(parseChordSymbol('C7/Bb')).toMatchObject({ root: 0, bass: 10 });
    expect(parseChordSymbol('Fm/Ab')).toMatchObject({ root: 5, bass: 8 });
    expect(tones('Fm/Ab')).toEqual([0, 5, 8]);
    expect(parseChordSymbol('C/D')).toMatchObject({ root: 0, bass: 2 });
    expect(tones('C/D')).toEqual([0, 2, 4, 7]);
  });

  it('ký hiệu sai / chưa hỗ trợ → báo lỗi', () => {
    for (const bad of ['', 'H', 'c', 'C/', 'C/H', 'CM7', 'C7/Bbb']) expect(() => parseChordSymbol(bad), bad).toThrow('không hợp lệ');
    expect(() => parseChordSymbol('Cm9')).toThrow('Chưa hỗ trợ loại hợp âm "m9"');
  });

  it('mọi ký hiệu hợp âm trong thư viện bài đều đọc được', () => {
    const symbols = LESSONS.flatMap((l) => (l.chordSymbols ?? []).map((c) => c.symbol));
    expect(symbols.length).toBeGreaterThan(0);
    for (const s of symbols) expect(() => parseChordSymbol(s), s).not.toThrow();
  });

  it('hiển thị dấu hoá bằng ký tự nhạc, không đụng chữ thường của loại hợp âm', () => {
    expect(displayChordSymbol('Bb')).toBe('B♭');
    expect(displayChordSymbol('F#m')).toBe('F♯m');
    expect(displayChordSymbol('C7/Bb')).toBe('C7/B♭');
    expect(displayChordSymbol('Fm/Ab')).toBe('Fm/A♭');
    expect(displayChordSymbol('G7/B')).toBe('G7/B');
    expect(displayChordSymbol('Cadd9')).toBe('Cadd9');
  });
});
