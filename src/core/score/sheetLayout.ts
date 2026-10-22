/**
 * Dàn trang bản nhạc in: chia các ô nhịp thành nhiều dòng (system) vừa khổ giấy,
 * rồi giãn đều để mỗi dòng đầy khổ. Logic thuần, không phụ thuộc VexFlow.
 */

export interface SystemLayout {
  /** Chỉ số các ô nhịp trên dòng này. */
  measures: number[];
  /** Bề rộng phần nốt của từng ô nhịp sau khi giãn. */
  noteAreas: number[];
  /** Bề rộng phần đầu dòng (khoá, hoá biểu, số chỉ nhịp). */
  headerWidth: number;
}

export interface SheetLayoutOptions {
  /** Bề rộng khả dụng của một dòng. */
  lineWidth: number;
  /** Bề rộng phần đầu dòng theo chỉ số dòng (dòng đầu có thêm số chỉ nhịp). */
  headerWidth: (lineIndex: number) => number;
  /** Dòng cuối chỉ giãn đầy khổ khi đã lấp ít nhất tỉ lệ này (tránh dòng cuối thưa thớt). */
  justifyLastLineAt?: number;
}

/**
 * Xếp ô nhịp vào dòng theo kiểu tham lam: mỗi dòng ít nhất một ô nhịp; ô nhịp quá rộng
 * so với khổ thì đứng một mình và bị nén cho vừa.
 */
export function layoutSystems(noteAreas: readonly number[], opts: SheetLayoutOptions): SystemLayout[] {
  const { lineWidth, headerWidth, justifyLastLineAt = 0.6 } = opts;
  const lines: { measures: number[]; header: number }[] = [];
  let current: { measures: number[]; header: number; used: number } | null = null;

  noteAreas.forEach((area, i) => {
    if (current && current.used + area <= lineWidth) {
      current.measures.push(i);
      current.used += area;
      return;
    }
    const header = headerWidth(lines.length);
    current = { measures: [i], header, used: header + area };
    lines.push(current);
  });

  return lines.map((line, li) => {
    const natural = line.measures.map((m) => noteAreas[m]);
    const total = natural.reduce((a, b) => a + b, 0);
    const available = lineWidth - line.header;
    const isLast = li === lines.length - 1;
    const fill = (line.header + total) / lineWidth;
    const scale = isLast && fill < justifyLastLineAt ? Math.min(1, available / total) : available / total;
    return { measures: line.measures, noteAreas: natural.map((a) => a * scale), headerWidth: line.header };
  });
}

/** Tên file ảnh từ tiêu đề bài: bỏ dấu tiếng Việt, chữ thường, nối bằng "-". */
export function sheetFileName(title: string, ext = 'png'): string {
  const slug = title
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[đĐ]/g, 'd')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `vietpiano-${slug || 'ban-nhac'}.${ext}`;
}
