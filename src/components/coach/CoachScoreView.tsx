import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { renderScore, scoreFontsReady, type RenderedScore } from '../../core/score/ScoreRenderer';
import type { Lesson } from '../../core/lessons/types';
import type { NoteLabelStyle } from '../../core/music/notes';
import { resultMap } from '../../core/coach/replay';
import type { NoteAlignment, ScoreReference, ScoringIssue, ScoringResult } from '../../core/coach/types';
import './coach.css';

export type CoachSelection = { kind: 'note'; staff: 'melody' | 'accompaniment'; index: number } | { kind: 'measure'; measure: number } | { kind: 'extra'; perfId: number };

type Level = 'ok' | 'warn' | 'err';

const SVG_NS = 'http://www.w3.org/2000/svg';

/** Mức của một nốt trên khuông + ký hiệu (không chỉ dựa vào màu). */
export function noteLevel(a: NoteAlignment): { level: Level; mark: string } {
  if (a.status === 'missing') return { level: 'err', mark: '○' };
  if (a.status === 'wrong') return { level: 'err', mark: '✗' };
  if (a.status === 'octave') return { level: 'err', mark: '8' };
  if (a.status === 'order') return { level: 'err', mark: '⇄' };
  if (a.timing === 'early' || a.timing === 'late') return { level: 'warn', mark: '⏱' };
  if (a.duration === 'short' || a.duration === 'long') return { level: 'warn', mark: '⌛' };
  return { level: 'ok', mark: '✓' };
}

const RANK: Record<Level, number> = { ok: 0, warn: 1, err: 2 };

/** Mức + ký hiệu do một issue gắn với nốt (chỗ ngắt quãng, hai tay lệch… không nằm trong bảng ghép từng nốt). */
export function issueLevel(i: ScoringIssue): { level: Level; mark: string } | null {
  if (i.criterion === 'notes') return { level: 'err', mark: '✗' };
  if (i.type === 'hesitation') return { level: 'warn', mark: '⏸' };
  if (i.type === 'restart') return { level: 'warn', mark: '↺' };
  if (i.criterion === 'rhythm') return { level: 'warn', mark: '⏱' };
  if (i.criterion === 'duration') return { level: 'warn', mark: '⌛' };
  return null;
}

interface Props {
  lesson: Lesson;
  reference: ScoreReference;
  result: ScoringResult | null;
  labelStyle: NoteLabelStyle;
  showNames?: boolean;
  /** Con trỏ (phát lại / đang ghi): nốt trên khuông. */
  cursor?: { staff: 'melody' | 'accompaniment'; index: number } | null;
  selection?: CoachSelection | null;
  onSelect?: (s: CoachSelection) => void;
  height?: number;
}

/**
 * Khuông nhạc kết quả của Coach: vẽ một lần (VexFlow → SVG), tô từng nốt theo kết quả (xanh đúng · vàng lệch thời điểm / trường độ ·
 * đỏ sai / thiếu), ký hiệu ✓ ⏱ ⌛ ✗ ○ phía trên nốt, "+" đỏ ở chỗ có nốt thừa, "P" tím ở lỗi pedal; chú thích khi rê chuột (title),
 * chạm / Enter vào nốt → chi tiết. Cuộn ngang; con trỏ đi theo phát lại.
 */
export function CoachScoreView({ lesson, reference, result, labelStyle, showNames = false, cursor = null, selection = null, onSelect, height = 230 }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const renderedRef = useRef<RenderedScore | null>(null);
  const [ready, setReady] = useState(false);
  const [version, setVersion] = useState(0);
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;

  useEffect(() => {
    let alive = true;
    void scoreFontsReady().then(() => alive && setReady(true));
    return () => {
      alive = false;
    };
  }, []);

  useLayoutEffect(() => {
    if (!ready || !hostRef.current) return;
    try {
      renderedRef.current = renderScore(hostRef.current, lesson, { showNames, labelStyle, showFingers: false, showChords: false, showPedal: true });
    } catch (err) {
      console.error('[VietPiano] Lỗi vẽ khuông nhạc', err);
      renderedRef.current = null;
    }
    setVersion((v) => v + 1);
  }, [ready, lesson, showNames, labelStyle]);

  // Nốt trên khuông → các nốt bản nhạc (chùm nốt / hợp âm chung một hình).
  const byElement = useMemo(() => {
    const m = new Map<string, { refIds: string[]; aligns: NoteAlignment[]; issues: ScoringIssue[] }>();
    for (const n of reference.notes) {
      const k = `${n.staff}:${n.scoreIndex}`;
      const e = m.get(k) ?? { refIds: [], aligns: [], issues: [] };
      e.refIds.push(n.id);
      const a = result?.alignment.find((x) => x.refId === n.id);
      if (a) e.aligns.push(a);
      m.set(k, e);
    }
    if (result) for (const i of result.issues) for (const id of i.refNoteIds) {
      const n = reference.notes.find((x) => x.id === id);
      if (!n) continue;
      const e = m.get(`${n.staff}:${n.scoreIndex}`);
      if (e && !e.issues.includes(i)) e.issues.push(i);
    }
    return m;
  }, [reference, result]);

  // Tô màu + ký hiệu + chú thích + bấm chọn.
  useLayoutEffect(() => {
    const r = renderedRef.current;
    const host = hostRef.current;
    if (!r || !host) return;
    const svg = host.querySelector('svg');
    if (!svg) return;
    svg.querySelector('.coach-marks')?.remove();
    const marks = document.createElementNS(SVG_NS, 'g');
    marks.setAttribute('class', 'coach-marks');
    svg.appendChild(marks);
    const cursorY = Number(r.cursor.getAttribute('y'));
    const cursorH = Number(r.cursor.getAttribute('height'));
    const topY = cursorY + 8;
    const bottomY = cursorY + cursorH + 4;
    const cleanups: (() => void)[] = [];
    const text = (x: number, y: number, s: string, cls: string, title?: string) => {
      const t = document.createElementNS(SVG_NS, 'text');
      t.setAttribute('x', String(x));
      t.setAttribute('y', String(y));
      t.setAttribute('class', `coach-mark ${cls}`);
      t.textContent = s;
      if (title) {
        const tt = document.createElementNS(SVG_NS, 'title');
        tt.textContent = title;
        t.appendChild(tt);
      }
      marks.appendChild(t);
      return t;
    };
    const decorate = (els: readonly (SVGElement | null)[], centers: readonly number[], staff: 'melody' | 'accompaniment') => {
      els.forEach((el, i) => {
        if (!el) return;
        el.classList.remove('coach-ok', 'coach-warn', 'coach-err', 'coach-ungraded');
        el.querySelector(':scope > title.coach-title')?.remove();
        const info = byElement.get(`${staff}:${i}`);
        if (!info) {
          el.classList.add('coach-ungraded');
          return;
        }
        const select = () => onSelectRef.current?.({ kind: 'note', staff, index: i });
        el.setAttribute('tabindex', '0');
        el.setAttribute('role', 'button');
        const onKey = (e: Event) => {
          const k = (e as KeyboardEvent).key;
          if (k === 'Enter' || k === ' ') {
            e.preventDefault();
            select();
          }
        };
        el.addEventListener('click', select);
        el.addEventListener('keydown', onKey);
        cleanups.push(() => {
          el.removeEventListener('click', select);
          el.removeEventListener('keydown', onKey);
        });
        if (!result || !info.aligns.length) {
          el.setAttribute('aria-label', 'Nốt');
          return;
        }
        const levels = [...info.aligns.map(noteLevel), ...info.issues.map(issueLevel).filter((x): x is { level: Level; mark: string } => x !== null)];
        const worst = levels.reduce((a, b) => (RANK[b.level] > RANK[a.level] ? b : a));
        el.classList.add(`coach-${worst.level}`);
        const desc = info.issues.length ? info.issues.map((x) => x.message).join('\n') : 'Đúng nốt, đúng nhịp.';
        el.setAttribute('aria-label', desc);
        const tt = document.createElementNS(SVG_NS, 'title');
        tt.setAttribute('class', 'coach-title');
        tt.textContent = desc;
        el.insertBefore(tt, el.firstChild);
        text(centers[i], staff === 'melody' ? topY : bottomY, worst.mark, `is-${worst.level}`);
      });
    };
    decorate(r.noteElements, r.noteCenters, 'melody');
    decorate(r.accompanimentElements, r.accompanimentCenters, 'accompaniment');

    if (result) {
      const map = resultMap(result);
      // x của nốt giai điệu (hoặc đệm) gần phách nhất.
      const xAtBeat = (beat: number) => {
        let best = 0;
        let d = Infinity;
        for (const n of reference.notes) {
          const centers = n.staff === 'melody' ? r.noteCenters : r.accompanimentCenters;
          const x = centers[n.scoreIndex];
          if (x === undefined) continue;
          const dd = Math.abs(n.onsetBeat - beat);
          if (dd < d) {
            d = dd;
            best = x;
          }
        }
        return best;
      };
      for (const a of result.alignment) {
        // Nốt chơi lại đoạn đã chấm không phải nốt thừa (chỗ dừng đã có ký hiệu ↺ trên nốt).
        if (a.refId !== null || a.status === 'replayed' || a.actualMs === undefined || a.perfId === null) continue;
        const pid = a.perfId;
        const issue = result.issues.find((i) => i.perfNoteIds.includes(pid) && i.criterion === 'notes');
        const t = text(xAtBeat(map.beatAt(a.actualMs)) + 16, topY - 18, '+', 'is-extra', issue?.message ?? 'Nốt thừa');
        const sel = () => onSelectRef.current?.({ kind: 'extra', perfId: pid });
        t.addEventListener('click', sel);
        cleanups.push(() => t.removeEventListener('click', sel));
      }
      for (const i of result.issues) {
        if (i.criterion !== 'pedal' || i.measure === null) continue;
        const mi = reference.printedMeasures.indexOf(i.measure);
        const beat = (reference.measureStarts[Math.max(0, mi)] ?? 0) + (i.beat ?? 0);
        text(xAtBeat(beat), bottomY + 22, 'P', 'is-pedal', i.message);
      }
    }
    return () => cleanups.forEach((c) => c());
  }, [byElement, result, reference, version]);

  // Con trỏ + chọn.
  useLayoutEffect(() => {
    const r = renderedRef.current;
    if (!r) return;
    const target = cursor ?? (selection?.kind === 'note' ? selection : null);
    const centers = target?.staff === 'accompaniment' ? r.accompanimentCenters : r.noteCenters;
    const x = target ? centers[target.index] : undefined;
    r.cursor.style.display = x === undefined ? 'none' : '';
    if (x !== undefined) r.cursor.setAttribute('x', String(x - 17));
    const scroller = scrollRef.current;
    if (scroller && x !== undefined) {
      const scale = height / r.height;
      const px = x * scale;
      if (px < scroller.scrollLeft + 40 || px > scroller.scrollLeft + scroller.clientWidth - 80) scroller.scrollTo({ left: Math.max(0, px - scroller.clientWidth * 0.3), behavior: cursor ? 'auto' : 'smooth' });
    }
  }, [cursor, selection, version, height]);

  // Chọn ô nhịp → cuộn tới nốt đầu ô.
  useEffect(() => {
    const r = renderedRef.current;
    const scroller = scrollRef.current;
    if (!r || !scroller || selection?.kind !== 'measure') return;
    const first = reference.notes.find((n) => n.measure === selection.measure);
    if (!first) return;
    const x = (first.staff === 'melody' ? r.noteCenters : r.accompanimentCenters)[first.scoreIndex] ?? 0;
    scroller.scrollTo({ left: Math.max(0, (x * height) / r.height - 60), behavior: 'smooth' });
  }, [selection, reference, height]);

  const r = renderedRef.current;
  const width = r ? (r.width * height) / r.height : 0;
  return (
    <div ref={scrollRef} className="coach-score relative w-full overflow-x-auto overflow-y-hidden rounded-xl bg-white/60 dark:bg-slate-900/40" style={{ height: height + 12 }} data-testid="coach-score" data-version={version}>
      {!ready && <div className="absolute inset-0 grid place-items-center text-slate-400">Đang tải khuông nhạc…</div>}
      <div ref={hostRef} style={{ width, height }} className="[&>svg]:h-full [&>svg]:w-full" aria-label={`Khuông nhạc kết quả bài ${lesson.title}`} />
    </div>
  );
}
