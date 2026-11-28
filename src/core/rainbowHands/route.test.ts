import { describe, expect, it } from 'vitest';
import { exerciseById } from '../technique/catalog';
import { buildRoute, buildSegment, DEFAULT_STARTS, degreeName, effectiveStarts, FINGERING_SOURCE, FINGERING_SOURCE_ID, noteNameAt, placementGuide, ROUND_POSITIONS, verifiedFingers } from './route';

const starts = DEFAULT_STARTS;

describe('Lộ trình tám nốt', () => {
  it('một vòng = 15 vị trí mỗi tay: lên 8 nốt, xuống 7 nốt, Đô cao đánh một lần', () => {
    const route = buildRoute({ hands: 'right', path: 'round', starts });
    expect(route).toHaveLength(ROUND_POSITIONS);
    expect(route.map((s) => s.notes[0].midi)).toEqual([60, 62, 64, 65, 67, 69, 71, 72, 71, 69, 67, 65, 64, 62, 60]);
    expect(route.filter((s) => s.notes[0].midi === 72)).toHaveLength(1);
    expect(route[7].direction).toBe('turn');
    expect(route[3].direction).toBe('up');
    expect(route[10].direction).toBe('down');
  });

  it('hai tay cùng chiều: mỗi bước một cặp nốt cách nhau một quãng tám (tay trái trước)', () => {
    const route = buildRoute({ hands: 'both', path: 'round', starts });
    expect(route).toHaveLength(15);
    for (const step of route) {
      expect(step.notes.map((n) => n.hand)).toEqual(['left', 'right']);
      expect(step.notes[1].midi - step.notes[0].midi).toBe(12);
    }
  });

  it('chỉ đi lên / chỉ đi xuống: 8 nốt, đi xuống bắt đầu từ Đô cao', () => {
    expect(buildRoute({ hands: 'left', path: 'up', starts }).map((s) => s.notes[0].midi)).toEqual([48, 50, 52, 53, 55, 57, 59, 60]);
    expect(buildRoute({ hands: 'left', path: 'down', starts }).map((s) => s.notes[0].midi)).toEqual([60, 59, 57, 55, 53, 52, 50, 48]);
  });

  it('đổi Đô bắt đầu của từng tay', () => {
    const route = buildRoute({ hands: 'both', path: 'up', starts: { left: 36, right: 72 } });
    expect(route[0].notes.map((n) => n.midi)).toEqual([36, 72]);
    expect(route[7].notes.map((n) => n.midi)).toEqual([48, 84]);
  });

  it('số ngón lấy từ bài kỹ thuật đã soạn (không tự suy diễn) và khớp từng nốt', () => {
    const lesson = exerciseById(FINGERING_SOURCE_ID)!.lesson;
    expect(lesson.notes.map((n) => n.midi)).toEqual(buildRoute({ hands: 'right', path: 'round', starts }).map((s) => s.notes[0].midi));
    expect(lesson.accompaniment!.map((a) => a.midis[0])).toEqual(buildRoute({ hands: 'left', path: 'round', starts }).map((s) => s.notes[0].midi));
    const f = verifiedFingers();
    expect(f.right).toEqual([1, 2, 3, 1, 2, 3, 4, 5, 4, 3, 2, 1, 3, 2, 1]);
    expect(f.left).toEqual([5, 4, 3, 2, 1, 3, 2, 1, 2, 3, 1, 2, 3, 4, 5]);
  });

  it('đoạn ngắn để tập lại + tên bậc', () => {
    expect(buildSegment(1, 4, { hands: 'left', starts }).map((s) => s.pos)).toEqual([1, 2, 3, 4]);
    expect(buildSegment(13, 20, { hands: 'left', starts }).map((s) => s.pos)).toEqual([13, 14]);
    expect([0, 3, 7].map(degreeName)).toEqual(['Đô', 'Fa', 'Đô cao']);
  });

  it('hướng dẫn vị trí trên đàn thật theo Đô giữa', () => {
    expect(placementGuide('right', 60)).toContain('ngón 1 (ngón cái) lên Đô4 — Đô giữa');
    expect(placementGuide('left', 48)).toContain('ngón 5 (ngón út) lên Đô3');
    expect(placementGuide('left', 48)).toContain('sang TRÁI 7 phím trắng');
    expect(placementGuide('right', 72)).toContain('sang PHẢI 7 phím trắng');
  });

  it('ngược chiều: lộ trình + số ngón khớp TỪNG NỐT bài mẫu "Gam Đô trưởng hai tay ngược chiều"', () => {
    const lesson = exerciseById(FINGERING_SOURCE.contrary.id)!.lesson;
    const starts = effectiveStarts(DEFAULT_STARTS, 'contrary');
    expect(starts).toEqual({ left: 36, right: 60 });
    const route = buildRoute({ hands: 'both', path: 'round', starts, motion: 'contrary' });
    expect(route.map((s) => s.notes[1].midi)).toEqual(lesson.notes.map((n) => n.midi));
    expect(route.map((s) => s.notes[0].midi)).toEqual(lesson.accompaniment!.map((a) => a.midis[0]));
    expect(route.map((s) => s.notes[0].midi)).toEqual([48, 47, 45, 43, 41, 40, 38, 36, 38, 40, 41, 43, 45, 47, 48]);
    expect(route.map((s) => s.notes[0].finger)).toEqual([1, 2, 3, 1, 2, 3, 4, 5, 4, 3, 2, 1, 3, 2, 1]);
    expect(route.map((s) => s.notes[1].finger)).toEqual(verifiedFingers('contrary').right);
    // Hai tay không bao giờ cùng một phím; tay trái luôn thấp hơn.
    for (const s of route) expect(s.notes[0].midi).toBeLessThan(s.notes[1].midi);
    expect(route.filter((s) => s.notes[1].midi === 72)).toHaveLength(1);
    expect(route.filter((s) => s.notes[0].midi === 36)).toHaveLength(1);
  });

  it('ngược chiều: vùng tay trái chỉ lùi khi cần; tên nốt theo tay; hướng dẫn đặt tay', () => {
    expect(effectiveStarts({ left: 48, right: 72 }, 'contrary')).toEqual({ left: 48, right: 72 });
    expect(effectiveStarts({ left: 48, right: 60 }, 'parallel')).toEqual({ left: 48, right: 60 });
    expect(buildRoute({ hands: 'left', path: 'up', starts: { left: 36, right: 60 }, motion: 'contrary' }).map((s) => s.notes[0].midi)).toEqual([48, 47, 45, 43, 41, 40, 38, 36]);
    expect([noteNameAt('left', 2, 'contrary'), noteNameAt('right', 2, 'contrary'), noteNameAt('left', 0, 'contrary')]).toEqual(['La', 'Mi', 'Đô']);
    expect(noteNameAt('left', 7, 'contrary')).toBe('Đô thấp');
    expect(noteNameAt('right', 7, 'contrary')).toBe('Đô cao');
    expect(placementGuide('left', 36, 'contrary')).toContain('ngón 1 (ngón cái) lên Đô3');
    expect(placementGuide('left', 36, 'contrary')).toContain('đi XUỐNG');
    expect(placementGuide('right', 60, 'contrary')).toContain('ngón 1 (ngón cái) lên Đô4');
  });
});
