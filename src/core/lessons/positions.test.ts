import { describe, expect, it } from 'vitest';
import { HAPPY_BIRTHDAY_MELODY } from './arrangements/happyBirthday';
import { parseNotes } from './notation';
import { measureIndexAtBeat, measureIndexOf, measureStarts, noteIndexAt, noteStarts, printedMeasure } from './positions';
import type { Lesson } from './types';

type Shape = Pick<Lesson, 'notes' | 'timeSignature' | 'pickup'>;

/** Giai điệu Happy Birthday: 3/4, lấy đà 1 phách (móc đơn chấm + móc kép). */
const birthday: Shape = { notes: parseNotes(HAPPY_BIRTHDAY_MELODY), timeSignature: [3, 4], pickup: 1 };
/** 4/4 không lấy đà. */
const plain: Shape = { notes: parseNotes('C4 D4 E4 F4 | G4/h G4/h'), timeSignature: [4, 4] };
/** 3/8 lấy đà nửa phách (như Für Elise) — phách luôn tính theo nốt đen. */
const eighths: Shape = {
  notes: parseNotes('E5/16 D#5/16 | E5/16 D#5/16 E5/16 B4/16 D5/16 C5/16 | A4/8 R/8 C4/16 E4/16'),
  timeSignature: [3, 8],
  pickup: 0.5,
};

describe('vị trí trong bài (số ô in ↔ phách ↔ chỉ số nốt)', () => {
  it('số ô in: có ô lấy đà → ô lấy đà là 0; không có → ô đầu là 1', () => {
    expect(printedMeasure(birthday, 0)).toBe(0);
    expect(printedMeasure(birthday, 3)).toBe(3);
    expect(printedMeasure(plain, 0)).toBe(1);
    for (const l of [birthday, plain]) for (let i = 0; i < 5; i++) expect(measureIndexOf(l, printedMeasure(l, i))).toBe(i);
  });

  it('phách bắt đầu từng ô, thêm phần tử cuối = hết bài', () => {
    expect(measureStarts(birthday)).toEqual([0, 1, 4, 7, 10, 13, 16, 19, 22, 25]);
    expect(measureStarts(plain)).toEqual([0, 4, 8]);
    expect(measureStarts(eighths)).toEqual([0, 0.5, 2, 3.5]);
  });

  it('phách bắt đầu từng nốt (gồm nốt chấm dôi, móc kép)', () => {
    expect(noteStarts(birthday)).toEqual([0, 0.75, 1, 2, 3, 4, 6, 6.75, 7, 8, 9, 10, 12, 12.75, 13, 14, 15, 16, 17, 18, 18.75, 19, 20, 21, 22]);
    expect(noteStarts(plain)).toEqual([0, 1, 2, 3, 4, 6]);
  });

  it('ô chứa một phách: phách đầu ô thuộc ô đó, sai số dấu phẩy động không lùi ô, quá cuối bài → ô cuối', () => {
    const starts = measureStarts(birthday);
    expect(measureIndexAtBeat(starts, 0)).toBe(0);
    expect(measureIndexAtBeat(starts, 0.75)).toBe(0);
    expect(measureIndexAtBeat(starts, 1)).toBe(1);
    expect(measureIndexAtBeat(starts, 3.99)).toBe(1);
    expect(measureIndexAtBeat(starts, 4 - 1e-12)).toBe(2);
    expect(measureIndexAtBeat(starts, 24.9)).toBe(8);
    expect(measureIndexAtBeat(starts, 25)).toBe(8);
    expect(measureIndexAtBeat(starts, 99)).toBe(8);
    expect(measureIndexAtBeat(measureStarts(eighths), 0.4)).toBe(0);
    expect(measureIndexAtBeat(measureStarts(eighths), 0.5)).toBe(1);
  });

  it('chỉ số nốt theo [ô in, phách]', () => {
    expect(noteIndexAt(birthday, 0)).toBe(0);
    expect(noteIndexAt(birthday, 0, 0.75)).toBe(1);
    expect(noteIndexAt(birthday, 1)).toBe(2);
    expect(noteIndexAt(birthday, 1, 2)).toBe(4);
    expect(birthday.notes[noteIndexAt(birthday, 6, 2)].pitch).toBe('F5');
    expect(noteIndexAt(birthday, 8)).toBe(24);
    expect(noteIndexAt(plain, 1)).toBe(0);
    expect(noteIndexAt(plain, 2, 2)).toBe(5);
    expect(noteIndexAt(eighths, 1, 0.75)).toBe(5);
    expect(noteIndexAt(eighths, 2, 1)).toBe(10);
  });

  it('vị trí sai → báo lỗi, không lặng lẽ gán nhầm nốt', () => {
    expect(() => noteIndexAt(birthday, 9)).toThrow('Bài không có ô nhịp 9');
    expect(() => noteIndexAt(birthday, -1)).toThrow('Bài không có ô nhịp -1');
    expect(() => noteIndexAt(plain, 0)).toThrow('Bài không có ô nhịp 0');
    // Ô 2 phách +1 rơi vào giữa nốt trắng B4 (phách 4–6).
    expect(() => noteIndexAt(birthday, 2, 1)).toThrow('Không có nốt nào bắt đầu ở ô 2, phách +1');
  });
});
