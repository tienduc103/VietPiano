/**
 * Minh hoạ gợi ý của cô giáo (khu gợi ý, KHÔNG phải ô đáp án):
 * - `HintStaff`: khuông minh hoạ riêng của khoá đang hỏi, tô dòng / khe chứa nốt cần tìm (kể cả dòng kẻ phụ) — không vẽ nốt.
 * - `NoteSample`: hình mẫu của trường độ cần tìm (vẽ ở một cao độ cố định, không khoá → không lộ ô đáp án).
 */
import { useEffect, useState } from 'react';
import { BarlineType, Formatter, Renderer, Stave, StaveNote, Voice } from 'vexflow/bravura';
import { CLEF_LABEL, DURATION_NAME, type QuizClef, type QuizDuration } from '../../core/noteQuiz/staff';
import { scoreFontsReady } from '../../core/score/ScoreRenderer';

const GAP = 10;
/** y của bậc `s` (dòng 1 = bậc 0). */
const yOf = (s: number) => 100 - s * (GAP / 2);

export function HintStaff({ clef, step }: { clef: QuizClef; step: number }) {
  const top = Math.min(yOf(8), yOf(step)) - 12;
  const bottom = Math.max(yOf(0), yOf(step)) + 12;
  const ledgers: number[] = [];
  for (let s = -2; s >= step; s -= 2) ledgers.push(s);
  for (let s = 10; s <= step; s += 2) ledgers.push(s);
  const onLine = step % 2 === 0;
  return (
    <figure className="grid justify-items-center gap-0.5" data-testid="nq-hint-staff" data-clef={clef} data-step={step}>
      <svg viewBox={`0 ${top} 150 ${bottom - top}`} className="h-14 w-auto text-slate-700 sm:h-24 dark:text-slate-200" aria-hidden>
        {!onLine && <rect x={30} y={yOf(step) - GAP / 2} width={110} height={GAP} rx={2} className="fill-amber-300/80" />}
        {[0, 2, 4, 6, 8].map((s) => (
          <line key={s} x1={20} x2={145} y1={yOf(s)} y2={yOf(s)} stroke="currentColor" strokeWidth={1.2} />
        ))}
        {ledgers.map((s) => (
          <line key={`l${s}`} x1={70} x2={100} y1={yOf(s)} y2={yOf(s)} stroke="currentColor" strokeWidth={1.2} />
        ))}
        {onLine && <line x1={step < 0 || step > 8 ? 62 : 30} x2={step < 0 || step > 8 ? 108 : 140} y1={yOf(step)} y2={yOf(step)} className="stroke-amber-500" strokeWidth={4} strokeLinecap="round" />}
        <circle cx={85} cy={yOf(step)} r={3.5} className="animate-pulse fill-amber-500" />
      </svg>
      <figcaption className="text-xs font-semibold text-slate-600 dark:text-slate-300">{CLEF_LABEL[clef]}</figcaption>
    </figure>
  );
}

export function NoteSample({ duration }: { duration: QuizDuration }) {
  const [svg, setSvg] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    void scoreFontsReady().then(() => {
      if (!alive) return;
      const host = document.createElement('div');
      host.style.cssText = 'position:absolute;left:-10000px;top:0;visibility:hidden';
      document.body.appendChild(host);
      try {
        const renderer = new Renderer(host as HTMLDivElement, Renderer.Backends.SVG);
        renderer.resize(80, 160);
        const ctx = renderer.getContext();
        ctx.setFillStyle('currentColor');
        ctx.setStrokeStyle('currentColor');
        // Không vẽ dòng kẻ: chỉ hình nốt.
        const stave = new Stave(0, 30, 80, { numLines: 0 });
        stave.setBegBarType(BarlineType.NONE).setEndBarType(BarlineType.NONE);
        stave.setContext(ctx).draw();
        const note = new StaveNote({ keys: ['a/4'], duration, stemDirection: 1 });
        const voice = new Voice({ numBeats: 4, beatValue: 4 }).setStrict(false).addTickables([note]);
        new Formatter().joinVoices([voice]).format([voice], 20);
        voice.draw(ctx, stave);
        const el = host.querySelector('svg');
        if (el) {
          const ys = [...note.getYs()];
          if (note.hasStem()) ys.push(note.getStemExtents().topY);
          const y0 = Math.min(...ys) - 10;
          const y1 = Math.max(...ys) + 10;
          const x0 = note.getAbsoluteX() - 8;
          el.setAttribute('viewBox', `${x0} ${y0} 40 ${y1 - y0}`);
          el.removeAttribute('width');
          el.removeAttribute('height');
          el.removeAttribute('style');
          el.setAttribute('aria-hidden', 'true');
          for (const n of [el, ...el.querySelectorAll('[stroke="black"], [fill="black"]')]) {
            if (n.getAttribute('stroke') === 'black') n.setAttribute('stroke', 'currentColor');
            if (n.getAttribute('fill') === 'black') n.setAttribute('fill', 'currentColor');
          }
          if (alive) setSvg(el.outerHTML);
        }
      } catch (err) {
        console.error('[VietPiano] Lỗi vẽ hình mẫu trường độ', err);
      } finally {
        host.remove();
      }
    });
    return () => {
      alive = false;
    };
  }, [duration]);
  return (
    <figure className="grid justify-items-center gap-0.5" data-testid="nq-hint-sample" data-duration={duration}>
      <span className="block h-14 w-10 text-slate-800 sm:h-24 dark:text-slate-100 [&>svg]:h-full [&>svg]:w-full" dangerouslySetInnerHTML={{ __html: svg ?? '' }} />
      <figcaption className="text-xs font-semibold text-slate-600 dark:text-slate-300">Mẫu nốt {DURATION_NAME[duration]}</figcaption>
    </figure>
  );
}
