/**
 * ScoreRenderer — vẽ bài học thành MỘT dòng khuông nhạc dài bằng VexFlow (SVG).
 *
 * Vẽ một lần cho mỗi bài; việc tô sáng nốt hiện tại/đúng/sai được làm bằng CSS class
 * trên từng nhóm SVG của nốt (mọi nét vẽ dùng `currentColor`), nên chuyển nốt rất nhẹ.
 * Vị trí x của từng nốt được trả về để UI tự cuộn.
 */
import { Beam, Dot, Formatter, Renderer, Stave, StaveNote, Voice, BarlineType, Accidental } from 'vexflow/bravura';
import { splitMeasures } from '../lessons/notation';
import { measureLength, type Duration, type Lesson } from '../lessons/types';
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
  /** Hình chữ nhật tô nền nốt hiện tại. */
  cursor: SVGRectElement;
}

const STAVE_Y = 30;
const LEFT_PAD = 16;
const RIGHT_PAD = 40;
export const SCORE_HEIGHT = 190;

const NOTE_SPACE: Record<Duration, number> = { '16': 32, '8': 40, '8d': 46, q: 54, qd: 62, h: 72, hd: 84, w: 100 };

/** "C#4" → "c#/4" (định dạng khoá của VexFlow). */
function toVexKey(pitch: string): string {
  const m = /^([A-G])([#b]?)(-?\d)$/.exec(pitch)!;
  return `${m[1].toLowerCase()}${m[2]}/${m[3]}`;
}

const SVG_NS = 'http://www.w3.org/2000/svg';

export function renderScore(container: HTMLElement, lesson: Lesson, opts: ScoreRenderOptions): RenderedScore {
  container.innerHTML = '';
  const renderer = new Renderer(container as HTMLDivElement, Renderer.Backends.SVG);
  const ctx = renderer.getContext();
  ctx.setFillStyle('currentColor');
  ctx.setStrokeStyle('currentColor');

  const [beats, beatValue] = lesson.timeSignature;
  const measures = splitMeasures(lesson.notes, measureLength(lesson.timeSignature), lesson.pickup);
  const ledgerStyle = { strokeStyle: 'currentColor', lineWidth: 2 };

  type Built = { stave: Stave; voice: Voice; notes: StaveNote[]; beams: Beam[] };
  const built: Built[] = [];
  let x = LEFT_PAD;

  measures.forEach((measure, mi) => {
    const stave = new Stave(x, STAVE_Y, 100);
    if (mi === 0) {
      stave.addClef(lesson.clef);
      if (lesson.keySignature) stave.addKeySignature(lesson.keySignature);
      stave.addTimeSignature(`${beats}/${beatValue}`);
    }
    if (mi === measures.length - 1) stave.setEndBarType(BarlineType.END);
    stave.setDefaultLedgerLineStyle(ledgerStyle);

    const accidentals = measureAccidentals(measure.items.map((n) => n.pitch), lesson.keySignature);
    const notes = measure.items.map((n, ni) => {
      const note = new StaveNote({ keys: [toVexKey(n.pitch)], duration: n.duration, clef: lesson.clef, autoStem: true });
      if (n.duration.endsWith('d')) Dot.buildAndAttach([note], { all: true });
      const accidental = accidentals[ni];
      if (accidental) note.addModifier(new Accidental(accidental), 0);
      note.setLedgerLineStyle(ledgerStyle);
      return note;
    });

    const noteArea = measure.items.reduce((sum, n) => sum + NOTE_SPACE[n.duration], 0) + 24;
    const headerWidth = stave.getNoteStartX() - x;
    stave.setWidth(headerWidth + noteArea);

    const voice = new Voice({ numBeats: beats, beatValue }).setStrict(false);
    voice.addTickables(notes);
    const beams = Beam.generateBeams(notes);
    new Formatter().joinVoices([voice]).format([voice], noteArea - 24);
    built.push({ stave, voice, notes, beams });
    x += headerWidth + noteArea;
  });

  const width = x + RIGHT_PAD;
  renderer.resize(width, SCORE_HEIGHT);

  for (const b of built) {
    b.stave.setContext(ctx).draw();
    b.voice.draw(ctx, b.stave);
    b.beams.forEach((beam) => beam.setContext(ctx).draw());
  }

  const svg = container.querySelector('svg')!;
  svg.setAttribute('viewBox', `0 0 ${width} ${SCORE_HEIGHT}`);
  svg.removeAttribute('width');
  svg.removeAttribute('height');
  svg.style.width = '';
  svg.style.height = '';
  svg.classList.add('score-svg');

  const allNotes = built.flatMap((b) => b.notes);
  const noteCenters = allNotes.map((n) => (n.getNoteHeadBeginX() + n.getNoteHeadEndX()) / 2);
  const noteElements = allNotes.map((n, i) => {
    const el = n.getSVGElement() ?? null;
    el?.classList.add('score-note');
    el?.setAttribute('data-index', String(i));
    return el;
  });

  // Nền tô sáng nốt hiện tại (chèn đầu tiên để nằm dưới các nét vẽ).
  const staveTop = built[0].stave.getYForLine(0);
  const staveBottom = built[0].stave.getYForLine(4);
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

  return { width, height: SCORE_HEIGHT, noteCenters, noteElements, labelElements, cursor };
}
