import { describe, expect, it } from 'vitest';
import { pedalRanges } from '../curriculum/piece';
import { HAPPY_BIRTHDAY_LESSONS } from './arrangements/happyBirthday';
import { LESSONS } from './library';
import { splitMeasures } from './notation';
import { measureRange, originalMeasure, sliceLesson } from './slice';
import { accompanimentByNote, measureLength } from './types';

const [, intermediate, advanced] = HAPPY_BIRTHDAY_LESSONS;

describe('luyện theo đoạn ô nhịp', () => {
  it('khoảng ô của bài: có ô lấy đà → 0…8; không có → 1…n', () => {
    expect(measureRange(intermediate)).toEqual({ first: 0, last: 8 });
    expect(measureRange(advanced)).toEqual({ first: 0, last: 9 });
    const romance = LESSONS.find((l) => l.id === 'song-romance-2-hands')!;
    expect(measureRange(romance)).toEqual({ first: 1, last: 32 });
  });

  it('cắt ô 5–6 bản Trung cấp: đúng nốt hai tay, ô đầy đủ (không còn ô lấy đà), sắc thái / hợp âm / pedal theo đoạn', () => {
    const s = sliceLesson(intermediate, 5, 6);
    expect(s).toMatchObject({ id: intermediate.id, slice: { from: 5, to: 6 }, title: `${intermediate.title} — ô 5–6` });
    expect(s.pickup).toBeUndefined();
    const ms = splitMeasures(s.notes, 3);
    expect(ms.map((m) => m.items.map((n) => n.pitch))).toEqual([
      ['G5', 'E5', 'C5'],
      ['B4', 'A4', 'F5', 'F5'],
    ]);
    expect(splitMeasures(s.accompaniment!, measureLength(s.timeSignature))).toHaveLength(2);
    // mf đặt ở ô 5 phách 1, mp ở "Hap-py" ô 6.
    expect(s.dynamics!.map((d) => [s.notes[d.index].pitch, d.mark])).toEqual([
      ['G5', 'mf'],
      ['F5', 'mp'],
    ]);
    expect(s.chordSymbols!.map((c) => c.symbol)).toEqual(['C7', 'F/A']);
    // Pedal: ô 5 có (ô 6 không đạp) → ô 1 của đoạn.
    expect(s.pedal).toEqual([{ from: 0, to: 0 }]);
    expect(accompanimentByNote(s)).toHaveLength(s.notes.length);
    expect(originalMeasure(s, 1)).toBe(5);
    expect(originalMeasure(s, 2)).toBe(6);
  });

  it('cắt từ ô lấy đà giữ nguyên ô lấy đà và số ô; hợp âm đang vang được đặt lại ở đầu đoạn', () => {
    const s = sliceLesson(intermediate, 0, 2);
    expect(s.pickup).toBe(1);
    expect(s.notes.map((n) => n.pitch)).toEqual(intermediate.notes.slice(0, 8).map((n) => n.pitch));
    expect(originalMeasure(s, 2)).toBe(2);
    const mid = sliceLesson(intermediate, 3, 3);
    // Ô 3 cùng hợp âm G7/B với ô 2 → vẫn hiện ký hiệu ở đầu đoạn.
    expect(mid.chordSymbols).toEqual([{ index: 0, symbol: 'G7/B' }]);
    // Sắc thái p (từ ô 2) đang có hiệu lực ở đầu ô 3.
    expect(mid.dynamics).toEqual([{ index: 0, mark: 'p' }]);
  });

  it('pedal đổi giữa ô và hình nêm được cắt theo đoạn (bản Nâng cao ô 6–7)', () => {
    const s = sliceLesson(advanced, 6, 7);
    expect(pedalRanges(s)).toEqual([
      { startBeat: 0, endBeat: 1 },
      { startBeat: 1, endBeat: 2 },
      { startBeat: 2, endBeat: 3 },
      { startBeat: 3, endBeat: 5 },
      { startBeat: 5, endBeat: 6 },
    ]);
    expect(s.hairpins).toEqual([{ from: 0, to: 1, type: 'dim' }]);
  });

  it('đoạn không có trong bài → lỗi', () => {
    expect(() => sliceLesson(intermediate, 7, 9)).toThrow();
    expect(() => sliceLesson(intermediate, 5, 4)).toThrow();
  });
});
