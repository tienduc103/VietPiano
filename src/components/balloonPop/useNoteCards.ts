import { useEffect, useState } from 'react';
import { BarlineType, Formatter, Renderer, Stave, StaveNote, Voice } from 'vexflow/bravura';
import type { Duration } from '../../core/lessons/types';
import type { BalloonClef } from '../../core/balloonPop/storage';
import { midiToName } from '../../core/music/notes';
import { scoreFontsReady } from '../../core/score/ScoreRenderer';

/** Bề rộng khung nhìn của thẻ (toạ độ VexFlow, khoảng cách dòng kẻ = 10). */
export const NOTE_CARD_W = 54;
const BAND_ABOVE = 22;
const BAND_BELOW = 22;
const STAVE_W = 160;
const NOTE_X = 70;

/** "C4" → "c/4" (bóng chỉ mang phím trắng). */
function vexKey(midi: number): string {
  const m = /^([A-G])(-?\d)$/.exec(midiToName(midi))!;
  return `${m[1].toLowerCase()}/${m[2]}`;
}

/**
 * Vẽ sẵn thẻ nốt cho bóng bay (SVG): chỉ một khuông ngắn + hình nốt — KHÔNG vẽ khoá, số chỉ nhịp, vạch nhịp.
 * Khoá (`clef`) chỉ quyết định vị trí nốt trên khuông. Mọi thẻ cùng dải dọc (nốt xa có dòng kẻ phụ thì dải nới ra)
 * → nốt cùng cỡ trên mọi quả bóng. `cards` phải ổn định (useMemo).
 */
export function useNoteCards(cards: readonly { key: string; midi: number; duration: Duration }[], clef: BalloonClef): Map<string, string> | null {
  const [svgs, setSvgs] = useState<Map<string, string> | null>(null);
  useEffect(() => {
    let alive = true;
    if (cards.length === 0) {
      setSvgs(null);
      return;
    }
    void scoreFontsReady().then(() => {
      if (!alive) return;
      const host = document.createElement('div');
      host.style.cssText = 'position:absolute;left:-10000px;top:0;visibility:hidden';
      document.body.appendChild(host);
      const out = new Map<string, string>();
      try {
        for (const c of cards) {
          host.innerHTML = '';
          const renderer = new Renderer(host as HTMLDivElement, Renderer.Backends.SVG);
          renderer.resize(STAVE_W, 200);
          const ctx = renderer.getContext();
          ctx.setFillStyle('currentColor');
          ctx.setStrokeStyle('currentColor');
          const stave = new Stave(0, 40, STAVE_W);
          stave.setBegBarType(BarlineType.NONE).setEndBarType(BarlineType.NONE);
          stave.setNoteStartX(NOTE_X - 10);
          stave.setContext(ctx).draw();
          const note = new StaveNote({ keys: [vexKey(c.midi)], duration: c.duration, clef, autoStem: true });
          const voice = new Voice({ numBeats: 4, beatValue: 4 }).setStrict(false).addTickables([note]);
          new Formatter().joinVoices([voice]).format([voice], 20);
          voice.draw(ctx, stave);
          const svg = host.querySelector('svg');
          if (!svg) continue;
          // Dải dọc cố định quanh 5 dòng kẻ; nới ra nếu nốt (dòng kẻ phụ, đuôi nốt) vượt khỏi dải.
          const top = stave.getYForLine(0) - BAND_ABOVE;
          const bottom = stave.getYForLine(4) + BAND_BELOW;
          // (getBBox của nhóm nốt lớn bất thường → tính từ đầu nốt + đuôi nốt.)
          const ys = [...note.getYs()];
          if (note.hasStem()) {
            const e = note.getStemExtents();
            ys.push(e.topY, e.baseY);
          }
          const y0 = Math.min(top, Math.min(...ys) - 8);
          const y1 = Math.max(bottom, Math.max(...ys) + 8);
          const cx = note.getAbsoluteX() + note.getGlyphWidth() / 2;
          svg.setAttribute('viewBox', `${cx - NOTE_CARD_W / 2} ${y0} ${NOTE_CARD_W} ${y1 - y0}`);
          svg.removeAttribute('width');
          svg.removeAttribute('height');
          svg.removeAttribute('style');
          out.set(c.key, svg.outerHTML);
        }
      } catch (err) {
        console.error('[VietPiano] Lỗi vẽ thẻ nốt bóng bay', err);
      } finally {
        host.remove();
      }
      setSvgs(out);
    });
    return () => {
      alive = false;
    };
  }, [cards, clef]);
  return svgs;
}
