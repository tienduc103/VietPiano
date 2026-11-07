/**
 * ScoreSheet — vẽ cả bài thành bản nhạc nhiều dòng (kiểu tờ nhạc in) lên canvas để xuất ảnh PNG.
 *
 * Dùng backend Canvas của VexFlow chứ không chuyển SVG → ảnh: canvas dùng được font Bravura
 * đã nạp trong trang, còn SVG nạp qua <img> thì không thấy font của trang.
 * Nền trắng, nét đen cố định (không theo dark mode) để in hoặc xem trong Ảnh.
 */
import { CanvasContext } from 'vexflow/bravura';
import { splitMeasures } from '../lessons/notation';
import { CLEF_LABEL, HAND_LABEL, measureLength, sectionAt, type Lesson } from '../lessons/types';
import { displayChordSymbol } from '../music/chordSymbols';
import { pitchToLabel, type NoteLabelStyle } from '../music/notes';
import {
  accompanimentFingerRows,
  accompanimentMeasures,
  createMeasureNotes,
  createMeasureStaves,
  drawMeasure,
  FINGER_OFFSET,
  FINGER_ROW_STEP,
  formatMeasure,
  GRAND_STAFF_GAP,
  LABEL_OFFSET,
  labelOffset,
  lessonClefs,
  naturalNoteArea,
  noteCenterX,
  noteFingerRows,
  SECTION_SPACE,
  sectionBox,
  staffOf,
} from './ScoreRenderer';

/** Chỗ thêm phía trên mỗi dòng cho hàng ký hiệu hợp âm. */
const CHORD_SPACE = 24;
import { layoutSystems } from './sheetLayout';

export interface ScoreSheetOptions {
  showNames: boolean;
  labelStyle: NoteLabelStyle;
  /** Số pixel ảnh cho mỗi đơn vị vẽ (2 → ảnh nét trên màn hình Retina). */
  scale?: number;
}

const SHEET_WIDTH = 1100;
const MARGIN_X = 48;
const SYSTEMS_TOP = 118;
const SYSTEM_HEIGHT = 140;
const LABEL_EXTRA = 34;
const FOOTER_HEIGHT = 56;
const INK = '#111827';
const MUTED = '#64748b';
const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

/** Bề rộng phần đầu dòng: khoá + hoá biểu (+ số chỉ nhịp ở dòng đầu). */
function headerWidthFor(lesson: Lesson, withTime: boolean): number {
  const ys = lessonClefs(lesson).map((_, si) => si * GRAND_STAFF_GAP);
  return createMeasureStaves(lesson, 0, ys, 100, { clef: true, time: withTime }, false).headerWidth;
}

/** Vẽ bản nhạc vào `canvas` (tự đặt kích thước). Phải gọi sau khi font Bravura đã nạp. */
export function renderScoreSheet(canvas: HTMLCanvasElement, lesson: Lesson, opts: ScoreSheetOptions): void {
  const measures = splitMeasures(lesson.notes, measureLength(lesson.timeSignature), lesson.pickup);
  const accMeasures = accompanimentMeasures(lesson);
  const firstHeader = headerWidthFor(lesson, true);
  const otherHeader = headerWidthFor(lesson, false);
  const systems = layoutSystems(
    measures.map((m, mi) => naturalNoteArea(m.items, accMeasures?.[mi]?.items)),
    { lineWidth: SHEET_WIDTH - 2 * MARGIN_X, headerWidth: (li) => (li === 0 ? firstHeader : otherHeader) },
  );

  const staffCount = lessonClefs(lesson).length;
  // Chùm nốt tay phải: số ngón xếp chồng + ký hiệu hợp âm cần thêm chỗ phía trên mỗi dòng.
  const stackRows = Math.max(1, ...lesson.notes.map((n) => [n.finger, ...(n.harmony ?? []).map((h) => h.finger)].filter(Boolean).length));
  const chordSpace = (lesson.chordSymbols?.length ? CHORD_SPACE : 0) + (stackRows > 1 ? (stackRows - 1) * FINGER_ROW_STEP + 20 : 0);
  const sectionSpace = (lesson.sections?.length ? SECTION_SPACE : 0) + chordSpace;
  const lhFingerSpace = labelOffset(lesson) - LABEL_OFFSET;
  const systemHeight = SYSTEM_HEIGHT + sectionSpace + lhFingerSpace + (staffCount - 1) * GRAND_STAFF_GAP + (opts.showNames ? LABEL_EXTRA : 0);
  // Chỉ số nốt đầu mỗi ô (để tìm ký hiệu hợp âm theo chỉ số nốt của cả bài).
  const firstIndex: number[] = [];
  measures.reduce((i, m) => (firstIndex.push(i), i + m.items.length), 0);
  const chordAt = new Map((lesson.chordSymbols ?? []).map((c) => [c.index, c.symbol]));
  const height = SYSTEMS_TOP + systems.length * systemHeight + FOOTER_HEIGHT;

  const ctx2d = canvas.getContext('2d');
  if (!ctx2d) throw new Error('Trình duyệt không hỗ trợ canvas 2D');
  const ctx = new CanvasContext(ctx2d);
  ctx.resize(SHEET_WIDTH, height, opts.scale ?? 2);
  ctx2d.fillStyle = '#ffffff';
  ctx2d.fillRect(0, 0, SHEET_WIDTH, height);

  // Tiêu đề + thông tin bài.
  ctx2d.fillStyle = INK;
  ctx2d.textAlign = 'center';
  ctx2d.textBaseline = 'alphabetic';
  ctx2d.font = `700 30px ${FONT}`;
  ctx2d.fillText(lesson.title, SHEET_WIDTH / 2, 56);
  ctx2d.fillStyle = MUTED;
  ctx2d.font = `400 16px ${FONT}`;
  const info = [CLEF_LABEL[lesson.clef], `Nhịp ${lesson.timeSignature.join('/')}`, HAND_LABEL[lesson.hand], `${lesson.notes.length} nốt`];
  ctx2d.fillText(info.join(' · '), SHEET_WIDTH / 2, 84);

  systems.forEach((system, si) => {
    const y = SYSTEMS_TOP + sectionSpace + si * systemHeight;
    let x = MARGIN_X;
    const ys = Array.from({ length: staffCount }, (_, i) => y + i * GRAND_STAFF_GAP);
    system.measures.forEach((mi, k) => {
      const measure = measures[mi];
      const noteArea = system.noteAreas[k];
      const { staves, headerWidth: header } = createMeasureStaves(
        lesson,
        x,
        ys,
        noteArea,
        { clef: k === 0, time: k === 0 && si === 0 },
        mi === measures.length - 1,
      );
      const accItems = accMeasures?.[mi]?.items;
      const { staves: staffNotes, played, accompaniment } = createMeasureNotes(lesson, measure.items, !(mi === 0 && lesson.pickup), accItems);
      const { voices, beams } = formatMeasure(lesson, staves, staffNotes, noteArea);
      // Phần chữ bên dưới đổi màu tô của canvas → đặt lại màu mực trước mỗi ô nhịp.
      ctx.setFillStyle(INK);
      ctx.setStrokeStyle(INK);
      drawMeasure(ctx, staves, voices, beams, { first: k === 0, last: mi === measures.length - 1 });
      const staveBottom = staves[staves.length - 1].getYForLine(4);

      // Số ô nhịp ở đầu mỗi dòng (trừ dòng đầu) để dễ tìm chỗ khi tự học; ô lấy đà không được đánh số.
      if (k === 0 && si > 0) {
        ctx2d.fillStyle = MUTED;
        ctx2d.textAlign = 'left';
        ctx2d.font = `italic 400 13px ${FONT}`;
        ctx2d.fillText(String(lesson.pickup ? mi : mi + 1), x, staves[0].getYForLine(0) - 14);
      }

      // Chữ đánh dấu đoạn (A, B…) trong khung vuông.
      const section = sectionAt(lesson, mi);
      if (section) {
        const box = sectionBox(staves[0]);
        ctx2d.strokeStyle = INK;
        ctx2d.lineWidth = 1.5;
        ctx2d.strokeRect(box.x, box.y, box.size, box.size);
        ctx2d.fillStyle = INK;
        ctx2d.textAlign = 'center';
        ctx2d.textBaseline = 'middle';
        ctx2d.font = `700 17px ${FONT}`;
        ctx2d.fillText(section, box.x + box.size / 2, box.y + box.size / 2 + 1);
        ctx2d.textBaseline = 'alphabetic';
      }

      // Số ngón tay phía trên khuông của nốt (chùm nốt: xếp chồng phía trên chùm), rồi ký hiệu hợp âm phía trên nữa.
      ctx2d.fillStyle = INK;
      ctx2d.textAlign = 'center';
      ctx2d.font = `700 16px ${FONT}`;
      const tops: number[] = [];
      measure.items.forEach((n, ni) => {
        const staffTop = staves[staffOf(lesson, n)].getYForLine(0);
        const rows = noteFingerRows(n, played[ni], staffTop);
        for (const row of rows) ctx2d.fillText(row.text, noteCenterX(played[ni]), row.y);
        tops[ni] = Math.min(staffTop - FINGER_OFFSET, rows.length ? rows[rows.length - 1].y : Infinity, n.rest ? Infinity : Math.min(...played[ni].getYs()) - 8) - 16;
      });
      ctx2d.textAlign = 'left';
      ctx2d.font = `700 16px ${FONT}`;
      measure.items.forEach((_n, ni) => {
        const symbol = chordAt.get(firstIndex[mi] + ni);
        if (symbol) ctx2d.fillText(displayChordSymbol(symbol), played[ni].getNoteHeadBeginX() - 2, Math.min(tops[ni], staves[0].getYForLine(0) - FINGER_OFFSET - 16) - 6);
      });
      ctx2d.textAlign = 'center';

      // Số ngón tay phần đệm: chồng dưới khuông Fa.
      ctx2d.font = `700 13px ${FONT}`;
      accItems?.forEach((n, ai) => {
        for (const row of accompanimentFingerRows(n, accompaniment[ai], staveBottom)) ctx2d.fillText(row.text, noteCenterX(accompaniment[ai]), row.y);
      });

      if (opts.showNames) {
        ctx2d.fillStyle = MUTED;
        ctx2d.textAlign = 'center';
        ctx2d.font = `600 15px ${FONT}`;
        measure.items.forEach((n, ni) => {
          if (n.rest) return;
          ctx2d.fillText(pitchToLabel(n.pitch, opts.labelStyle), noteCenterX(played[ni]), staveBottom + labelOffset(lesson));
        });
      }
      x += header + noteArea;
    });
  });

  // Chân trang: nguồn bản nhạc + tên app.
  ctx2d.fillStyle = MUTED;
  ctx2d.font = `400 13px ${FONT}`;
  ctx2d.textAlign = 'left';
  if (lesson.source) ctx2d.fillText(lesson.source, MARGIN_X, height - 24, SHEET_WIDTH - 2 * MARGIN_X - 120);
  ctx2d.textAlign = 'right';
  ctx2d.fillText('VietPiano', SHEET_WIDTH - MARGIN_X, height - 24);
}
