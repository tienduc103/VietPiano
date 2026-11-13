import { useEffect, useState } from 'react';
import { BarlineType, Formatter, Renderer, Stave, StaveNote, Voice } from 'vexflow/bravura';
import type { QuizOption } from '../../core/noteQuiz/questions';
import type { QuizClef } from '../../core/noteQuiz/staff';
import { midiToName } from '../../core/music/notes';
import { scoreFontsReady } from '../../core/score/ScoreRenderer';

export interface QuizTile {
  svg: string;
  /** Vị trí VexFlow thật sự vẽ (`keyProps.line`: dòng 1 = 1, khe 1 = 1.5…) — e2e so với `staffStep`. */
  line: number;
}

const STAVE_W = 170;
const STAVE_Y = 40;
/** Dải dọc tối thiểu quanh 5 dòng kẻ — mọi ô của một câu dùng chung dải → nốt cùng cỡ ở mọi ô. */
const BAND = 26;

/** "C4" → "c/4" (trò chỉ dùng phím trắng). */
function vexKey(midi: number): string {
  const m = /^([A-G])(-?\d)$/.exec(midiToName(midi))!;
  return `${m[1].toLowerCase()}/${m[2]}`;
}

/**
 * Vẽ hình đáp án của một câu (SVG): khuông ngắn + KHOÁ + một nốt, KHÔNG có chữ nào. Mọi ô cùng khung nhìn dọc
 * (nốt có dòng kẻ phụ thì cả câu nới ra) để bé so được vị trí nốt giữa các ô. `options` phải ổn định (theo câu).
 */
export function useQuizTiles(clef: QuizClef | null, options: readonly QuizOption[] | null): QuizTile[] | null {
  const [tiles, setTiles] = useState<QuizTile[] | null>(null);
  useEffect(() => {
    let alive = true;
    setTiles(null);
    if (!clef || !options || options.length === 0) return;
    void scoreFontsReady().then(() => {
      if (!alive) return;
      const host = document.createElement('div');
      host.style.cssText = 'position:absolute;left:-10000px;top:0;visibility:hidden';
      document.body.appendChild(host);
      const drawn: { svg: SVGSVGElement; line: number; y0: number; y1: number; x1: number }[] = [];
      try {
        for (const o of options) {
          host.innerHTML = '';
          const renderer = new Renderer(host as HTMLDivElement, Renderer.Backends.SVG);
          renderer.resize(STAVE_W, 260);
          const ctx = renderer.getContext();
          ctx.setFillStyle('currentColor');
          ctx.setStrokeStyle('currentColor');
          const stave = new Stave(4, STAVE_Y, STAVE_W - 8);
          stave.addClef(clef);
          stave.setBegBarType(BarlineType.NONE).setEndBarType(BarlineType.NONE);
          stave.setContext(ctx).draw();
          const note = new StaveNote({ keys: [vexKey(o.midi)], duration: o.duration, clef, autoStem: true });
          const voice = new Voice({ numBeats: 4, beatValue: 4 }).setStrict(false).addTickables([note]);
          new Formatter().joinVoices([voice]).format([voice], 40);
          voice.draw(ctx, stave);
          const svg = host.querySelector('svg');
          if (!svg) continue;
          const ys = [...note.getYs()];
          if (note.hasStem()) {
            const e = note.getStemExtents();
            ys.push(e.topY, e.baseY);
          }
          // Khoá Sol cao hơn khuông → tính cả khoá vào dải.
          drawn.push({
            svg: svg.cloneNode(true) as SVGSVGElement,
            line: note.getKeyProps()[0].line,
            y0: Math.min(stave.getYForLine(0) - BAND, Math.min(...ys) - 12),
            y1: Math.max(stave.getYForLine(4) + BAND, Math.max(...ys) + 12),
            x1: note.getAbsoluteX() + note.getGlyphWidth() + 26,
          });
        }
      } catch (err) {
        console.error('[VietPiano] Lỗi vẽ hình đáp án Đố bé nốt gì', err);
      } finally {
        host.remove();
      }
      const y0 = Math.min(...drawn.map((d) => d.y0));
      const y1 = Math.max(...drawn.map((d) => d.y1));
      const x1 = Math.max(...drawn.map((d) => d.x1), 110);
      const out = drawn.map((d) => {
        const svg = d.svg;
        svg.setAttribute('viewBox', `0 ${y0} ${x1} ${y1 - y0}`);
        svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
        svg.removeAttribute('width');
        svg.removeAttribute('height');
        svg.removeAttribute('style');
        svg.setAttribute('aria-hidden', 'true');
        // Đuôi nốt / dòng kẻ phụ VexFlow tô cứng "black" → theo màu chữ của ô (dark mode).
        for (const el of [svg, ...svg.querySelectorAll('[stroke="black"], [stroke="#444"], [fill="black"]')]) {
          const stroke = el.getAttribute('stroke');
          if (stroke === 'black' || stroke === '#444') el.setAttribute('stroke', 'currentColor');
          if (el.getAttribute('fill') === 'black') el.setAttribute('fill', 'currentColor');
        }
        // Khoá / đầu nốt / móc là glyph Bravura (ký tự vùng riêng của font, không phải chữ đọc được) — giữ nguyên.
        return { svg: svg.outerHTML, line: d.line };
      });
      if (alive) setTiles(out.length === options.length ? out : null);
    });
    return () => {
      alive = false;
    };
  }, [clef, options]);
  return tiles;
}
