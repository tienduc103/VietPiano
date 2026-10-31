import { describe, expect, it } from 'vitest';
import { LESSONS } from '../lessons/library';
import { listenIndexAt, listenPlan } from './listenSample';

const elise = LESSONS.find((l) => l.id === 'song-fur-elise-2-hands')!;
const twinkle = LESSONS.find((l) => l.id === 'song-twinkle')!;

describe('nghe mẫu', () => {
  it('từ đầu bài: đủ nốt giai điệu + phần đệm, con trỏ theo phách', () => {
    const plan = listenPlan(elise, 0);
    expect(plan.fromIndex).toBe(0);
    const accNotes = elise.accompaniment!.reduce((n, c) => n + c.midis.length, 0);
    expect(plan.notes).toHaveLength(elise.notes.length + accNotes);
    expect(plan.notes[0]).toMatchObject({ midiNote: 76, startBeat: 0 });
    // Ô lấy đà E5 D#5 (móc kép) → phách 0.3 vẫn là nốt thứ hai, phách 0.5 sang ô 1.
    expect(listenIndexAt(plan, 0.3)).toBe(1);
    expect(listenIndexAt(plan, 0.5)).toBe(2);
    expect(listenIndexAt(plan, 1e6)).toBe(elise.notes.length - 1);
  });

  it('đang tập giữa ô → phát từ nốt đầu ô đó, phách tính lại từ 0', () => {
    // Nốt 10 = C4 trong ô 2 (A4 C4 E4 A4, bắt đầu ở nốt 8).
    const plan = listenPlan(elise, 10);
    expect(plan.fromIndex).toBe(8);
    expect(plan.melodyStarts[0]).toBe(0);
    expect(plan.notes.filter((n) => n.startBeat === 0).map((n) => n.midiNote).sort()).toEqual([45, 69]);
    expect(listenIndexAt(plan, 0.8)).toBe(9);
  });

  it('pedal: nốt tay trái ngân tới hết ô nhịp đang đạp', () => {
    const plan = listenPlan(elise, 8);
    const a2 = plan.notes.find((n) => n.midiNote === 45)!;
    expect(a2.durationBeats).toBeCloseTo(1.5, 9);
  });

  it('bài một tay không pedal: chỉ giai điệu, giữ trường độ', () => {
    const plan = listenPlan(twinkle, 0);
    expect(plan.notes).toHaveLength(twinkle.notes.length);
    expect(plan.notes[0].durationBeats).toBe(1);
  });
});
