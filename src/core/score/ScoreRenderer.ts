/**
 * ScoreRenderer — vẽ bài học thành MỘT dòng khuông nhạc dài bằng VexFlow (SVG).
 * Bài hai tay vẽ trên khuông đôi: nốt tay phải ở khoá Sol, tay trái ở khoá Fa, khuông còn lại hiện dấu lặng.
 *
 * Vẽ một lần cho mỗi bài; việc tô sáng nốt hiện tại/đúng/sai được làm bằng CSS class
 * trên từng nhóm SVG của nốt (mọi nét vẽ dùng `currentColor`), nên chuyển nốt rất nhẹ.
 * Vị trí x của từng nốt được trả về để UI tự cuộn.
 */
import {
  Accidental,
  BarlineType,
  Beam,
  Dot,
  Formatter,
  Renderer,
  Stave,
  StaveConnector,
  StaveNote,
  Voice,
  type RenderContext,
} from 'vexflow/bravura';
import { splitMeasures } from '../lessons/notation';
import { measureLength, noteHand, type Clef, type Duration, type Lesson, type LessonNote } from '../lessons/types';
import { measureAccidentals } from '../music/keySignature';
import { midiToLabel, type NoteLabelStyle } from '../music/notes';

export interface ScoreRenderOptions {
  showNames: boolean;
  labelStyle: NoteLabelStyle;
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

/** Bề rộng tự nhiên của phần nốt trong một ô nhịp (đã gồm khoảng đệm). */
export function naturalNoteArea(items: readonly LessonNote[]): number {
  return items.reduce((sum, n) => sum + NOTE_SPACE[n.duration], 0) + MEASURE_PADDING;
}

/** Các khuông của bài (trên xuống dưới): bài hai tay → [Sol, Fa]. */
export function lessonClefs(lesson: Pick<Lesson, 'clef'>): Clef[] {
  return lesson.clef === 'grand' ? ['treble', 'bass'] : [lesson.clef];
}

/** Chỉ số khuông chứa nốt. */
export function staffOf(lesson: Lesson, note: LessonNote): number {
  return lesson.clef === 'grand' && noteHand(lesson, note) === 'left' ? 1 : 0;
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
}

/**
 * Tạo StaveNote cho một ô nhịp: chấm dôi, dấu hoá theo hoá biểu (bất thường, dấu hoàn).
 * Khuông đôi: khi tay kia đang chơi thì khuông này có dấu lặng cùng trường độ; cả ô không chơi → dấu lặng tròn.
 */
export function createMeasureNotes(lesson: Lesson, items: readonly LessonNote[], fullMeasure = true): MeasureNotes {
  const played: StaveNote[] = [];
  const staves = lessonClefs(lesson).map((clef, si) => {
    const own = items.filter((n) => staffOf(lesson, n) === si);
    if (own.length === 0 && fullMeasure) {
      return [new StaveNote({ keys: [REST_KEY[clef]], duration: 'w', type: 'r', clef, alignCenter: true })];
    }
    const accidentals = measureAccidentals(own.map((n) => n.pitch), lesson.keySignature);
    let k = 0;
    return items.map((n, ni) => {
      if (staffOf(lesson, n) !== si) return createRest(n.duration, clef);
      const note = new StaveNote({ keys: [toVexKey(n.pitch)], duration: n.duration, clef, autoStem: true });
      if (n.duration.endsWith('d')) Dot.buildAndAttach([note], { all: true });
      const accidental = accidentals[k++];
      if (accidental) note.addModifier(new Accidental(accidental), 0);
      note.setLedgerLineStyle(LEDGER_STYLE);
      played[ni] = note;
      return note;
    });
  });
  return { staves, played };
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
  const beams = notes.flatMap((ns) => Beam.generateBeams(ns));
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

export function renderScore(container: HTMLElement, lesson: Lesson, opts: ScoreRenderOptions): RenderedScore {
  container.innerHTML = '';
  const renderer = new Renderer(container as HTMLDivElement, Renderer.Backends.SVG);
  const ctx = renderer.getContext();
  ctx.setFillStyle('currentColor');
  ctx.setStrokeStyle('currentColor');

  const clefs = lessonClefs(lesson);
  const ys = clefs.map((_, si) => STAVE_Y + si * GRAND_STAFF_GAP);
  const height = SCORE_HEIGHT + (clefs.length - 1) * GRAND_STAFF_GAP;
  const measures = splitMeasures(lesson.notes, measureLength(lesson.timeSignature), lesson.pickup);

  type Built = { staves: Stave[]; voices: Voice[]; played: StaveNote[]; beams: Beam[] };
  const built: Built[] = [];
  let x = LEFT_PAD + (clefs.length > 1 ? BRACE_PAD : 0);

  measures.forEach((measure, mi) => {
    const first = mi === 0;
    const noteArea = naturalNoteArea(measure.items);
    const { staves, headerWidth } = createMeasureStaves(lesson, x, ys, noteArea, { clef: first, time: first }, mi === measures.length - 1);
    const { staves: notes, played } = createMeasureNotes(lesson, measure.items, !(first && lesson.pickup));
    const { voices, beams } = formatMeasure(lesson, staves, notes, noteArea);
    built.push({ staves, voices, played, beams });
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
    el?.classList.add('score-note');
    el?.setAttribute('data-index', String(i));
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
  const labelY = staveBottom + 58;
  const labelElements = lesson.notes.map((n, i) => {
    if (!opts.showNames) return null;
    const t = document.createElementNS(SVG_NS, 'text');
    t.setAttribute('x', String(noteCenters[i]));
    t.setAttribute('y', String(labelY));
    t.setAttribute('text-anchor', 'middle');
    t.setAttribute('class', 'score-label');
    t.textContent = midiToLabel(n.midi, opts.labelStyle);
    svg.appendChild(t);
    return t;
  });

  // Số ngón tay: một hàng cố định phía trên khuông của nốt (bài tập cho bé dùng thế tay cố định nên không đè nốt).
  const fingerElements = lesson.notes.map((n, i) => {
    if (!n.finger) return null;
    const t = document.createElementNS(SVG_NS, 'text');
    t.setAttribute('x', String(noteCenters[i]));
    t.setAttribute('y', String(staffTops[staffOf(lesson, n)] - FINGER_OFFSET));
    t.setAttribute('text-anchor', 'middle');
    t.setAttribute('class', 'score-finger');
    t.textContent = String(n.finger);
    svg.appendChild(t);
    return t;
  });

  return { width, height, noteCenters, noteElements, labelElements, fingerElements, cursor };
}
