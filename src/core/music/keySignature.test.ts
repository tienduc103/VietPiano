import { describe, expect, it } from 'vitest';
import { KEY_SIGNATURES, keyAlterations, keySignatureName, measureAccidentals, type KeySignature } from './keySignature';

describe('hoá biểu', () => {
  it('tên giọng tiếng Việt', () => {
    expect(keySignatureName('C')).toBe('Đô trưởng');
    expect(keySignatureName('D')).toBe('Rê trưởng');
    expect(keySignatureName('Am')).toBe('La thứ');
    expect(keySignatureName('F#m')).toBe('Fa thăng thứ');
    expect(keySignatureName('Bb')).toBe('Si giáng trưởng');
    expect(keySignatureName('C#')).toBe('Đô thăng trưởng');
    for (const key of Object.keys(KEY_SIGNATURES) as KeySignature[]) expect(keySignatureName(key)).toMatch(/^(Đô|Rê|Mi|Fa|Sol|La|Si)( thăng| giáng)? (trưởng|thứ)$/);
  });

  it('liệt kê dấu hoá theo đúng thứ tự', () => {
    expect(keyAlterations('C')).toEqual({});
    expect(keyAlterations('Em')).toEqual({ F: '#' });
    expect(keyAlterations('Dm')).toEqual({ B: 'b' });
    expect(keyAlterations('A')).toEqual({ F: '#', C: '#', G: '#' });
    expect(keyAlterations('Eb')).toEqual({ B: 'b', E: 'b', A: 'b' });
  });

  it('không vẽ dấu cho nốt đúng hoá biểu', () => {
    expect(measureAccidentals(['D5', 'C5', 'Bb4'], 'Dm')).toEqual([null, null, null]);
    expect(measureAccidentals(['G4', 'F#4', 'E4'], 'Em')).toEqual([null, null, null]);
  });

  it('vẽ dấu hoá bất thường và dấu hoàn khi trái hoá biểu', () => {
    expect(measureAccidentals(['C#5', 'Bb4', 'A4'], 'Dm')).toEqual(['#', null, null]);
    expect(measureAccidentals(['B4', 'F4'], 'Dm')).toEqual(['n', null]);
  });

  it('dấu hoá giữ hiệu lực tới hết ô nhịp, chỉ cho cùng quãng tám', () => {
    // Für Elise: Rê# rồi Rê thường trong cùng ô → cần dấu hoàn ở Rê thường
    expect(measureAccidentals(['E5', 'D#5', 'E5', 'B4', 'D5', 'C5'])).toEqual([null, '#', null, null, 'n', null]);
    expect(measureAccidentals(['D#5', 'D#5'])).toEqual(['#', null]);
    expect(measureAccidentals(['D#5', 'D#4'])).toEqual(['#', '#']);
  });
});
