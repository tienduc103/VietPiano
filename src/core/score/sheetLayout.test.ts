import { describe, expect, it } from 'vitest';
import { hairpinOpenings, labelNoteArea, layoutSystems, MAX_CANVAS_PIXELS, sheetFileName, sheetPixelScale, wrapText } from './sheetLayout';

const header = (li: number) => (li === 0 ? 100 : 70);
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

describe('layoutSystems', () => {
  it('xếp ô nhịp theo thứ tự, không bỏ sót, mỗi dòng ít nhất một ô', () => {
    const areas = [200, 200, 200, 200, 200, 200, 200];
    const lines = layoutSystems(areas, { lineWidth: 800, headerWidth: header });
    expect(lines.flatMap((l) => l.measures)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(lines.every((l) => l.measures.length > 0)).toBe(true);
    expect(lines[0].headerWidth).toBe(100);
    expect(lines[1].headerWidth).toBe(70);
    // Mỗi dòng không vượt khổ (dòng đầu: 100 + 3×200 = 700 ≤ 800; 4 ô thì vượt).
    lines.forEach((l) => expect(l.headerWidth + l.measures.length * 200).toBeLessThanOrEqual(800));
  });

  it('số dòng ít nhất như xếp tham lam; dòng cuối phải giãn quá thưa thì chia đều', () => {
    // 16 ô nhịp 3/4 hẹp: tham lam 6 + 6 + 4 (dòng cuối giãn 55%) → chia đều 5–6 ô mỗi dòng, dòng nào cũng đầy khổ.
    const many = layoutSystems(new Array(16).fill(150), { lineWidth: 1000, headerWidth: header });
    expect(many).toHaveLength(3);
    for (const l of many) {
      expect(l.measures.length).toBeGreaterThanOrEqual(5);
      expect(l.headerWidth + sum(l.noteAreas)).toBeCloseTo(1000);
    }
  });

  it('dòng cuối cụt thì chia đều: 12 ô → 4/4/4 thay vì 4/5/3', () => {
    // Kiểu Twinkle: ô 4 nốt đen (202) xen ô có nốt trắng (173); dòng đầu có số chỉ nhịp.
    const areas = [202, 173, 202, 173, 202, 173, 202, 173, 202, 173, 202, 173];
    const lines = layoutSystems(areas, { lineWidth: 1004, headerWidth: (li) => (li === 0 ? 65 : 40) });
    expect(lines.map((l) => l.measures.length)).toEqual([4, 4, 4]);
    for (const l of lines) expect(l.headerWidth + sum(l.noteAreas)).toBeCloseTo(1004);
  });

  it('không giãn thưa dòng đầu (có số chỉ nhịp) chỉ để dòng cuối đủ ô — kiểu Canon in D', () => {
    // 16 ô móc đơn + ô cuối nốt tròn hẹp; dòng đầu có thêm số chỉ nhịp: 3 ô mỗi dòng, dòng cuối 2 ô không giãn.
    const areas = [...new Array(16).fill(285), 109];
    const lines = layoutSystems(areas, { lineWidth: 1004, headerWidth: (li) => (li === 0 ? 92 : 58) });
    expect(lines.map((l) => l.measures.length)).toEqual([3, 3, 3, 3, 3, 2]);
    expect(lines.at(-1)!.noteAreas).toEqual([285, 109]);
  });

  it('giãn các dòng cho vừa đúng khổ (trừ dòng cuối thưa)', () => {
    const lines = layoutSystems([200, 200, 200, 200, 200, 200, 200], { lineWidth: 800, headerWidth: header });
    expect(lines.map((l) => l.measures)).toEqual([[0, 1, 2], [3, 4, 5], [6]]);
    for (const line of lines.slice(0, -1)) expect(line.headerWidth + sum(line.noteAreas)).toBeCloseTo(800);
    expect(lines[2].noteAreas).toEqual([200]); // 270/800 < 60% → giữ nguyên bề rộng tự nhiên
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

describe('labelNoteArea', () => {
  it('nốt cùng trường độ: mỗi nốt một phần đều, đủ chỗ cho chữ + khoảng hở', () => {
    // 4 nốt đen trong ô 4/4, chữ rộng 30, hở 10 → mỗi khoảng ≥ 40, chiếm 1/4 ô → ô ≥ 160.
    expect(labelNoteArea([1, 1, 1, 1], [30, 30, 30, 30], 4)).toBeCloseTo(160);
  });

  it('không có chữ (dấu lặng / tắt tên nốt) → không đòi thêm chỗ', () => {
    expect(labelNoteArea([1, 1, 2], [0, 0, 0], 4)).toBe(0);
  });

  it('nốt ngắn được ít chỗ hơn (softmax trường độ) → ô có móc đơn cần rộng hơn ô nốt đen cùng chữ', () => {
    const eighths = labelNoteArea([2, 0.5, 0.5, 0.5, 0.5], [30, 30, 30, 30, 30], 4);
    const quarters = labelNoteArea([2, 1, 1], [30, 30, 30], 4);
    expect(eighths).toBeGreaterThan(quarters);
    // Móc đơn: phần của nó = 10^(0.5/4) / (10^(2/4) + 4·10^(0.5/4)).
    const share = Math.pow(10, 0.125) / (Math.pow(10, 0.5) + 4 * Math.pow(10, 0.125));
    expect(eighths).toBeCloseTo(40 / share);
  });

  it('chữ dài kế bên chữ ngắn: tính nửa mỗi bên', () => {
    expect(labelNoteArea([2, 2], [20, 40], 4)).toBeCloseTo(((40 + 40) / 2 + 10) / 0.5);
  });
});

describe('sheetPixelScale', () => {
  it('bài ngắn giữ tỉ lệ ưu tiên (ảnh nét)', () => {
    expect(sheetPixelScale(1100, 1500)).toBe(2);
  });

  it('bài dài giảm tỉ lệ cho canvas không vượt diện tích tối đa của Safari', () => {
    const scale = sheetPixelScale(1100, 9000);
    expect(scale).toBeLessThan(2);
    expect(1100 * scale * 9000 * scale).toBeLessThanOrEqual(MAX_CANVAS_PIXELS);
  });
});

describe('wrapText', () => {
  const measure = (s: string) => s.length * 10;

  it('xuống dòng theo từ, không vượt khổ', () => {
    const lines = wrapText('Đô Rê Mi Fa Sol La Si', 80, measure);
    expect(lines).toEqual(['Đô Rê Mi', 'Fa Sol', 'La Si']);
    expect(lines.every((l) => measure(l) <= 80)).toBe(true);
  });

  it('từ dài hơn khổ đứng riêng một dòng; chuỗi rỗng → không dòng nào', () => {
    expect(wrapText('a rấtrấtrấtdài b', 50, measure)).toEqual(['a', 'rấtrấtrấtdài', 'b']);
    expect(wrapText('   ', 50, measure)).toEqual([]);
  });
});

describe('hairpinOpenings', () => {
  it('một đoạn: to dần mở từ 0, nhỏ dần khép về 0', () => {
    expect(hairpinOpenings([100], 'cresc', 12)).toEqual([[0, 12]]);
    expect(hairpinOpenings([100], 'dim', 12)).toEqual([[12, 0]]);
  });

  it('ngắt qua hai dòng: đoạn sau mở tiếp từ chỗ đoạn trước dừng', () => {
    const [a, b] = hairpinOpenings([150, 50], 'cresc', 12);
    expect(a[0]).toBe(0);
    expect(a[1]).toBeCloseTo(9);
    expect(b[0]).toBeCloseTo(9);
    expect(b[1]).toBeCloseTo(12);
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
