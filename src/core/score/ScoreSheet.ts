/**
 * ScoreSheet — vẽ cả bài thành bản nhạc nhiều dòng (kiểu tờ nhạc in) lên canvas để xuất ảnh PNG.
 *
 * Dùng backend Canvas của VexFlow chứ không chuyển SVG → ảnh: canvas dùng được font Bravura
 * đã nạp trong trang, còn SVG nạp qua <img> thì không thấy font của trang.
 * Nền trắng, nét đen cố định (không theo dark mode) để in hoặc xem trong Ảnh.
 *
 * VexFlow vẽ mọi glyph (đầu nốt, khoá, dấu hoá, số chỉ nhịp, dấu lặng, cờ móc) bằng `fillText` tại MÉP TRÁI glyph và
 * không tự đặt `textAlign`: chữ của tờ nhạc luôn vẽ trong save/restore, VexFlow vẽ với canh trái mặc định. (Lỗi cũ:
 * `textAlign = 'center'` của tiêu đề lọt sang VexFlow → mọi glyph lệch trái nửa bề rộng: đuôi nốt mọc giữa đầu nốt,
 * dòng kẻ phụ lệch khỏi nốt, khoá đè vạch nhịp.)
 *
 * Hai bước: (1) dựng từng dòng ở toạ độ riêng (khuông trên cùng ở y = 0), tính chỗ mọi ký hiệu và mép mực trên / dưới
 * của dòng; (2) xếp các dòng nối tiếp theo mép mực (không chồng nhau, không thừa chỗ) rồi vẽ, mỗi dòng dời bằng `translate`.
 * Đủ ký hiệu như khuông màn Luyện tập: số ngón, ký hiệu hợp âm, chữ đánh dấu đoạn, sắc thái + hình nêm, pedal;
 * thêm nhịp độ gợi ý (♩ = …) đầu bài như bản in.
 */
import { CanvasContext, type Beam, type Stave, type StaveNote, type Voice } from 'vexflow/bravura';
import { pedalRanges } from '../curriculum/piece';
import { splitMeasures, type Measure } from '../lessons/notation';
import { CLEF_LABEL, DURATION_BEATS, HAND_LABEL, measureLength, sectionAt, type AccompanimentNote, type Lesson, type LessonNote } from '../lessons/types';
import { displayChordSymbol } from '../music/chordSymbols';
import type { DynamicMark } from '../music/dynamics';
import { keySignatureName } from '../music/keySignature';
import { pitchToLabel, type NoteLabelStyle } from '../music/notes';
import {
  accompanimentFingerRows,
  accompanimentMeasures,
  CHORD_GAP,
  createMeasureNotes,
  createMeasureStaves,
  drawMeasure,
  DYNAMIC_BELOW_NOTE,
  DYNAMIC_OFFSET,
  FINGER_GLYPH,
  FINGER_OFFSET,
  formatMeasure,
  GRAND_STAFF_GAP,
  HAIRPIN_OPEN,
  lessonClefs,
  MEASURE_PADDING,
  minNoteArea,
  naturalNoteArea,
  noteCenterX,
  noteFingerRows,
  noteTop,
  PEDAL_NOTCH,
  PEDAL_TICK,
  sectionBox,
  staffOf,
} from './ScoreRenderer';
import { hairpinOpenings, labelNoteArea, layoutSystems, sheetPixelScale, wrapText, type SystemLayout } from './sheetLayout';

export interface ScoreSheetOptions {
  showNames: boolean;
  labelStyle: NoteLabelStyle;
  /** Số pixel ảnh cho mỗi đơn vị vẽ (2 → ảnh nét trên màn hình Retina); bài dài tự giảm cho vừa giới hạn canvas của Safari. */
  scale?: number;
}

const SHEET_WIDTH = 1100;
const MARGIN_X = 48;
/** Dàn nốt khít hơn khuông một dòng trên màn hình để mỗi dòng có 3–4 ô như bản in (hàng tên nốt vẫn không dính chữ). */
const SHEET_SPACING = 0.8;
/** Ô nhịp không hẹp hơn bề rộng tối thiểu VexFlow cần (dấu hoá, chấm dôi, chùm nốt) nhân hệ số này. */
const MIN_WIDTH_FACTOR = 1.3;
const TITLE_Y = 56;
const INFO_Y = 86;
/** Mép mực trên của dòng nhạc đầu tiên. */
const FIRST_SYSTEM_TOP = 124;
/** Khoảng trống giữa mép mực dưới của dòng trước và mép mực trên của dòng sau. */
const SYSTEM_GAP = 34;
/** Hàng tên nốt: đường chân chữ cách dòng kẻ dưới cùng ít nhất `LABEL_MIN`; đỉnh chữ cách điểm thấp nhất của nốt / số ngón `LABEL_GAP`. */
const LABEL_MIN = 32;
const LABEL_GAP = 10;
/** Khoảng hở tối thiểu giữa hai chữ tên nốt liền nhau. */
const LABEL_SPACE = 10;
/** Hàng pedal: đường kẻ cách dòng kẻ dưới cùng ít nhất `PEDAL_MIN`; đỉnh chữ "Ped." cách mực phía trên `PEDAL_GAP`. */
const PEDAL_MIN = 36;
const PEDAL_GAP = 10;
/** Nhịp độ: đường chân chữ cách dòng kẻ trên cùng của dòng đầu. */
const TEMPO_RISE = 26;
/** Sắc thái: đỉnh chữ cách đuôi nốt / móc phía trên; trục hình nêm cao hơn đường chân chữ sắc thái. */
const DYNAMIC_CLEAR = 5;
const HAIRPIN_RISE = 7;
/** Khoảng hở tối thiểu giữa mực phía khuông Sol và mực phía khuông Fa của khuông đôi. */
const STAFF_CLEAR = 8;
/** Số ngón: nửa bề ngang chữ số (để xét đè), khoảng hở tới mực ngay dưới. Cờ móc chìa sang phải đuôi nốt. */
const FINGER_HALF_WIDTH = 6;
const FINGER_CLEAR = 4;
const FLAG_WIDTH = 10;
/** Chân trang: cách mép mực dưới của dòng cuối, chiều cao mỗi dòng chữ. */
const FOOTER_GAP = 40;
const FOOTER_LINE = 18;
const FOOTER_BOTTOM = 22;
const INK = '#111827';
const MUTED = '#64748b';
const RULE = '#e2e8f0';
const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
const FONTS = {
  title: `700 30px ${FONT}`,
  info: `400 16px ${FONT}`,
  measureNumber: `italic 400 13px ${FONT}`,
  section: `700 17px ${FONT}`,
  finger: `700 16px ${FONT}`,
  lhFinger: `700 13px ${FONT}`,
  chord: `700 16px ${FONT}`,
  label: `600 15px ${FONT}`,
  tempo: `700 15px ${FONT}`,
  footer: `400 13px ${FONT}`,
  /** Glyph SMuFL của Bravura (font VexFlow đã nạp) cho sắc thái, "Ped.", nốt đen của nhịp độ — như bản khắc in. */
  dynamic: '34px Bravura',
  pedal: '30px Bravura',
  metronome: '30px Bravura',
};
const DYNAMIC_GLYPH: Record<string, string> = { p: '\uE520', m: '\uE521', f: '\uE522' };
const PED_GLYPH = '\uE650';
const QUARTER_GLYPH = '\uECA5';

/** "mf" → hai glyph Bravura m + f. */
function dynamicGlyphs(mark: DynamicMark): string {
  return [...mark].map((c) => DYNAMIC_GLYPH[c] ?? c).join('');
}

interface TextMetrics2 {
  width: number;
  ascent: number;
  descent: number;
}

function measureText(ctx2d: CanvasRenderingContext2D, text: string, font: string): TextMetrics2 {
  ctx2d.save();
  ctx2d.font = font;
  const m = ctx2d.measureText(text);
  ctx2d.restore();
  const size = Number(/(\d+)px/.exec(font)?.[1] ?? 16);
  // Trình duyệt cũ không có actualBoundingBox* → ước lượng theo cỡ chữ.
  const ascent = Number.isFinite(m.actualBoundingBoxAscent) ? m.actualBoundingBoxAscent : size * 0.75;
  const descent = Number.isFinite(m.actualBoundingBoxDescent) ? m.actualBoundingBoxDescent : size * 0.25;
  return { width: m.width, ascent, descent };
}

type Ink =
  | { kind: 'text'; text: string; x: number; y: number; font: string; color: string; align: CanvasTextAlign; baseline: CanvasTextBaseline }
  | { kind: 'line'; x1: number; y1: number; x2: number; y2: number; width: number; color: string }
  | { kind: 'rect'; x: number; y: number; w: number; h: number; width: number };

/** Nét vẽ (ngoài VexFlow) của một dòng nhạc + mép mực trên / dưới, toạ độ của dòng. */
class InkList {
  readonly items: Ink[] = [];
  top = Infinity;
  bottom = -Infinity;

  constructor(private readonly ctx2d: CanvasRenderingContext2D) {}

  extend(top: number, bottom: number) {
    this.top = Math.min(this.top, top);
    this.bottom = Math.max(this.bottom, bottom);
  }

  text(text: string, x: number, y: number, font: string, opts: { color?: string; align?: CanvasTextAlign } = {}): TextMetrics2 {
    const m = measureText(this.ctx2d, text, font);
    this.items.push({ kind: 'text', text, x, y, font, color: opts.color ?? INK, align: opts.align ?? 'center', baseline: 'alphabetic' });
    this.extend(y - m.ascent, y + m.descent);
    return m;
  }

  line(x1: number, y1: number, x2: number, y2: number, width = 1.5, color = INK) {
    this.items.push({ kind: 'line', x1, y1, x2, y2, width, color });
    this.extend(Math.min(y1, y2) - width / 2, Math.max(y1, y2) + width / 2);
  }

  /** Khung chữ đánh dấu đoạn: khung vuông + chữ ở giữa. */
  boxed(text: string, box: { x: number; y: number; size: number }) {
    this.items.push({ kind: 'rect', x: box.x, y: box.y, w: box.size, h: box.size, width: 1.5 });
    this.items.push({ kind: 'text', text, x: box.x + box.size / 2, y: box.y + box.size / 2 + 1, font: FONTS.section, color: INK, align: 'center', baseline: 'middle' });
    this.extend(box.y - 1, box.y + box.size + 1);
  }
}

function drawInk(ctx2d: CanvasRenderingContext2D, items: readonly Ink[]) {
  for (const it of items) {
    ctx2d.save();
    if (it.kind === 'text') {
      ctx2d.font = it.font;
      ctx2d.fillStyle = it.color;
      ctx2d.textAlign = it.align;
      ctx2d.textBaseline = it.baseline;
      ctx2d.fillText(it.text, it.x, it.y);
    } else if (it.kind === 'line') {
      ctx2d.strokeStyle = it.color;
      ctx2d.lineWidth = it.width;
      ctx2d.lineCap = 'butt';
      ctx2d.beginPath();
      ctx2d.moveTo(it.x1, it.y1);
      ctx2d.lineTo(it.x2, it.y2);
      ctx2d.stroke();
    } else {
      ctx2d.strokeStyle = INK;
      ctx2d.lineWidth = it.width;
      ctx2d.strokeRect(it.x, it.y, it.w, it.h);
    }
    ctx2d.restore();
  }
}

/** Một ô nhịp đã dựng (toạ độ của dòng chứa nó). */
interface SheetMeasure {
  index: number;
  staves: Stave[];
  voices: Voice[];
  beams: Beam[];
  /** Mọi StaveNote (cả dấu lặng) theo từng khuông. */
  staffNotes: StaveNote[][];
  items: readonly LessonNote[];
  played: StaveNote[];
  accItems: readonly AccompanimentNote[];
  accompaniment: StaveNote[];
  /** Chỉ số (trong `lesson.notes`) của nốt đầu ô. */
  firstNote: number;
  /** Phách bắt đầu ô (nốt đen, tính từ đầu bài) và độ dài ô. */
  startBeat: number;
  beats: number;
}

/** Sắc thái + hình nêm của một dòng: chung một hàng (đường chân chữ `y`). */
interface DynamicsPlan {
  y: number;
  marks: { text: string; x: number; metrics: TextMetrics2 }[];
  /** Đoạn hình nêm trong dòng (`hairpin` = chỉ số trong `lesson.hairpins`). */
  hairpins: { hairpin: number; from: number; to: number }[];
}

interface SheetSystem {
  index: number;
  measures: SheetMeasure[];
  ink: InkList;
  dynamics: DynamicsPlan;
  /** y dời khi vẽ: toạ độ trên ảnh = toạ độ của dòng + offset. */
  offset: number;
}

/** Vị trí một nốt của bài trên tờ nhạc. */
interface NoteRef {
  system: SheetSystem;
  note: StaveNote;
}

/** Dữ liệu chung của cả bài để dựng từng dòng. */
interface SheetData {
  lesson: Lesson;
  measures: Measure<LessonNote>[];
  accMeasures?: Measure<AccompanimentNote>[];
  firstIndex: number[];
  starts: number[];
  /** Phần đầu của ô không mở dòng (vạch nhịp + khoảng đệm trước nốt). */
  pad: number;
}

/** Bề rộng phần đầu dòng: khoá + hoá biểu (+ số chỉ nhịp ở dòng đầu); hoặc chỉ vạch nhịp nếu không vẽ khoá. */
function headerWidthFor(lesson: Lesson, header: { clef: boolean; time: boolean }): number {
  const ys = lessonClefs(lesson).map((_, si) => si * GRAND_STAFF_GAP);
  return createMeasureStaves(lesson, 0, ys, 100, header, false).headerWidth;
}

/**
 * Bề rộng tự nhiên của phần nốt một ô trên tờ nhạc: dàn khít hơn màn hình, nhưng không hẹp hơn mức VexFlow cần
 * và đủ chỗ cho hàng tên nốt.
 */
function sheetNoteArea(ctx2d: CanvasRenderingContext2D, lesson: Lesson, measure: Measure<LessonNote>, mi: number, accItems: readonly AccompanimentNote[] | undefined, opts: ScoreSheetOptions): number {
  const spacing = naturalNoteArea(measure.items, accItems, SHEET_SPACING);
  const { staves: notes } = createMeasureNotes(lesson, measure.items, !(mi === 0 && lesson.pickup), accItems);
  const minimum = minNoteArea(lesson, notes) * MIN_WIDTH_FACTOR + MEASURE_PADDING;
  if (!opts.showNames) return Math.max(spacing, minimum);
  const widths = measure.items.map((n) => (n.rest ? 0 : measureText(ctx2d, pitchToLabel(n.pitch, opts.labelStyle), FONTS.label).width));
  const labels = labelNoteArea(measure.items.map((n) => DURATION_BEATS[n.duration]), widths, measureLength(lesson.timeSignature), LABEL_SPACE) + MEASURE_PADDING;
  return Math.max(spacing, minimum, labels);
}

/** Dựng các ô nhịp của một dòng ở toạ độ của dòng (khuông trên cùng ở y = 0, khuông dưới cách `gap`). */
function buildMeasures(data: SheetData, line: SystemLayout, si: number, gap: number): SheetMeasure[] {
  const { lesson } = data;
  const ys = lessonClefs(lesson).map((_, i) => i * gap);
  let x = MARGIN_X;
  return line.measures.map((mi, k) => {
    const measure = data.measures[mi];
    const noteArea = line.noteAreas[k] - data.pad;
    const isLast = mi === data.measures.length - 1;
    const { staves, headerWidth } = createMeasureStaves(lesson, x, ys, noteArea, { clef: k === 0, time: k === 0 && si === 0 }, isLast);
    const accItems = data.accMeasures?.[mi]?.items;
    const notes = createMeasureNotes(lesson, measure.items, !(mi === 0 && lesson.pickup), accItems);
    const { voices, beams } = formatMeasure(lesson, staves, notes.staves, noteArea);
    // Gán khuông + tính độ dốc móc ngay (Voice.draw / Beam.draw vốn làm lúc vẽ) để đo vị trí nốt, đuôi nốt trước khi vẽ.
    staves.forEach((st, i) => notes.staves[i].forEach((n) => n.setStave(st)));
    beams.forEach((b) => b.postFormat());
    x += headerWidth + noteArea;
    return {
      index: mi,
      staves,
      voices,
      beams,
      staffNotes: notes.staves,
      items: measure.items,
      played: notes.played,
      accItems: accItems ?? [],
      accompaniment: notes.accompaniment,
      firstNote: data.firstIndex[mi],
      startBeat: data.starts[mi],
      beats: measure.beats,
    };
  });
}

/** Mép trên / dưới của một nốt (đầu nốt, dòng kẻ phụ, đuôi nốt + móc). */
function noteExtent(note: StaveNote): [number, number] | null {
  if (note.isRest()) return null;
  const ys = note.getYs();
  let top = Math.min(...ys) - 6;
  let bottom = Math.max(...ys) + 6;
  if (note.hasStem()) {
    const { topY, baseY } = note.getStemExtents();
    top = Math.min(top, topY, baseY);
    bottom = Math.max(bottom, topY, baseY);
  }
  return [top, bottom];
}

const firstStaff = (s: SheetSystem) => s.measures[0].staves;
const lineStart = (s: SheetSystem) => s.measures[0].staves[0].getNoteStartX();
const measureEnd = (m: SheetMeasure) => m.staves[0].getX() + m.staves[0].getWidth();
const lineEnd = (s: SheetSystem) => measureEnd(s.measures[s.measures.length - 1]);

/** Một mảng mực theo chiều ngang [x0, x1] × chiều dọc [top, bottom]. */
interface Span {
  x0: number;
  x1: number;
  top: number;
  bottom: number;
}

const overlaps = (a: Span, b: Span) => a.x0 < b.x1 && b.x0 < a.x1;

/** Mực của nốt + móc trên khuông `si` của một dòng (đầu nốt, dòng kẻ phụ, đuôi nốt, móc nối). */
function staffSpans(measures: readonly SheetMeasure[], si: number): Span[] {
  const spans: Span[] = [];
  for (const m of measures) {
    const notes = m.staffNotes[si];
    for (const n of notes) {
      const e = noteExtent(n);
      if (!e) continue;
      const xs = [n.getNoteHeadBeginX(), n.getNoteHeadEndX(), ...(n.hasStem() ? [n.getStemX()] : [])];
      // Cờ móc (nốt không nối móc) chìa sang phải đuôi nốt.
      if (n.shouldDrawFlag()) xs.push(n.getStemX() + FLAG_WIDTH);
      spans.push({ x0: Math.min(...xs) - 2, x1: Math.max(...xs) + 2, top: e[0], bottom: e[1] });
    }
    for (const beam of m.beams) {
      const beamed = beam.getNotes();
      if (!notes.includes(beamed[0] as StaveNote)) continue;
      const tips = beamed.map((n) => n.getStemExtents().topY);
      spans.push({ x0: beamed[0].getStemX(), x1: beamed[beamed.length - 1].getStemX(), top: Math.min(...tips) - 3, bottom: Math.max(...tips) + 3 });
    }
  }
  return spans;
}

/**
 * Số ngón (một chồng) nâng lên vừa đủ nếu ngay dưới có mực của khuông đó (đầu nốt, đuôi nốt quay lên, móc nối, cờ):
 * hàng số ngón cố định của khuông màn hình chỉ tránh đầu nốt. Không đè thì giữ nguyên hàng cố định.
 */
function liftFingerRows(rows: { text: string; y: number }[], x: number, spans: readonly Span[]): { text: string; y: number }[] {
  if (!rows.length) return rows;
  const digit = { x0: x - FINGER_HALF_WIDTH, x1: x + FINGER_HALF_WIDTH, top: 0, bottom: 0 };
  let top = Infinity;
  for (const s of spans) if (overlaps(s, digit)) top = Math.min(top, s.top);
  const shift = Math.min(0, top - FINGER_CLEAR - rows[0].y);
  return shift ? rows.map((r) => ({ ...r, y: r.y + shift })) : rows;
}

/**
 * Hàng sắc thái + hình nêm của một dòng: dưới khuông trên cùng (giữa hai khuông nếu là khuông đôi), thấp hơn mọi đầu
 * nốt của khuông đó như khuông màn hình, và thấp hơn đuôi nốt / móc nằm ngay trên từng ký hiệu (không đè như bản in).
 */
function planDynamics(ctx2d: CanvasRenderingContext2D, lesson: Lesson, measures: readonly SheetMeasure[], dynamicAt: ReadonlySet<number>): DynamicsPlan {
  const local = new Map<number, { note: StaveNote; measure: SheetMeasure }>();
  for (const m of measures) m.played.forEach((note, k) => local.set(m.firstNote + k, { note, measure: m }));
  const first = measures[0];
  const last = measures[measures.length - 1];
  const lo = first.firstNote;
  const hi = last.firstNote + last.items.length;

  const marks = (lesson.dynamics ?? []).flatMap((d) => {
    const ref = local.get(d.index);
    if (!ref) return [];
    const text = dynamicGlyphs(d.mark);
    return [{ text, x: noteCenterX(ref.note), metrics: measureText(ctx2d, text, FONTS.dynamic) }];
  });
  // Hình nêm: từ nốt `from` tới trước nốt sau `to` (chừa chỗ cho chữ sắc thái ở hai đầu); phần nằm ở dòng khác bị cắt ở mép dòng.
  const hairpins = (lesson.hairpins ?? []).flatMap((h, hairpin) => {
    if (h.to < lo || h.from >= hi) return [];
    const a = local.get(h.from);
    const b = local.get(h.to);
    const from = a ? noteCenterX(a.note) - (dynamicAt.has(h.from) ? -16 : 6) : first.staves[0].getNoteStartX() - 4;
    let to = measureEnd(last) - 6;
    if (b) {
      const next = local.get(h.to + 1);
      to = next ? noteCenterX(next.note) - (dynamicAt.has(h.to + 1) ? 20 : 10) : measureEnd(b.measure) - 6;
    }
    return [{ hairpin, from, to }];
  });

  const topBottom = first.staves[0].getYForLine(4);
  const heads = measures.flatMap((m) => m.staffNotes[0].filter((n) => !n.isRest()).map((n) => Math.max(...n.getYs())));
  let y = Math.max(topBottom + DYNAMIC_OFFSET, ...heads.map((h) => h + DYNAMIC_BELOW_NOTE));
  const upper = staffSpans(measures, 0);
  for (const mark of marks) {
    const span = { x0: mark.x - mark.metrics.width / 2, x1: mark.x + mark.metrics.width / 2, top: 0, bottom: 0 };
    for (const s of upper) if (overlaps(s, span)) y = Math.max(y, s.bottom + DYNAMIC_CLEAR + mark.metrics.ascent);
  }
  for (const seg of hairpins) {
    const span = { x0: seg.from, x1: seg.to, top: 0, bottom: 0 };
    for (const s of upper) if (overlaps(s, span)) y = Math.max(y, s.bottom + DYNAMIC_CLEAR + HAIRPIN_RISE + HAIRPIN_OPEN / 2);
  }
  return { y, marks, hairpins };
}

/**
 * Dựng một dòng. Khuông đôi: nếu nốt / đuôi nốt / sắc thái phía khuông Sol chạm nốt / đuôi nốt / số ngón phía khuông Fa
 * (khuông màn hình cách nhau cố định) thì dựng lại dòng đó với hai khuông xa nhau hơn cho vừa đủ hở.
 */
function buildSystem(ctx2d: CanvasRenderingContext2D, data: SheetData, line: SystemLayout, si: number, dynamicAt: ReadonlySet<number>): SheetSystem {
  const { lesson } = data;
  let measures = buildMeasures(data, line, si, GRAND_STAFF_GAP);
  let dynamics = planDynamics(ctx2d, lesson, measures, dynamicAt);
  if (lessonClefs(lesson).length > 1) {
    const upper: Span[] = [
      ...staffSpans(measures, 0),
      ...dynamics.marks.map((m) => ({ x0: m.x - m.metrics.width / 2, x1: m.x + m.metrics.width / 2, top: dynamics.y - m.metrics.ascent, bottom: dynamics.y + m.metrics.descent })),
      ...dynamics.hairpins.map((h) => ({ x0: h.from, x1: h.to, top: 0, bottom: dynamics.y - HAIRPIN_RISE + HAIRPIN_OPEN / 2 })),
    ];
    // Phía khuông Fa: nốt + móc, và số ngón của nốt tay trái trong giai điệu (vẽ phía trên khuông Fa).
    const bass = staffSpans(measures, 1);
    const lower = [...bass];
    for (const m of measures) {
      const bassTop = m.staves[1].getYForLine(0);
      m.items.forEach((n, ni) => {
        if (n.rest || staffOf(lesson, n) !== 1) return;
        const x = noteCenterX(m.played[ni]);
        for (const row of liftFingerRows(noteFingerRows(n, m.played[ni], bassTop), x, bass)) {
          lower.push({ x0: x - FINGER_HALF_WIDTH, x1: x + FINGER_HALF_WIDTH, top: row.y - FINGER_GLYPH, bottom: row.y });
        }
      });
    }
    let extra = 0;
    for (const u of upper) for (const l of lower) if (overlaps(u, l)) extra = Math.max(extra, u.bottom + STAFF_CLEAR - l.top);
    if (extra > 0) {
      measures = buildMeasures(data, line, si, GRAND_STAFF_GAP + Math.ceil(extra));
      dynamics = planDynamics(ctx2d, lesson, measures, dynamicAt);
    }
  }
  return { index: si, measures, ink: new InkList(ctx2d), dynamics, offset: 0 };
}

/** Dựng toàn bộ tờ nhạc: các dòng đã xếp chỗ + chiều cao ảnh + chân trang. */
function layoutSheet(ctx2d: CanvasRenderingContext2D, lesson: Lesson, opts: ScoreSheetOptions) {
  const measures = splitMeasures(lesson.notes, measureLength(lesson.timeSignature), lesson.pickup);
  const accMeasures = accompanimentMeasures(lesson);
  const firstIndex: number[] = [];
  const starts: number[] = [];
  measures.reduce(
    (acc, m) => {
      firstIndex.push(acc.i);
      starts.push(acc.beat);
      return { i: acc.i + m.items.length, beat: acc.beat + m.beats };
    },
    { i: 0, beat: 0 },
  );
  starts.push(starts.length ? starts[starts.length - 1] + measures[measures.length - 1].beats : 0);
  const pad = headerWidthFor(lesson, { clef: false, time: false });
  const data: SheetData = { lesson, measures, accMeasures, firstIndex, starts, pad };

  // Mỗi ô tính cả phần đầu của ô không mở dòng (`pad`); dòng mở bằng khoá thay phần đó bằng phần đầu dòng.
  const widths = measures.map((m, mi) => sheetNoteArea(ctx2d, lesson, m, mi, accMeasures?.[mi]?.items, opts) + pad);
  const firstHeader = headerWidthFor(lesson, { clef: true, time: true });
  const otherHeader = headerWidthFor(lesson, { clef: true, time: false });
  const lines = layoutSystems(widths, { lineWidth: SHEET_WIDTH - 2 * MARGIN_X, headerWidth: (li) => (li === 0 ? firstHeader : otherHeader) - pad });

  const dynamicAt = new Set((lesson.dynamics ?? []).map((d) => d.index));
  const systems = lines.map((line, si) => buildSystem(ctx2d, data, line, si, dynamicAt));
  const refs: NoteRef[] = [];
  for (const system of systems) {
    for (const measure of system.measures) measure.played.forEach((note, k) => (refs[measure.firstNote + k] = { system, note }));
  }
  const clefs = lessonClefs(lesson);
  const hasFingers = lesson.notes.some((n) => n.finger || n.harmony?.some((h) => h.finger));
  /** Đỉnh phần đã vẽ phía trên từng nốt (đặt ký hiệu hợp âm không đè số ngón / nốt cao). */
  const stackTops: number[] = [];

  for (const system of systems) {
    const { ink } = system;
    const staffTops = firstStaff(system).map((st) => st.getYForLine(0));
    const staveBottom = firstStaff(system)[clefs.length - 1].getYForLine(4);
    const spans = clefs.map((_, si) => staffSpans(system.measures, si));

    // Nốt, đuôi nốt, móc: mép mực của dòng (khoá + khuông tính sau khi xếp hàng chữ, xem cuối vòng lặp).
    for (const m of system.measures) {
      for (const note of m.staffNotes.flat()) {
        const e = noteExtent(note);
        if (e) ink.extend(e[0], e[1]);
      }
    }

    system.measures.forEach((m, k) => {
      // Số ô nhịp đầu mỗi dòng (trừ dòng đầu); ô lấy đà không đánh số.
      if (k === 0 && system.index > 0) {
        ink.text(String(lesson.pickup ? m.index : m.index + 1), m.staves[0].getX(), staffTops[0] - 14, FONTS.measureNumber, { color: MUTED, align: 'left' });
      }
      const section = sectionAt(lesson, m.index);
      if (section) ink.boxed(section, sectionBox(m.staves[0]));

      // Số ngón phía trên khuông của nốt (chùm nốt: xếp chồng phía trên chùm).
      m.items.forEach((n, ni) => {
        const i = m.firstNote + ni;
        const note = m.played[ni];
        const staffTop = staffTops[staffOf(lesson, n)];
        stackTops[i] = n.rest ? staffTop : Math.min(staffTop, noteTop(note));
        if (n.rest) return;
        for (const row of liftFingerRows(noteFingerRows(n, note, staffTop), noteCenterX(note), spans[staffOf(lesson, n)])) {
          ink.text(row.text, noteCenterX(note), row.y, FONTS.finger);
          stackTops[i] = Math.min(stackTops[i], row.y - FINGER_GLYPH);
        }
      });

      // Số ngón phần đệm: chồng dưới khuông Fa.
      m.accItems.forEach((n, ai) => {
        for (const row of accompanimentFingerRows(n, m.accompaniment[ai], staveBottom)) ink.text(row.text, noteCenterX(m.accompaniment[ai]), row.y, FONTS.lhFinger);
      });
    });

    // Nhịp độ gợi ý đầu bài: "♩ = 76" phía trên khoá của dòng đầu.
    if (system.index === 0 && lesson.tempo) {
      const x0 = firstStaff(system)[0].getX();
      const y = staffTops[0] - TEMPO_RISE;
      const note = ink.text(QUARTER_GLYPH, x0, y, FONTS.metronome, { align: 'left' });
      ink.text(`= ${lesson.tempo}`, x0 + note.width + 5, y, FONTS.tempo, { align: 'left' });
    }

    // Dấu sắc thái (glyph Bravura) ngay dưới nốt bắt đầu đoạn, chung một hàng trong dòng (xem `planDynamics`).
    for (const mark of system.dynamics.marks) ink.text(mark.text, mark.x, system.dynamics.y, FONTS.dynamic);
  }

  // Ký hiệu hợp âm: phía trên số ngón; mỗi ký hiệu nằm trên mọi nốt (cùng dòng) tới ký hiệu kế tiếp.
  if (lesson.chordSymbols?.length && lesson.clef !== 'bass') {
    lesson.chordSymbols.forEach((c, k) => {
      const ref = refs[c.index];
      if (!ref) return;
      const staffTop = firstStaff(ref.system)[0].getYForLine(0);
      const base = staffTop - (hasFingers ? FINGER_OFFSET + FINGER_GLYPH : 0) - CHORD_GAP;
      const end = lesson.chordSymbols![k + 1]?.index ?? lesson.notes.length;
      let above = Infinity;
      for (let i = c.index; i < Math.max(c.index + 1, end); i++) if (refs[i]?.system === ref.system) above = Math.min(above, stackTops[i]);
      ref.system.ink.text(displayChordSymbol(c.symbol), ref.note.getNoteHeadBeginX() - 2, Math.min(base, above - CHORD_GAP), FONTS.chord, { align: 'left' });
    });
  }

  // To dần / nhỏ dần: hình nêm cùng hàng sắc thái; vắt qua dòng thì mỗi dòng một đoạn, độ mở nối tiếp nhau.
  (lesson.hairpins ?? []).forEach((h, hi) => {
    const segments = systems.flatMap((system) => system.dynamics.hairpins.filter((seg) => seg.hairpin === hi).map((seg) => ({ system, ...seg })));
    if (!segments.length || segments.some((seg) => seg.to <= seg.from + 8)) return;
    const openings = hairpinOpenings(
      segments.map((seg) => seg.to - seg.from),
      h.type,
      HAIRPIN_OPEN,
    );
    segments.forEach((seg, i) => {
      const yc = seg.system.dynamics.y - HAIRPIN_RISE;
      const [o0, o1] = openings[i];
      seg.system.ink.line(seg.from, yc - o0 / 2, seg.to, yc - o1 / 2);
      seg.system.ink.line(seg.from, yc + o0 / 2, seg.to, yc + o1 / 2);
    });
  });

  // Tên nốt: một hàng dưới khuông dưới cùng, ngay dưới nốt / số ngón thấp nhất của dòng.
  if (opts.showNames) {
    const ascent = measureText(ctx2d, 'ĐÔ', FONTS.label).ascent;
    for (const system of systems) {
      const staveBottom = firstStaff(system)[clefs.length - 1].getYForLine(4);
      const y = Math.max(staveBottom + LABEL_MIN, system.ink.bottom + LABEL_GAP + ascent);
      for (const m of system.measures) {
        m.items.forEach((n, ni) => {
          if (!n.rest) system.ink.text(pitchToLabel(n.pitch, opts.labelStyle), noteCenterX(m.played[ni]), y, FONTS.label, { color: MUTED });
        });
      }
    }
  }

  drawPedals(ctx2d, lesson, systems, data);

  // Khoá, khuông, ngoặc nhọn: thêm vào mép mực sau cùng (hàng chữ chỉ cần tránh nốt, không cần tránh đuôi khoá Sol).
  for (const system of systems) {
    const staves = firstStaff(system);
    system.ink.extend(staves[0].getYForLine(0) - 16, staves[staves.length - 1].getYForLine(4) + 18);
  }

  // Xếp các dòng nối tiếp theo mép mực.
  let cursor = FIRST_SYSTEM_TOP;
  for (const system of systems) {
    system.offset = cursor - system.ink.top;
    cursor = system.offset + system.ink.bottom + SYSTEM_GAP;
  }
  const musicBottom = systems.length ? cursor - SYSTEM_GAP : FIRST_SYSTEM_TOP;

  // Chân trang: nguồn bản nhạc (xuống dòng cho vừa khổ) + tên app.
  const sourceLines = lesson.source ? wrapText(lesson.source, SHEET_WIDTH - 2 * MARGIN_X - 110, (s) => measureText(ctx2d, s, FONTS.footer).width) : [];
  const footerTop = musicBottom + FOOTER_GAP;
  const height = Math.ceil(footerTop + 14 + Math.max(1, sourceLines.length) * FOOTER_LINE + FOOTER_BOTTOM);
  return { systems, height, footerTop, sourceLines, measureCount: measures.length };
}

/**
 * Ký hiệu pedal: "Ped." + đường kẻ, gạch đứng ở chỗ nhả; thay pedal liền nhau trong một dòng → khấc "^" ở chỗ thay.
 * Pedal vắt qua dòng: đường kẻ chạy tới hết dòng rồi nối tiếp ở đầu dòng sau; thay pedal đúng chỗ xuống dòng thì
 * dòng trước có gạch nhả, dòng sau ghi lại "Ped.".
 */
function drawPedals(ctx2d: CanvasRenderingContext2D, lesson: Lesson, systems: SheetSystem[], data: SheetData) {
  if (!lesson.pedal?.length || !systems.length) return;
  // Các ô theo thứ tự bài (dòng nối tiếp nhau nên `all[i].measure.index === i`).
  const all = systems.flatMap((system) => system.measures.map((measure) => ({ system, measure })));
  const eps = 1e-9;
  /**
   * Chỗ của phách `beat` (tính từ đầu bài): đúng đầu ô → đầu phần nốt của ô (`start`) hoặc vạch nhịp cuối ô trước (`end`);
   * giữa ô → ngay trước nốt ở phách đó (như khuông màn hình).
   */
  const locate = (beat: number, edge: 'start' | 'end') => {
    const i = data.starts.findIndex((s) => Math.abs(s - beat) < eps);
    if (i >= 0 && (edge === 'end' ? i > 0 : i < all.length)) {
      const at = all[edge === 'end' ? i - 1 : i];
      return { system: at.system, x: edge === 'end' ? measureEnd(at.measure) : at.measure.staves[0].getNoteStartX() };
    }
    let mi = 0;
    for (let k = 0; k < all.length; k++) if (data.starts[k] <= beat + eps) mi = k;
    const at = all[mi];
    return { system: at.system, x: beatX(at.measure, beat - at.measure.startBeat) - 6 };
  };
  const ranges = pedalRanges(lesson).map((r) => ({ ...r, start: locate(r.startBeat, 'start'), end: locate(r.endBeat, 'end') }));
  const ped = measureText(ctx2d, PED_GLYPH, FONTS.pedal);
  type Seg = { from: number; to: number; begin: 'ped' | 'notch' | 'continue'; end: 'tick' | 'notch' | 'continue' };
  const segments = new Map<SheetSystem, Seg[]>();
  ranges.forEach((r, i) => {
    const prev = ranges[i - 1];
    const next = ranges[i + 1];
    // Thay pedal liền nhau (khấc) chỉ khi chỗ thay nằm trong cùng một dòng.
    const chainedBefore = !!prev && Math.abs(prev.endBeat - r.startBeat) < eps && prev.end.system === r.start.system;
    const chainedAfter = !!next && Math.abs(r.endBeat - next.startBeat) < eps && r.end.system === next.start.system;
    for (let s = r.start.system.index; s <= r.end.system.index; s++) {
      const system = systems[s];
      const first = s === r.start.system.index;
      const last = s === r.end.system.index;
      const seg: Seg = {
        from: first ? (chainedBefore ? locate(r.startBeat, 'end').x : r.start.x) : lineStart(system) - 4,
        to: last ? r.end.x - (chainedAfter ? 0 : 4) : lineEnd(system),
        begin: first ? (chainedBefore ? 'notch' : 'ped') : 'continue',
        end: last ? (chainedAfter ? 'notch' : 'tick') : 'continue',
      };
      segments.set(system, [...(segments.get(system) ?? []), seg]);
    }
  });

  for (const [system, segs] of segments) {
    const staves = firstStaff(system);
    const y = Math.max(staves[staves.length - 1].getYForLine(4) + PEDAL_MIN, system.ink.bottom + PEDAL_GAP + ped.ascent);
    const { ink } = system;
    for (const seg of segs) {
      let x = seg.from;
      if (seg.begin === 'ped') {
        ink.text(PED_GLYPH, seg.from, y, FONTS.pedal, { align: 'left' });
        x = seg.from + ped.width + 4;
      } else if (seg.begin === 'notch') {
        ink.line(seg.from, y - PEDAL_TICK, seg.from + PEDAL_NOTCH, y);
        x = seg.from + PEDAL_NOTCH;
      }
      if (seg.end === 'notch') {
        if (seg.to - PEDAL_NOTCH > x) ink.line(x, y, seg.to - PEDAL_NOTCH, y);
        ink.line(seg.to - PEDAL_NOTCH, y, seg.to, y - PEDAL_TICK);
      } else {
        const to = Math.max(seg.to, x);
        if (to > x) ink.line(x, y, to, y);
        if (seg.end === 'tick') ink.line(to, y, to, y - PEDAL_TICK);
      }
    }
  }
}

/** x của phách `beat` (tính từ đầu ô) trong một ô: đầu nốt bắt đầu đúng phách đó, không có thì nội suy (cuối ô = vạch nhịp). */
function beatX(m: SheetMeasure, beat: number): number {
  const points: { beat: number; x: number }[] = [{ beat: 0, x: m.staves[0].getNoteStartX() }];
  const add = (items: readonly { duration: keyof typeof DURATION_BEATS }[], notes: readonly StaveNote[]) => {
    let b = 0;
    items.forEach((n, i) => {
      if (notes[i]) points.push({ beat: b, x: notes[i].getNoteHeadBeginX() });
      b += DURATION_BEATS[n.duration];
    });
  };
  add(m.items, m.played);
  add(m.accItems, m.accompaniment);
  points.push({ beat: m.beats, x: measureEnd(m) });
  points.sort((a, b) => a.beat - b.beat || a.x - b.x);
  const exact = points.find((p) => Math.abs(p.beat - beat) < 1e-9 && p.beat > 0);
  if (exact) return exact.x;
  const after = points.findIndex((p) => p.beat > beat);
  if (after <= 0) return points[Math.max(0, after)].x;
  const a = points[after - 1];
  const c = points[after];
  return a.x + ((c.x - a.x) * (beat - a.beat)) / (c.beat - a.beat);
}

/** Vẽ bản nhạc vào `canvas` (tự đặt kích thước). Phải gọi sau khi font Bravura đã nạp. */
export function renderScoreSheet(canvas: HTMLCanvasElement, lesson: Lesson, opts: ScoreSheetOptions): void {
  const ctx2d = canvas.getContext('2d');
  if (!ctx2d) throw new Error('Trình duyệt không hỗ trợ canvas 2D');
  const { systems, height, footerTop, sourceLines, measureCount } = layoutSheet(ctx2d, lesson, opts);

  const ctx = new CanvasContext(ctx2d);
  ctx.resize(SHEET_WIDTH, height, sheetPixelScale(SHEET_WIDTH, height, opts.scale ?? 2));
  ctx2d.fillStyle = '#ffffff';
  ctx2d.fillRect(0, 0, SHEET_WIDTH, height);

  // Tiêu đề + thông tin bài.
  const info = [
    CLEF_LABEL[lesson.clef],
    lesson.keySignature ? keySignatureName(lesson.keySignature) : null,
    `Nhịp ${lesson.timeSignature.join('/')}`,
    HAND_LABEL[lesson.hand],
    `${lesson.notes.length} nốt`,
  ].filter(Boolean);
  drawInk(ctx2d, [
    { kind: 'text', text: lesson.title, x: SHEET_WIDTH / 2, y: TITLE_Y, font: FONTS.title, color: INK, align: 'center', baseline: 'alphabetic' },
    { kind: 'text', text: info.join(' · '), x: SHEET_WIDTH / 2, y: INFO_Y, font: FONTS.info, color: MUTED, align: 'center', baseline: 'alphabetic' },
  ]);

  for (const system of systems) {
    ctx2d.save();
    ctx2d.translate(0, system.offset);
    // VexFlow vẽ glyph tại mép trái (xem đầu file): canh trái, chân chữ mặc định, mực đen.
    ctx2d.textAlign = 'left';
    ctx2d.textBaseline = 'alphabetic';
    ctx.setFillStyle(INK);
    ctx.setStrokeStyle(INK);
    system.measures.forEach((m, k) => drawMeasure(ctx, m.staves, m.voices, m.beams, { first: k === 0, last: m.index === measureCount - 1 }));
    drawInk(ctx2d, system.ink.items);
    ctx2d.restore();
  }

  // Chân trang: đường kẻ mảnh, nguồn bản nhạc + tên app.
  const footer: Ink[] = [{ kind: 'line', x1: MARGIN_X, y1: footerTop, x2: SHEET_WIDTH - MARGIN_X, y2: footerTop, width: 1, color: RULE }];
  sourceLines.forEach((text, i) => footer.push({ kind: 'text', text, x: MARGIN_X, y: footerTop + 22 + i * FOOTER_LINE, font: FONTS.footer, color: MUTED, align: 'left', baseline: 'alphabetic' }));
  footer.push({ kind: 'text', text: 'VietPiano', x: SHEET_WIDTH - MARGIN_X, y: footerTop + 22, font: FONTS.footer, color: MUTED, align: 'right', baseline: 'alphabetic' });
  drawInk(ctx2d, footer);
}
