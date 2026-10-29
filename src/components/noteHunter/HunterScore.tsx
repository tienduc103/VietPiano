import { useEffect, useImperativeHandle, useLayoutEffect, useRef, useState, type Ref } from 'react';
import type { NoteLabelStyle } from '../../core/music/notes';
import { cursorX, noteIndexAt } from '../../core/noteHunter/cursor';
import type { TargetResult } from '../../core/noteHunter/NoteHunterGame';
import type { HunterSong } from '../../core/noteHunter/songs';
import { renderScore, scoreFontsReady, SCORE_HEIGHT, type RenderedScore } from '../../core/score/ScoreRenderer';
import { fitScore, type ScoreFit } from '../../core/score/scoreFit';

export interface HunterScoreHandle {
  /** Gọi mỗi khung hình: di con trỏ phát + tự cuộn (thao tác DOM trực tiếp, không render React). */
  setBeat(beat: number, waiting: boolean): void;
}

interface Props {
  song: HunterSong;
  targets: readonly TargetResult[];
  /** Chỉ số mục tiêu sắp tới / đang chờ (tô nổi bật). */
  upcoming: number | null;
  leadInBeats: number;
  showNames: boolean;
  labelStyle: NoteLabelStyle;
  ref?: Ref<HunterScoreHandle>;
}

/** Con trỏ đứng ở chừng này bề ngang vùng nhìn (đọc trước được phần còn lại). */
const FOCUS_RATIO = 0.3;
const PLAYHEAD_WIDTH = 4;
// Phóng tối đa 1.6 (ScoreView 2.4): cột phải chỉ rộng nửa màn hình — cần thấy đủ nốt phía trước để đọc trước.
const FIT = { minScale: 0.8, maxScale: 1.6, fallbackScale: 1.4 };

/**
 * Khuông nhạc một dòng của bài Săn nốt: vẽ một lần (ScoreRenderer, cùng dữ liệu nốt với trình phát + logic game),
 * nốt mục tiêu tím / khác trung tính bằng CSS class; con trỏ phát chạy liên tục theo phách.
 */
export function HunterScore({ song, targets, upcoming, leadInBeats, showNames, labelStyle, ref }: Props) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const renderedRef = useRef<RenderedScore | null>(null);
  const sizeRef = useRef({ w: 0, h: 0 });
  const fitRef = useRef<ScoreFit | null>(null);
  const lastRef = useRef({ beat: -Infinity, waiting: false, playing: -2 });
  const [ready, setReady] = useState(false);
  const [layout, setLayout] = useState(0);

  useEffect(() => {
    let alive = true;
    void scoreFontsReady().then(() => alive && setReady(true));
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      sizeRef.current = { w: entry.contentRect.width, h: entry.contentRect.height };
      setLayout((v) => v + 1);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useLayoutEffect(() => {
    if (!ready || !hostRef.current) return;
    try {
      const r = renderScore(hostRef.current, song.lesson, { showNames, labelStyle });
      r.cursor.setAttribute('width', String(PLAYHEAD_WIDTH));
      r.cursor.setAttribute('rx', '2');
      renderedRef.current = r;
    } catch (err) {
      console.error('[VietPiano] Lỗi vẽ khuông nhạc Săn nốt', err);
      renderedRef.current = null;
    }
    lastRef.current = { beat: -Infinity, waiting: false, playing: -2 };
    setLayout((v) => v + 1);
  }, [ready, song, showNames, labelStyle]);

  // Trạng thái nốt (mục tiêu / sắp tới / đúng / lỡ) — chỉ đổi khi kết quả đổi.
  useLayoutEffect(() => {
    const r = renderedRef.current;
    if (!r) return;
    const byNote = new Map(targets.map((t, i) => [t.noteIndex, { t, i }]));
    r.noteElements.forEach((el, i) => {
      if (!el) return;
      const hit = byNote.get(i);
      el.classList.toggle('is-target', !!hit);
      el.classList.toggle('is-upcoming', !!hit && hit.i === upcoming && hit.t.status === 'pending');
      el.classList.toggle('is-correct', hit?.t.status === 'hit');
      el.classList.toggle('is-wrong', hit?.t.status === 'missed');
      if (hit) el.setAttribute('data-target', hit.t.status);
      else el.removeAttribute('data-target');
    });
  }, [targets, upcoming, layout]);

  const apply = (beat: number, waiting: boolean) => {
    const r = renderedRef.current;
    const inner = innerRef.current;
    if (!r || !inner) return;
    const last = lastRef.current;
    if (Math.abs(beat - last.beat) < 1e-4 && waiting === last.waiting) return;
    const x = cursorX(song.notes, r.noteCenters, beat, { endX: r.width - 30, leadInBeats });
    r.cursor.setAttribute('x', String(x - PLAYHEAD_WIDTH / 2));
    if (waiting !== last.waiting) r.cursor.classList.toggle('is-waiting', waiting);
    const playing = noteIndexAt(song.notes, beat);
    if (playing !== last.playing) {
      r.noteElements[last.playing]?.classList.remove('is-playing');
      r.noteElements[playing]?.classList.add('is-playing');
    }
    const { w, h } = sizeRef.current;
    const height = r.height || SCORE_HEIGHT;
    // Vùng nhìn co giãn chút ít → giữ nguyên tỉ lệ + vị trí (khuông không nhảy lên xuống).
    const fit = (fitRef.current = fitScore(fitRef.current, h, height, FIT));
    const scale = fit.scale;
    const contentWidth = r.width * scale;
    const offset = Math.min(Math.max(0, contentWidth - w), Math.max(0, x * scale - w * FOCUS_RATIO));
    inner.style.width = `${contentWidth}px`;
    inner.style.height = `${height * scale}px`;
    inner.style.top = `${fit.top}px`;
    inner.style.transform = `translateX(${-offset}px)`;
    lastRef.current = { beat, waiting, playing };
  };

  useImperativeHandle(ref, () => ({ setBeat: apply }));
  // Vẽ lại / đổi kích thước → đặt lại con trỏ ngay (không chờ khung hình sau).
  useLayoutEffect(() => {
    const { beat, waiting } = lastRef.current;
    lastRef.current = { ...lastRef.current, beat: -Infinity };
    apply(Number.isFinite(beat) ? beat : -leadInBeats, waiting);
  });

  return (
    <div ref={viewportRef} className="hunter-score relative h-full w-full overflow-hidden" aria-label={`Khuông nhạc bài ${song.title}`} data-testid="hunter-score">
      {!ready && <div className="absolute inset-0 grid place-items-center text-slate-400">Đang tải khuông nhạc…</div>}
      <div ref={innerRef} className="absolute top-0 left-0">
        <div ref={hostRef} className="h-full w-full [&>svg]:h-full [&>svg]:w-full" />
      </div>
    </div>
  );
}
