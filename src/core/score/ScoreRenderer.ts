/**
 * ScoreRenderer — vẽ bài học thành MỘT dòng khuông nhạc dài bằng VexFlow (SVG).
 * Bài hai tay vẽ trên khuông đôi: nốt tay phải ở khoá Sol, tay trái ở khoá Fa, khuông còn lại hiện dấu lặng.
 * Bài có phần đệm (`lesson.accompaniment`): khuông Fa vẽ phần đệm (cả hợp âm) cùng lúc với giai điệu.
 *
 * Vẽ một lần cho mỗi bài; việc tô sáng nốt hiện tại/đúng/sai được làm bằng CSS class
 * trên từng nhóm SVG của nốt (mọi nét vẽ dùng `currentColor`), nên chuyển nốt rất nhẹ.
 * Vị trí x của từng nốt được trả về để UI tự cuộn.
 */
import {
  Accidental,
  BarlineType,
  Beam,
  Fraction,
  Dot,
  Formatter,
  Renderer,
  Stave,
  StaveConnector,
  StaveNote,
  Voice,
  type RenderContext,
} from 'vexflow/bravura';
import { pedalRanges } from '../curriculum/piece';
import { splitMeasures, type Measure } from '../lessons/notation';
import { measureStarts } from '../lessons/positions';
import { DURATION_BEATS, fingerText, measureLength, noteHand, sectionAt, type AccompanimentNote, type Clef, type Duration, type Lesson, type LessonNote } from '../lessons/types';
import { displayChordSymbol } from '../music/chordSymbols';
import { measureAccidentals } from '../music/keySignature';
import { pitchToLabel, type NoteLabelStyle } from '../music/notes';

export interface ScoreRenderOptions {
  showNames: boolean;
  labelStyle: NoteLabelStyle;
  /** Vẽ số chỉ nhịp ở đầu khuông (mặc định có). Thẻ nốt lẻ của trò chơi bỏ đi cho gọn. */
  timeSignature?: boolean;
  /** Vẽ số ngón tay (mặc định có). */
  showFingers?: boolean;
  /** Vẽ ký hiệu hợp âm phía trên khuông khi bài có (mặc định có). */
  showChords?: boolean;
  /** Vẽ ký hiệu pedal khi bài có (mặc định có). Ẩn chỉ đổi hình vẽ — vẫn chấm pedal. */
  showPedal?: boolean;
}

export interface RenderedScore {
  /** Kích thước SVG theo đơn vị VexFlow (chưa scale). */
  width: number;
  height: number;
  /** Tâm đầu nốt theo trục x cho từng nốt. */
  noteCenters: number[];
  /** Nhóm SVG của từng nốt (để gán class trạng thái). */
  noteElements: (SVGElement | null)[];
  /** Ô chữ tên nốt của từng nốt. */
  labelElements: (SVGTextElement | null)[];
  /** Số ngón tay phía trên khuông (null nếu nốt không ghi ngón). */
  fingerElements: (SVGTextElement | null)[];
  /** Tâm x + nhóm SVG của từng nốt / hợp âm / dấu lặng phần đệm (cùng thứ tự `lesson.accompaniment`; rỗng nếu không có). */
  accompanimentCenters: number[];
  accompanimentElements: (SVGElement | null)[];
  /** Hình chữ nhật tô nền nốt hiện tại. */
  cursor: SVGRectElement;
}

const STAVE_Y = 30;
const LEFT_PAD = 16;
/** Chỗ cho dấu ngoặc nhọn bên trái khuông đôi. */
const BRACE_PAD = 14;
const RIGHT_PAD = 40;
/** Chiều cao vùng vẽ khi chỉ có một khuông. */
export const SCORE_HEIGHT = 190;
/** Khoảng cách theo chiều dọc giữa hai khuông của khuông đôi. */
export const GRAND_STAFF_GAP = 110;

const NOTE_SPACE: Record<Duration, number> = { '16': 32, '8': 40, '8d': 46, q: 54, qd: 62, h: 72, hd: 84, w: 100 };
/** Khoảng đệm cuối mỗi ô nhịp (ngoài phần dàn nốt). */
export const MEASURE_PADDING = 24;
const LEDGER_STYLE = { strokeStyle: 'currentColor', lineWidth: 2 };
/** Khoảng cách từ dòng kẻ trên cùng lên đường chân chữ của hàng số ngón tay. */
export const FINGER_OFFSET = 12;
/** Số ngón tay phần đệm: chồng dưới nốt (dưới cả đuôi nốt quay xuống), dòng đầu cách điểm thấp nhất `LH_FINGER_TOP`. */
export const LH_FINGER_TOP = 15;
export const LH_FINGER_STEP = 13;
/** Hàng tên nốt: cách dòng kẻ dưới cùng của khuông dưới; bài có phần đệm chừa thêm chỗ cho số ngón tay trái. */
export const LABEL_OFFSET = 58;
export const LABEL_OFFSET_ACCOMPANIMENT = 84;
/** Dấu sắc thái (p, f…): dưới khuông Sol (giữa hai khuông nếu là khuông đôi), tối thiểu cách dòng kẻ dưới cùng. */
export const DYNAMIC_OFFSET = 32;
/** …và cách tâm nốt thấp nhất trên khuông đó (nốt có dòng kẻ phụ như Đô4, Sol3). */
export const DYNAMIC_BELOW_NOTE = 26;
/** Khuông đơn có dấu sắc thái: hàng tên nốt lùi xuống nhường chỗ. */
export const DYNAMIC_SPACE = 22;
/** Ký hiệu pedal: hàng dưới hàng tên nốt (khoảng cách từ hàng tên nốt), bài có pedal cao thêm `PEDAL_SPACE`. */
export const PEDAL_OFFSET = 30;
export const PEDAL_SPACE = 34;
/** Chiều cao gạch đứng chỗ nhả / thay pedal. */
const PEDAL_TICK = 10;
/** Nửa bề ngang khấc "^" ở chỗ thay pedal. */
const PEDAL_NOTCH = 5;
/** Chừa chỗ cho chữ "Ped." trước đường kẻ. */
const PEDAL_TEXT_WIDTH = 34;
/** Chùm nốt tay phải: các số ngón xếp chồng, mỗi hàng cách nhau bấy nhiêu (nốt thấp ở dưới, nốt giai điệu trên cùng). */
export const FINGER_ROW_STEP = 16;
/** Chiều cao chữ số ngón (để chừa chỗ phía trên). */
const FINGER_GLYPH = 14;
/** Khoảng hở tối thiểu giữa số ngón và đầu nốt / đỉnh đuôi nốt phía dưới. */
const HEAD_CLEAR = 7;
const STEM_CLEAR = 6;
/** Ký hiệu hợp âm: cách đỉnh chồng số ngón / đỉnh nốt phía dưới. */
const CHORD_GAP = 8;
const CHORD_GLYPH = 16;
/** Hình nêm to dần / nhỏ dần: độ mở ở đầu rộng. */
const HAIRPIN_OPEN = 12;
/** Khoảng trống thêm phía trên khi bài có chữ đánh dấu đoạn (khung chữ nằm trên hàng số ngón tay). */
export const SECTION_SPACE = 24;
/** Khung chữ đánh dấu đoạn: cạnh vuông, khoảng cách từ đáy khung tới dòng kẻ trên cùng (trên hàng số ngón tay). */
export const SECTION_BOX = 24;
const SECTION_BOX_GAP = 36;

/** Khung chữ đánh dấu đoạn ở đầu phần nốt của ô nhịp (khuông trên cùng). */
export function sectionBox(stave: Stave): { x: number; y: number; size: number } {
  return { x: stave.getNoteStartX() + 2, y: stave.getYForLine(0) - SECTION_BOX_GAP - SECTION_BOX, size: SECTION_BOX };
}

/** "C#4" → "c#/4" (định dạng khoá của VexFlow). */
function toVexKey(pitch: string): string {
  const m = /^([A-G])([#b]?)(-?\d)$/.exec(pitch)!;
  return `${m[1].toLowerCase()}${m[2]}/${m[3]}`;
}

// Font Bravura (nhúng base64) được nạp bất đồng bộ; phải chờ trước khi vẽ lần đầu.
let fontsPromise: Promise<unknown> | null = null;
export function scoreFontsReady(): Promise<unknown> {
  fontsPromise ??=
    typeof document !== 'undefined' && document.fonts
      ? Promise.all([document.fonts.load('30px Bravura'), document.fonts.load('12px Academico')]).catch(() => undefined)
      : Promise.resolve();
  return fontsPromise;
}

/** Bề rộng tự nhiên của phần nốt trong một ô nhịp (đã gồm khoảng đệm); có phần đệm thì lấy bè dày hơn. */
export function naturalNoteArea(items: readonly { duration: Duration }[], accompaniment: readonly { duration: Duration }[] = []): number {
  const area = (xs: readonly { duration: Duration }[]) => xs.reduce((sum, n) => sum + NOTE_SPACE[n.duration], 0);
  return Math.max(area(items), area(accompaniment)) + MEASURE_PADDING;
}

/** Các ô nhịp của phần đệm (cùng cách chia với giai điệu); không có phần đệm → undefined. */
export function accompanimentMeasures(lesson: Lesson): Measure<AccompanimentNote>[] | undefined {
  if (!lesson.accompaniment?.length) return undefined;
  return splitMeasures(lesson.accompaniment, measureLength(lesson.timeSignature), lesson.pickup);
}

/**
 * Toạ độ y (đường chân chữ) của từng số ngón tay phần đệm, nốt cao ở trên như bản in.
 * Bắt đầu dưới điểm thấp nhất của nốt (đầu nốt, đuôi nốt quay xuống) để số không đè lên đuôi nốt.
 */
export function accompanimentFingerRows(note: AccompanimentNote, staveNote: StaveNote, staveBottom: number): { text: string; y: number }[] {
  if (!note.fingers.some(Boolean)) return [];
  const { topY, baseY } = staveNote.getStemExtents();
  const lowest = Math.max(staveBottom, ...staveNote.getYs(), staveNote.getStemDirection() < 0 ? Math.max(topY, baseY) : -Infinity);
  const rows: { text: string; y: number }[] = [];
  let row = 0;
  for (let i = note.fingers.length - 1; i >= 0; i--) {
    const f = note.fingers[i];
    if (f) rows.push({ text: fingerText(f, note.fingersCircled[i]), y: lowest + LH_FINGER_TOP + row++ * LH_FINGER_STEP });
  }
  return rows;
}

/** Đỉnh của nốt (đầu nốt cao nhất, hoặc đỉnh đuôi nốt quay lên), theo trục y SVG (nhỏ = cao). */
function noteTop(staveNote: StaveNote): number {
  const { topY, baseY } = staveNote.getStemExtents();
  return Math.min(...staveNote.getYs(), staveNote.getStemDirection() > 0 ? Math.min(topY, baseY) : Infinity);
}

/**
 * Toạ độ y (đường chân chữ) của từng số ngón tay của một nốt giai điệu, nốt thấp ở dưới như bản in.
 * Nốt đơn: hàng cố định phía trên khuông (như bài cho bé), chỉ nâng lên khi đầu nốt cao hơn hàng đó.
 * Chùm nốt tay phải: xếp chồng phía trên đầu nốt cao nhất / đỉnh đuôi nốt để không đè lên nốt.
 */
export function noteFingerRows(note: LessonNote, staveNote: StaveNote, staffTop: number): { text: string; y: number }[] {
  const fixed = staffTop - FINGER_OFFSET;
  if (!note.harmony?.length) {
    if (!note.finger) return [];
    return [{ text: fingerText(note.finger, note.fingerCircled), y: Math.min(fixed, Math.min(...staveNote.getYs()) - HEAD_CLEAR) }];
  }
  const fingers = [...note.harmony.map((h) => ({ f: h.finger, c: h.fingerCircled })), { f: note.finger, c: note.fingerCircled }];
  if (!fingers.some((x) => x.f)) return [];
  let y = Math.min(fixed, noteTop(staveNote) - STEM_CLEAR);
  const rows: { text: string; y: number }[] = [];
  for (const x of fingers) {
    if (!x.f) continue;
    rows.push({ text: fingerText(x.f, x.c), y });
    y -= FINGER_ROW_STEP;
  }
  return rows;
}

/** Khoảng cách từ dòng kẻ dưới cùng xuống hàng tên nốt. */
export function labelOffset(lesson: Lesson): number {
  const base = lesson.accompaniment?.length ? LABEL_OFFSET_ACCOMPANIMENT : LABEL_OFFSET;
  return base + (lesson.dynamics?.length && lesson.clef !== 'grand' ? DYNAMIC_SPACE : 0);
}

/** Các khuông của bài (trên xuống dưới): bài hai tay → [Sol, Fa]. */
export function lessonClefs(lesson: Pick<Lesson, 'clef'>): Clef[] {
  return lesson.clef === 'grand' ? ['treble', 'bass'] : [lesson.clef];
}

/** Chỉ số khuông chứa nốt. */
export function staffOf(lesson: Lesson, note: LessonNote): number {
  return lesson.clef === 'grand' && noteHand(lesson, note) === 'left' ? 1 : 0;
}

/** Class theo tay của nốt: tập một tay thì làm mờ các phần tử của tay kia. */
function handClass(lesson: Lesson, note: LessonNote): string {
  return noteHand(lesson, note) === 'left' ? 'score-lh' : 'score-rh';
}

const REST_KEY: Record<Clef, string> = { treble: 'b/4', bass: 'd/3' };

function createRest(duration: Duration, clef: Clef): StaveNote {
  const rest = new StaveNote({ keys: [REST_KEY[clef]], duration, type: 'r', clef });
  if (duration.endsWith('d')) Dot.buildAndAttach([rest], { all: true });
  return rest;
}

export interface MeasureNotes {
  /** Các nốt + dấu lặng của từng khuông (thứ tự như `lessonClefs`). */
  staves: StaveNote[][];
  /** StaveNote của từng nốt bài học trong ô nhịp (cùng thứ tự với `items`). */
  played: StaveNote[];
  /** StaveNote của từng nốt/hợp âm phần đệm trong ô nhịp. */
  accompaniment: StaveNote[];
}

function createAccompanimentNotes(lesson: Lesson, items: readonly AccompanimentNote[]): StaveNote[] {
  const accidentals = measureAccidentals(items.flatMap((n) => n.pitches), lesson.keySignature);
  let k = 0;
  return items.map((n) => {
    if (n.pitches.length === 0) return createRest(n.duration, 'bass');
    const note = new StaveNote({ keys: n.pitches.map(toVexKey), duration: n.duration, clef: 'bass', autoStem: true });
    if (n.duration.endsWith('d')) Dot.buildAndAttach([note], { all: true });
    n.pitches.forEach((_, pi) => {
      const accidental = accidentals[k++];
      if (accidental) note.addModifier(new Accidental(accidental), pi);
    });
    note.setLedgerLineStyle(LEDGER_STYLE);
    return note;
  });
}

/**
 * Tạo StaveNote cho một ô nhịp: chấm dôi, dấu hoá theo hoá biểu (bất thường, dấu hoàn).
 * Khuông đôi: khi tay kia đang chơi thì khuông này có dấu lặng cùng trường độ; cả ô không chơi → dấu lặng tròn.
 */
export function createMeasureNotes(
  lesson: Lesson,
  items: readonly LessonNote[],
  fullMeasure = true,
  accompanimentItems?: readonly AccompanimentNote[],
): MeasureNotes {
  const played: StaveNote[] = [];
  let accompaniment: StaveNote[] = [];
  const staves = lessonClefs(lesson).map((clef, si) => {
    if (si === 1 && accompanimentItems) {
      accompaniment = createAccompanimentNotes(lesson, accompanimentItems);
      return accompaniment;
    }
    const own = items.filter((n) => staffOf(lesson, n) === si);
    if (own.length === 0 && fullMeasure) {
      return [new StaveNote({ keys: [REST_KEY[clef]], duration: 'w', type: 'r', clef, alignCenter: true })];
    }
    // Chùm nốt tay phải: các phím thấp → cao (hoà âm rồi giai điệu), dấu hoá xét lần lượt từng phím trong ô.
    const keysOf = (n: LessonNote) => [...(n.harmony ?? []).map((h) => h.pitch), n.pitch];
    const accidentals = measureAccidentals(own.filter((n) => !n.rest).flatMap(keysOf), lesson.keySignature);
    let k = 0;
    return items.map((n, ni) => {
      if (staffOf(lesson, n) !== si) return createRest(n.duration, clef);
      if (n.rest) {
        // Dấu lặng của bài (tiết tấu): cũng có con trỏ và tô trạng thái như một nốt.
        const rest = createRest(n.duration, clef);
        played[ni] = rest;
        return rest;
      }
      const keys = keysOf(n);
      const note = new StaveNote({ keys: keys.map(toVexKey), duration: n.duration, clef, autoStem: true });
      if (n.duration.endsWith('d')) Dot.buildAndAttach([note], { all: true });
      keys.forEach((_, ki) => {
        const accidental = accidentals[k++];
        if (accidental) note.addModifier(new Accidental(accidental), ki);
      });
      note.setLedgerLineStyle(LEDGER_STYLE);
      played[ni] = note;
      return note;
    });
  });
  return { staves, played, accompaniment };
}

/**
 * Tạo các khuông của một ô nhịp tại `x` (mỗi khuông ở một `ys`), bề rộng = phần đầu + `noteArea`.
 * Phần đầu (khoá, hoá biểu, số chỉ nhịp) được canh đều giữa các khuông để nốt thẳng hàng.
 */
export function createMeasureStaves(
  lesson: Lesson,
  x: number,
  ys: readonly number[],
  noteArea: number,
  header: { clef: boolean; time: boolean },
  isLast: boolean,
): { staves: Stave[]; headerWidth: number } {
  const staves = lessonClefs(lesson).map((clef, si) => {
    const stave = new Stave(x, ys[si], 100);
    if (header.clef) {
      stave.addClef(clef);
      if (lesson.keySignature) stave.addKeySignature(lesson.keySignature);
    }
    if (header.time) stave.addTimeSignature(lesson.timeSignature.join('/'));
    if (isLast) stave.setEndBarType(BarlineType.END);
    return stave;
  });
  Stave.formatBegModifiers(staves);
  const headerWidth = staves[0].getNoteStartX() - x;
  staves.forEach((st) => st.setWidth(headerWidth + noteArea));
  // setWidth huỷ kết quả canh → canh lại.
  Stave.formatBegModifiers(staves);
  return { staves, headerWidth };
}

/** Ghép nốt vào các khuông: tạo voice, nối móc tự động và dàn nốt (thẳng hàng giữa các khuông) trong `noteArea`. */
export function formatMeasure(lesson: Lesson, staves: Stave[], notes: StaveNote[][], noteArea: number) {
  const [beats, beatValue] = lesson.timeSignature;
  const formatter = new Formatter();
  const voices = staves.map((stave, si) => {
    stave.setDefaultLedgerLineStyle(LEDGER_STYLE);
    const voice = new Voice({ numBeats: beats, beatValue }).setStrict(false);
    voice.addTickables(notes[si]);
    formatter.joinVoices([voice]);
    return voice;
  });
  // Nhịp kép (6/8, 9/8, 12/8): móc đơn nối theo nhóm ba.
  const compound = beatValue === 8 && beats > 3 && beats % 3 === 0;
  const beams = notes.flatMap((ns) => Beam.generateBeams(ns, compound ? { groups: [new Fraction(3, 8)] } : undefined));
  formatter.format(voices, noteArea - MEASURE_PADDING);
  return { voices, beams };
}

/** Vẽ khuông + nốt + móc của một ô nhịp; khuông đôi có thêm vạch nhịp nối hai khuông và ngoặc nhọn ở ô đầu. */
export function drawMeasure(ctx: RenderContext, staves: Stave[], voices: Voice[], beams: Beam[], pos: { first: boolean; last: boolean }) {
  staves.forEach((stave, si) => {
    stave.setContext(ctx).draw();
    voices[si].draw(ctx, stave);
  });
  beams.forEach((beam) => beam.setContext(ctx).draw());
  if (staves.length < 2) return;
  const connect = (type: Parameters<StaveConnector['setType']>[0]) => new StaveConnector(staves[0], staves[staves.length - 1]).setType(type).setContext(ctx).draw();
  if (pos.first) {
    connect('brace');
    connect('singleLeft');
  }
  connect(pos.last ? 'boldDoubleRight' : 'singleRight');
}

/** Tâm đầu nốt theo trục x. */
export function noteCenterX(note: StaveNote): number {
  return (note.getNoteHeadBeginX() + note.getNoteHeadEndX()) / 2;
}

const SVG_NS = 'http://www.w3.org/2000/svg';

function svgLine(x1: number, y1: number, x2: number, y2: number): SVGLineElement {
  const l = document.createElementNS(SVG_NS, 'line');
  l.setAttribute('x1', String(x1));
  l.setAttribute('y1', String(y1));
  l.setAttribute('x2', String(x2));
  l.setAttribute('y2', String(y2));
  return l;
}

export function renderScore(container: HTMLElement, lesson: Lesson, opts: ScoreRenderOptions): RenderedScore {
  container.innerHTML = '';
  const renderer = new Renderer(container as HTMLDivElement, Renderer.Backends.SVG);
  const ctx = renderer.getContext();
  ctx.setFillStyle('currentColor');
  ctx.setStrokeStyle('currentColor');

  const clefs = lessonClefs(lesson);
  const showPedal = opts.showPedal !== false && !!lesson.pedal?.length;
  const top = STAVE_Y + (lesson.sections?.length ? SECTION_SPACE : 0);
  const ys = clefs.map((_, si) => top + si * GRAND_STAFF_GAP);
  const height =
    SCORE_HEIGHT + (top - STAVE_Y) + (labelOffset(lesson) - LABEL_OFFSET) + (clefs.length - 1) * GRAND_STAFF_GAP + (showPedal ? PEDAL_SPACE : 0);
  const measures = splitMeasures(lesson.notes, measureLength(lesson.timeSignature), lesson.pickup);
  const accMeasures = accompanimentMeasures(lesson);

  type Built = { staves: Stave[]; voices: Voice[]; played: StaveNote[]; beams: Beam[]; accompaniment: StaveNote[] };
  const built: Built[] = [];
  let x = LEFT_PAD + (clefs.length > 1 ? BRACE_PAD : 0);

  measures.forEach((measure, mi) => {
    const first = mi === 0;
    const accItems = accMeasures?.[mi]?.items;
    const noteArea = naturalNoteArea(measure.items, accItems);
    const { staves, headerWidth } = createMeasureStaves(lesson, x, ys, noteArea, { clef: first, time: first && opts.timeSignature !== false }, mi === measures.length - 1);
    const { staves: notes, played, accompaniment } = createMeasureNotes(lesson, measure.items, !(first && lesson.pickup), accItems);
    const { voices, beams } = formatMeasure(lesson, staves, notes, noteArea);
    built.push({ staves, voices, played, beams, accompaniment });
    x += headerWidth + noteArea;
  });

  const width = x + RIGHT_PAD;
  renderer.resize(width, height);
  built.forEach((b, i) => drawMeasure(ctx, b.staves, b.voices, b.beams, { first: i === 0, last: i === built.length - 1 }));

  const svg = container.querySelector('svg')!;
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
  svg.removeAttribute('width');
  svg.removeAttribute('height');
  svg.style.width = '';
  svg.style.height = '';
  svg.classList.add('score-svg');

  const allNotes = built.flatMap((b) => b.played);
  const noteCenters = allNotes.map(noteCenterX);
  const noteElements = allNotes.map((n, i) => {
    const el = n.getSVGElement() ?? null;
    el?.classList.add('score-note', handClass(lesson, lesson.notes[i]));
    el?.setAttribute('data-index', String(i));
    return el;
  });

  // Phần đệm: class riêng để làm mờ khi tập một tay và tô trạng thái khi tập tay trái.
  const accStaveNotes = built.flatMap((b) => b.accompaniment);
  const accompanimentCenters = accStaveNotes.map(noteCenterX);
  const accompanimentElements = accStaveNotes.map((n, i) => {
    const el = n.getSVGElement() ?? null;
    el?.classList.add('score-acc', 'score-lh');
    el?.setAttribute('data-acc-index', String(i));
    return el;
  });

  // Nền tô sáng nốt hiện tại (chèn đầu tiên để nằm dưới các nét vẽ).
  const staffTops = built[0].staves.map((st) => st.getYForLine(0));
  const staveTop = staffTops[0];
  const staveBottom = built[0].staves[built[0].staves.length - 1].getYForLine(4);
  const cursor = document.createElementNS(SVG_NS, 'rect');
  cursor.setAttribute('class', 'score-cursor');
  cursor.setAttribute('y', String(staveTop - 32));
  cursor.setAttribute('width', '34');
  cursor.setAttribute('height', String(staveBottom - staveTop + 64));
  cursor.setAttribute('rx', '8');
  svg.insertBefore(cursor, svg.firstChild);

  // Tên nốt: một hàng chữ cố định dưới khuông, dễ đọc từ xa.
  const labelY = staveBottom + labelOffset(lesson);
  const labelElements = lesson.notes.map((n, i) => {
    if (!opts.showNames || n.rest) return null;
    const t = document.createElementNS(SVG_NS, 'text');
    t.setAttribute('x', String(noteCenters[i]));
    t.setAttribute('y', String(labelY));
    t.setAttribute('text-anchor', 'middle');
    t.setAttribute('class', `score-label ${handClass(lesson, n)}`);
    t.textContent = pitchToLabel(n.pitch, opts.labelStyle);
    svg.appendChild(t);
    return t;
  });

  // Số ngón tay: một hàng cố định phía trên khuông của nốt (bài tập cho bé dùng thế tay cố định nên không đè nốt);
  // chùm nốt tay phải xếp chồng phía trên chùm. `stackTops` = đỉnh phần đã vẽ phía trên từng nốt (để đặt ký hiệu hợp âm).
  let topMost = Infinity;
  const stackTops: number[] = [];
  const fingerElements = lesson.notes.map((n, i) => {
    const staveNote = allNotes[i];
    stackTops[i] = n.rest ? staffTops[staffOf(lesson, n)] : Math.min(staffTops[staffOf(lesson, n)], noteTop(staveNote));
    const rows = opts.showFingers === false || n.rest ? [] : noteFingerRows(n, staveNote, staffTops[staffOf(lesson, n)]);
    if (rows.length === 0) return null;
    const t = document.createElementNS(SVG_NS, 'text');
    t.setAttribute('x', String(noteCenters[i]));
    t.setAttribute('y', String(rows[0].y));
    t.setAttribute('text-anchor', 'middle');
    t.setAttribute('class', `score-finger ${handClass(lesson, n)}`);
    if (rows.length === 1) t.textContent = rows[0].text;
    else
      for (const row of rows) {
        const span = document.createElementNS(SVG_NS, 'tspan');
        span.setAttribute('x', String(noteCenters[i]));
        span.setAttribute('y', String(row.y));
        span.textContent = row.text;
        t.appendChild(span);
      }
    svg.appendChild(t);
    const top = rows[rows.length - 1].y - FINGER_GLYPH;
    stackTops[i] = Math.min(stackTops[i], top);
    topMost = Math.min(topMost, top);
    return t;
  });

  // Ký hiệu hợp âm: phía trên số ngón; mỗi ký hiệu nằm trên mọi nốt tới ký hiệu kế tiếp (không đè số ngón / nốt cao).
  if (opts.showChords !== false && lesson.chordSymbols?.length && lesson.clef !== 'bass') {
    const base = staffTops[0] - (opts.showFingers !== false && fingerElements.some(Boolean) ? FINGER_OFFSET + FINGER_GLYPH : 0) - CHORD_GAP;
    lesson.chordSymbols.forEach((c, k) => {
      if (noteCenters[c.index] === undefined) return;
      const end = lesson.chordSymbols![k + 1]?.index ?? lesson.notes.length;
      const above = Math.min(...stackTops.slice(c.index, Math.max(c.index + 1, end)).filter((y) => y !== undefined));
      const y = Math.min(base, above - CHORD_GAP);
      const t = document.createElementNS(SVG_NS, 'text');
      t.setAttribute('x', String(allNotes[c.index].getNoteHeadBeginX() - 2));
      t.setAttribute('y', String(y));
      t.setAttribute('class', 'score-chord');
      t.setAttribute('data-chord', c.symbol);
      t.textContent = displayChordSymbol(c.symbol);
      svg.appendChild(t);
      topMost = Math.min(topMost, y - CHORD_GLYPH);
    });
  }

  // Chữ đánh dấu đoạn (A, B…) trong khung vuông như bản in.
  built.forEach((b, mi) => {
    const label = sectionAt(lesson, mi);
    if (!label) return;
    const box = sectionBox(b.staves[0]);
    const rect = document.createElementNS(SVG_NS, 'rect');
    rect.setAttribute('x', String(box.x));
    rect.setAttribute('y', String(box.y));
    rect.setAttribute('width', String(box.size));
    rect.setAttribute('height', String(box.size));
    rect.setAttribute('class', 'score-section-box');
    const t = document.createElementNS(SVG_NS, 'text');
    t.setAttribute('x', String(box.x + box.size / 2));
    t.setAttribute('y', String(box.y + box.size / 2));
    t.setAttribute('text-anchor', 'middle');
    t.setAttribute('dominant-baseline', 'central');
    t.setAttribute('class', 'score-section');
    t.textContent = label;
    svg.append(rect, t);
  });

  // Dấu sắc thái (p, mf, f…) một hàng dưới khuông trên cùng, thấp hơn mọi nốt của khuông đó, ngay dưới nốt bắt đầu đoạn.
  const topBottom = built[0].staves[0].getYForLine(4);
  const lowestHead = Math.max(topBottom, ...lesson.notes.map((n, i) => (n.rest || staffOf(lesson, n) !== 0 ? -Infinity : Math.max(...allNotes[i].getYs()))));
  const dynamicY = Math.max(topBottom + DYNAMIC_OFFSET, lowestHead + DYNAMIC_BELOW_NOTE);
  const dynamicMarks = new Set<number>();
  for (const d of lesson.dynamics ?? []) {
    if (noteCenters[d.index] === undefined) continue;
    dynamicMarks.add(d.index);
    const t = document.createElementNS(SVG_NS, 'text');
    t.setAttribute('x', String(noteCenters[d.index]));
    t.setAttribute('y', String(dynamicY));
    t.setAttribute('text-anchor', 'middle');
    t.setAttribute('class', 'score-dynamic');
    t.setAttribute('data-dynamic', d.mark);
    t.textContent = d.mark;
    svg.appendChild(t);
  }

  // To dần (<) / nhỏ dần (>): hình nêm cùng hàng dấu sắc thái, từ nốt `from` tới trước nốt sau `to`
  // (chừa chỗ cho chữ sắc thái đứng ở nốt đó).
  const measureEndX = (mi: number) => {
    const st = built[mi].staves[0];
    return st.getX() + st.getWidth();
  };
  const noteMeasure: number[] = built.flatMap((b, mi) => b.played.map(() => mi));
  for (const h of lesson.hairpins ?? []) {
    if (noteCenters[h.from] === undefined || noteCenters[h.to] === undefined) continue;
    const x0 = noteCenters[h.from] - (dynamicMarks.has(h.from) ? -16 : 6);
    const next = noteCenters[h.to + 1];
    const x1 = next !== undefined ? next - (dynamicMarks.has(h.to + 1) ? 20 : 10) : measureEndX(noteMeasure[h.to]) - 6;
    if (x1 <= x0 + 8) continue;
    const yc = dynamicY - 7;
    const [narrow, wide] = h.type === 'cresc' ? [x0, x1] : [x1, x0];
    const g = document.createElementNS(SVG_NS, 'g');
    g.setAttribute('class', 'score-hairpin');
    g.setAttribute('data-hairpin', h.type);
    g.append(svgLine(narrow, yc, wide, yc - HAIRPIN_OPEN / 2), svgLine(narrow, yc, wide, yc + HAIRPIN_OPEN / 2));
    svg.appendChild(g);
  }

  // Ký hiệu pedal: "Ped." + đường kẻ, gạch đứng ở chỗ nhả; thay pedal (khoảng liền sau) vẽ thành khấc "^" ở chỗ thay —
  // trên vạch nhịp, hoặc ngay trước nốt nếu đổi pedal giữa ô (theo hợp âm).
  const pedalY = labelY + PEDAL_OFFSET;
  const starts = measureStarts(lesson);
  const beatRanges = pedalRanges(lesson);
  const stepX = beatXs(lesson, built, starts);
  /** x của chỗ đạp / nhả ở phách `beat`: đầu ô → đầu phần nốt; cuối ô → vạch nhịp; giữa ô → ngay trước nốt ở phách đó. */
  const pedalX = (beat: number, edge: 'start' | 'end') => {
    const mi = starts.findIndex((s) => Math.abs(s - beat) < 1e-9);
    if (mi >= 0 && edge === 'end' && mi > 0) return measureEndX(mi - 1);
    if (mi >= 0 && mi < built.length) return built[mi].staves[0].getNoteStartX();
    return stepX(beat) - 6;
  };
  const pedals = (lesson.pedal ?? []).map((p, i) => ({ p, r: beatRanges[i] })).filter(({ p }) => showPedal && built[p.from] && built[p.to]);
  pedals.forEach(({ p, r }, i) => {
    const chainedBefore = i > 0 && Math.abs(pedals[i - 1].r.endBeat - r.startBeat) < 1e-9;
    const chainedAfter = i < pedals.length - 1 && Math.abs(r.endBeat - pedals[i + 1].r.startBeat) < 1e-9;
    const x1 = pedalX(r.endBeat, 'end') - (chainedAfter ? 0 : 4);
    const g = document.createElementNS(SVG_NS, 'g');
    g.setAttribute('class', 'score-pedal');
    g.setAttribute('data-pedal', `${p.from}${p.fromBeat ? `+${p.fromBeat}` : ''}-${p.to}${p.toBeat !== undefined ? `+${p.toBeat}` : ''}`);
    let lineStart: number;
    if (chainedBefore) {
      // Nửa sau của khấc: từ đỉnh khấc ở chỗ thay xuống lại đường kẻ.
      const xn = pedalX(r.startBeat, 'end');
      g.appendChild(svgLine(xn, pedalY - PEDAL_TICK, xn + PEDAL_NOTCH, pedalY));
      lineStart = xn + PEDAL_NOTCH;
    } else {
      const x0 = pedalX(r.startBeat, 'start');
      const t = document.createElementNS(SVG_NS, 'text');
      t.setAttribute('x', String(x0));
      t.setAttribute('y', String(pedalY));
      t.setAttribute('class', 'score-pedal-text');
      t.textContent = 'Ped.';
      g.appendChild(t);
      lineStart = x0 + PEDAL_TEXT_WIDTH;
    }
    if (chainedAfter) {
      g.append(svgLine(lineStart, pedalY, x1 - PEDAL_NOTCH, pedalY), svgLine(x1 - PEDAL_NOTCH, pedalY, x1, pedalY - PEDAL_TICK));
    } else {
      g.append(svgLine(lineStart, pedalY, x1, pedalY), svgLine(x1, pedalY, x1, pedalY - PEDAL_TICK));
    }
    svg.appendChild(g);
  });

  // Số ngón tay phần đệm: chồng dưới khuông Fa, không tô sáng vì app không chấm phần đệm.
  if (accMeasures && opts.showFingers !== false) {
    accMeasures.flatMap((m) => m.items).forEach((n, i) => {
      for (const row of accompanimentFingerRows(n, accStaveNotes[i], staveBottom)) {
        const t = document.createElementNS(SVG_NS, 'text');
        t.setAttribute('x', String(noteCenterX(accStaveNotes[i])));
        t.setAttribute('y', String(row.y));
        t.setAttribute('text-anchor', 'middle');
        t.setAttribute('class', 'score-finger score-finger-lh score-lh');
        t.textContent = row.text;
        svg.appendChild(t);
      }
    });
  }

  // Số ngón / ký hiệu hợp âm của chùm nốt cao (vd hợp âm Đô6 ở coda) có thể vượt mép trên: mở rộng vùng nhìn lên trên
  // thay vì dời cả khuông (bài cũ không bị ảnh hưởng).
  const extraTop = Number.isFinite(topMost) ? Math.max(0, Math.ceil(4 - topMost)) : 0;
  if (extraTop > 0) svg.setAttribute('viewBox', `0 ${-extraTop} ${width} ${height + extraTop}`);

  return { width, height: height + extraTop, noteCenters, noteElements, labelElements, fingerElements, accompanimentCenters, accompanimentElements, cursor };
}

/**
 * x của phách bất kỳ (nốt đen, tính từ đầu bài): đầu nốt bắt đầu đúng phách đó (giai điệu hoặc phần đệm),
 * không có nốt nào thì nội suy giữa hai mốc gần nhất (mốc cuối mỗi ô = vạch nhịp).
 */
function beatXs(lesson: Lesson, built: { staves: Stave[]; played: StaveNote[]; accompaniment: StaveNote[] }[], starts: readonly number[]): (beat: number) => number {
  const points: { beat: number; x: number }[] = [];
  const add = (items: readonly { duration: Duration }[], notes: readonly StaveNote[]) => {
    let beat = 0;
    items.forEach((n, i) => {
      if (notes[i]) points.push({ beat, x: notes[i].getNoteHeadBeginX() });
      beat += DURATION_BEATS[n.duration];
    });
  };
  add(lesson.notes, built.flatMap((b) => b.played));
  add(lesson.accompaniment ?? [], built.flatMap((b) => b.accompaniment));
  built.forEach((b, mi) => points.push({ beat: starts[mi + 1], x: b.staves[0].getX() + b.staves[0].getWidth() }));
  points.sort((a, b) => a.beat - b.beat || a.x - b.x);
  return (beat) => {
    const exact = points.find((p) => Math.abs(p.beat - beat) < 1e-9);
    if (exact) return exact.x;
    const after = points.findIndex((p) => p.beat > beat);
    if (after <= 0) return points[Math.max(0, after)]?.x ?? 0;
    const a = points[after - 1];
    const c = points[after];
    return a.x + ((c.x - a.x) * (beat - a.beat)) / (c.beat - a.beat);
  };
}
