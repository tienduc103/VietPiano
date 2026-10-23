/**
 * ScoreSheet — vẽ cả bài thành bản nhạc nhiều dòng (kiểu tờ nhạc in) lên canvas để xuất ảnh PNG.
 *
 * Dùng backend Canvas của VexFlow chứ không chuyển SVG → ảnh: canvas dùng được font Bravura
 * đã nạp trong trang, còn SVG nạp qua <img> thì không thấy font của trang.
 * Nền trắng, nét đen cố định (không theo dark mode) để in hoặc xem trong Ảnh.
 */
import { BarlineType, CanvasContext, Stave } from 'vexflow/bravura';
import { splitMeasures } from '../lessons/notation';
import { measureLength, type Lesson } from '../lessons/types';
import { midiToLabel, type NoteLabelStyle } from '../music/notes';
import { createMeasureNotes, FINGER_OFFSET, formatMeasure, naturalNoteArea, noteCenterX } from './ScoreRenderer';
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

const HAND_LABEL = { right: 'Tay phải', left: 'Tay trái' } as const;
const CLEF_LABEL = { treble: 'Khoá Sol', bass: 'Khoá Fa' } as const;

/** Thêm khoá + hoá biểu (+ số chỉ nhịp ở dòng đầu) vào đầu dòng. */
function addLineHeader(stave: Stave, lesson: Lesson, withTime: boolean) {
  stave.addClef(lesson.clef);
  if (lesson.keySignature) stave.addKeySignature(lesson.keySignature);
  if (withTime) stave.addTimeSignature(lesson.timeSignature.join('/'));
}

function headerWidthFor(lesson: Lesson, withTime: boolean): number {
  const stave = new Stave(0, 0, 100);
  addLineHeader(stave, lesson, withTime);
  return stave.getNoteStartX();
}

/** Vẽ bản nhạc vào `canvas` (tự đặt kích thước). Phải gọi sau khi font Bravura đã nạp. */
export function renderScoreSheet(canvas: HTMLCanvasElement, lesson: Lesson, opts: ScoreSheetOptions): void {
  const measures = splitMeasures(lesson.notes, measureLength(lesson.timeSignature), lesson.pickup);
  const firstHeader = headerWidthFor(lesson, true);
  const otherHeader = headerWidthFor(lesson, false);
  const systems = layoutSystems(
    measures.map((m) => naturalNoteArea(m.items)),
    { lineWidth: SHEET_WIDTH - 2 * MARGIN_X, headerWidth: (li) => (li === 0 ? firstHeader : otherHeader) },
  );

  const systemHeight = SYSTEM_HEIGHT + (opts.showNames ? LABEL_EXTRA : 0);
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

  let noteIndex = 0;
  systems.forEach((system, si) => {
    const y = SYSTEMS_TOP + si * systemHeight;
    let x = MARGIN_X;
    let staveBottom = 0;
    system.measures.forEach((mi, k) => {
      const measure = measures[mi];
      const noteArea = system.noteAreas[k];
      const header = k === 0 ? system.headerWidth : 0;
      const stave = new Stave(x, y, header + noteArea);
      if (k === 0) addLineHeader(stave, lesson, si === 0);
      if (mi === measures.length - 1) stave.setEndBarType(BarlineType.END);

      const notes = createMeasureNotes(lesson, measure.items);
      const { voice, beams } = formatMeasure(lesson, stave, notes, noteArea);
      // Phần chữ bên dưới đổi màu tô của canvas → đặt lại màu mực trước mỗi ô nhịp.
      ctx.setFillStyle(INK);
      ctx.setStrokeStyle(INK);
      stave.setContext(ctx).draw();
      voice.draw(ctx, stave);
      beams.forEach((beam) => beam.setContext(ctx).draw());
      staveBottom = stave.getYForLine(4);

      // Số ô nhịp ở đầu mỗi dòng (trừ dòng đầu) để dễ tìm chỗ khi tự học; ô lấy đà không được đánh số.
      if (k === 0 && si > 0) {
        ctx2d.fillStyle = MUTED;
        ctx2d.textAlign = 'left';
        ctx2d.font = `italic 400 13px ${FONT}`;
        ctx2d.fillText(String(lesson.pickup ? mi : mi + 1), x, stave.getYForLine(0) - 14);
      }

      // Số ngón tay phía trên khuông.
      ctx2d.fillStyle = INK;
      ctx2d.textAlign = 'center';
      ctx2d.font = `700 16px ${FONT}`;
      notes.forEach((note, ni) => {
        const finger = lesson.notes[noteIndex + ni].finger;
        if (finger) ctx2d.fillText(String(finger), noteCenterX(note), stave.getYForLine(0) - FINGER_OFFSET);
      });

      if (opts.showNames) {
        ctx2d.fillStyle = MUTED;
        ctx2d.textAlign = 'center';
        ctx2d.font = `600 15px ${FONT}`;
        notes.forEach((note, ni) => {
          const midi = lesson.notes[noteIndex + ni].midi;
          ctx2d.fillText(midiToLabel(midi, opts.labelStyle), noteCenterX(note), staveBottom + 58);
        });
      }
      noteIndex += notes.length;
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
