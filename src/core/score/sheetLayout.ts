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
  /** Độ giãn tối đa (so với bề rộng tự nhiên) của một dòng khi chia đều lại các dòng. */
  maxBalancedStretch?: number;
}

/**
 * Xếp ô nhịp vào dòng như người chép nhạc: xếp tham lam (đầy dòng rồi mới xuống dòng). Nếu dòng cuối cụt (chưa tới
 * `justifyLastLineAt` khổ) hoặc phải giãn quá `maxBalancedStretch` mới đầy khổ, thử chia lại cùng số dòng sao cho
 * mọi dòng giãn đầy khổ đều nhau (độ giãn lớn nhất nhỏ nhất) và chỉ nhận khi không dòng nào giãn quá `maxBalancedStretch`:
 * 12 ô → 4/4/4 thay vì 4/5/3, nhưng giữ 3/3/3/3/3/2 chứ không đổi thành 2/3/3/3/3/3 (dòng đầu có số chỉ nhịp giãn thưa).
 * Mỗi dòng ít nhất một ô nhịp; ô nhịp quá rộng so với khổ thì đứng một mình và bị nén cho vừa.
 */
export function layoutSystems(noteAreas: readonly number[], opts: SheetLayoutOptions): SystemLayout[] {
  const { lineWidth, headerWidth, justifyLastLineAt = 0.6, maxBalancedStretch = 1.5 } = opts;
  const n = noteAreas.length;
  const prefix = [0];
  for (const area of noteAreas) prefix.push(prefix[prefix.length - 1] + area);
  const width = (li: number, j: number, i: number) => headerWidth(li) + prefix[i] - prefix[j];
  /** Độ giãn khi dòng thứ `li` chứa ô [j, i) giãn đầy khổ. */
  const stretch = (li: number, j: number, i: number) => (lineWidth - headerWidth(li)) / (prefix[i] - prefix[j]);

  // Xếp tham lam: `breaks` = chỉ số ô đầu mỗi dòng.
  const breaks: number[] = [];
  for (let i = 0; i < n; i++) {
    if (!breaks.length || width(breaks.length - 1, breaks[breaks.length - 1], i + 1) > lineWidth) breaks.push(i);
  }
  const count = breaks.length;
  const lastFill = count ? width(count - 1, breaks[count - 1], n) / lineWidth : 1;
  // Dòng cuối cụt (không giãn) hoặc phải giãn quá thưa mới đầy khổ → thử chia đều.
  const lastStretch = count ? stretch(count - 1, breaks[count - 1], n) : 1;
  if (count > 1 && (lastFill < justifyLastLineAt || lastStretch > maxBalancedStretch)) {
    // Chia lại: best[k][i] = độ giãn lớn nhất nhỏ nhất khi xếp i ô đầu vào k dòng (mọi dòng giãn đầy khổ).
    const best = Array.from({ length: count + 1 }, () => new Array<number>(n + 1).fill(Infinity));
    const from = Array.from({ length: count + 1 }, () => new Array<number>(n + 1).fill(0));
    best[0][0] = 0;
    for (let k = 1; k <= count; k++) {
      for (let i = 1; i <= n; i++) {
        for (let j = i - 1; j >= 0 && (i - j === 1 || width(k - 1, j, i) <= lineWidth); j--) {
          const worst = Math.max(best[k - 1][j], stretch(k - 1, j, i));
          if (worst < best[k][i]) {
            best[k][i] = worst;
            from[k][i] = j;
          }
        }
      }
    }
    if (best[count][n] <= maxBalancedStretch) {
      for (let k = count, i = n; k > 0; k--) {
        breaks[k - 1] = from[k][i];
        i = from[k][i];
      }
    }
  }
  const lines = breaks.map((start, li) => ({
    measures: Array.from({ length: (breaks[li + 1] ?? n) - start }, (_, m) => start + m),
    header: headerWidth(li),
  }));

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

/**
 * Bề rộng phần nốt tối thiểu của một ô nhịp để hàng tên nốt không dính chữ.
 * VexFlow chia khoảng cách giữa các nốt theo "softmax" trường độ (khoảng sau một nốt ∝ 10^(trường độ / độ dài ô)),
 * nên nốt ngắn được ít chỗ: ô phải đủ rộng để khoảng sau mỗi nốt chứa nửa chữ của nó + nửa chữ nốt kế + `gap`.
 * `beats` / `widths`: trường độ (phách) và bề rộng chữ tên từng nốt (0 = không có chữ, vd dấu lặng);
 * nốt cuối ô coi nốt đầu ô sau rộng bằng nó.
 */
export function labelNoteArea(beats: readonly number[], widths: readonly number[], measureBeats: number, gap = 10, softmaxFactor = 10): number {
  const exps = beats.map((b) => Math.pow(softmaxFactor, b / measureBeats));
  const total = exps.reduce((a, b) => a + b, 0);
  let need = 0;
  widths.forEach((w, i) => {
    if (!w) return;
    const next = i + 1 < widths.length ? widths[i + 1] : w;
    need = Math.max(need, ((w + next) / 2 + gap) / (exps[i] / total));
  });
  return need;
}

/** Diện tích canvas an toàn trên Safari iPadOS / iOS (~4096 × 4096 điểm ảnh): vượt quá thì canvas trắng trơn, không báo lỗi. */
export const MAX_CANVAS_PIXELS = 16_000_000;

/** Số điểm ảnh cho mỗi đơn vị vẽ: ưu tiên `preferred` (2 = nét trên Retina), bài dài thì giảm cho vừa `maxPixels`. */
export function sheetPixelScale(width: number, height: number, preferred = 2, maxPixels = MAX_CANVAS_PIXELS): number {
  const fit = Math.floor(Math.sqrt(maxPixels / (width * height)) * 100) / 100;
  return Math.min(preferred, fit);
}

/** Xuống dòng theo từ cho vừa `maxWidth` (đo bằng `measure`); một từ dài hơn khổ thì đứng riêng một dòng. */
export function wrapText(text: string, maxWidth: number, measure: (s: string) => number): string[] {
  const lines: string[] = [];
  let line = '';
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const next = line ? `${line} ${word}` : word;
    if (line && measure(next) > maxWidth) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines;
}

/**
 * Hình nêm (to dần / nhỏ dần) bị ngắt qua nhiều dòng: độ mở ở hai đầu từng đoạn, tỉ lệ theo chiều dài đã đi
 * (đoạn sau mở tiếp từ chỗ đoạn trước dừng, như bản in). `lengths`: chiều dài từng đoạn theo thứ tự.
 */
export function hairpinOpenings(lengths: readonly number[], type: 'cresc' | 'dim', open: number): [number, number][] {
  const total = lengths.reduce((a, b) => a + b, 0);
  let done = 0;
  return lengths.map((len) => {
    const at = (d: number) => (total > 0 ? (type === 'cresc' ? d / total : 1 - d / total) * open : 0);
    const pair: [number, number] = [at(done), at(done + len)];
    done += len;
    return pair;
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
