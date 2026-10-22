import { describe, expect, it } from 'vitest';
import { layoutSystems, sheetFileName } from './sheetLayout';

const header = (li: number) => (li === 0 ? 100 : 70);
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

describe('layoutSystems', () => {
  it('xếp ô nhịp theo thứ tự, không bỏ sót, mỗi dòng ít nhất một ô', () => {
    const areas = [200, 200, 200, 200, 200, 200, 200];
    const lines = layoutSystems(areas, { lineWidth: 800, headerWidth: header });
    expect(lines.flatMap((l) => l.measures)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(lines.every((l) => l.measures.length > 0)).toBe(true);
    // Dòng đầu: 100 + 3×200 = 700 ≤ 800; thêm ô nữa thì vượt.
    expect(lines[0].measures).toEqual([0, 1, 2]);
    expect(lines[0].headerWidth).toBe(100);
    expect(lines[1].headerWidth).toBe(70);
  });

  it('giãn các dòng (trừ dòng cuối thưa) cho vừa đúng khổ', () => {
    const lines = layoutSystems([200, 200, 200, 200, 200, 200, 200], { lineWidth: 800, headerWidth: header });
    for (const line of lines.slice(0, -1)) {
      expect(line.headerWidth + sum(line.noteAreas)).toBeCloseTo(800);
    }
    const last = lines.at(-1)!;
    expect(last.measures).toEqual([6]);
    expect(last.noteAreas).toEqual([200]); // 270/800 < 60% → giữ nguyên bề rộng tự nhiên
  });

  it('dòng cuối đủ dày thì cũng giãn đầy khổ', () => {
    const lines = layoutSystems([300, 300, 300, 300], { lineWidth: 800, headerWidth: header });
    const last = lines.at(-1)!;
    expect(last.headerWidth + sum(last.noteAreas)).toBeCloseTo(800);
  });

  it('ô nhịp rộng hơn khổ đứng một mình và bị nén cho vừa', () => {
    const lines = layoutSystems([100, 1200, 100], { lineWidth: 800, headerWidth: header });
    expect(lines.map((l) => l.measures)).toEqual([[0], [1], [2]]);
    expect(lines[1].headerWidth + sum(lines[1].noteAreas)).toBeCloseTo(800);
  });

  it('giữ tỉ lệ bề rộng giữa các ô nhịp khi giãn', () => {
    const [line] = layoutSystems([100, 300], { lineWidth: 600, headerWidth: () => 100 });
    expect(line.noteAreas[1] / line.noteAreas[0]).toBeCloseTo(3);
  });

  it('bài rỗng → không có dòng nào', () => {
    expect(layoutSystems([], { lineWidth: 800, headerWidth: header })).toEqual([]);
  });
});

describe('sheetFileName', () => {
  it('bỏ dấu tiếng Việt và ký tự đặc biệt', () => {
    expect(sheetFileName('Đô Rê Mi — Bài 1!')).toBe('vietpiano-do-re-mi-bai-1.png');
    expect(sheetFileName('Gam Đô trưởng (2 quãng tám)')).toBe('vietpiano-gam-do-truong-2-quang-tam.png');
  });

  it('tiêu đề không có chữ cái latinh → tên mặc định', () => {
    expect(sheetFileName('♪♪')).toBe('vietpiano-ban-nhac.png');
  });
});
