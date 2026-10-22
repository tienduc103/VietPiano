import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { renderScore, scoreFontsReady, SCORE_HEIGHT, type RenderedScore } from '../core/score/ScoreRenderer';
import type { Lesson } from '../core/lessons/types';
import type { NoteResult, PracticeStatus } from '../core/practice/PracticeEngine';
import type { NoteLabelStyle } from '../core/music/notes';

interface Props {
  lesson: Lesson;
  index: number;
  results: readonly NoteResult[];
  status: PracticeStatus;
  /** Đổi giá trị để kích hoạt hiệu ứng rung khi đánh sai. */
  wrongPulse: number;
  showNames: boolean;
  labelStyle: NoteLabelStyle;
}

/** Vị trí nốt hiện tại trên màn hình (tỉ lệ chiều rộng). */
const FOCUS_RATIO = 0.3;

export function ScoreView({ lesson, index, results, status, wrongPulse, showNames, labelStyle }: Props) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const svgHostRef = useRef<HTMLDivElement>(null);
  const renderedRef = useRef<RenderedScore | null>(null);
  const [ready, setReady] = useState(false);
  const [layoutVersion, setLayoutVersion] = useState(0);
  const [size, setSize] = useState({ w: 0, h: 0 });

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
    const ro = new ResizeObserver(([entry]) => setSize({ w: entry.contentRect.width, h: entry.contentRect.height }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Vẽ lại toàn bộ chỉ khi đổi bài hoặc cách hiển thị tên nốt.
  useLayoutEffect(() => {
    if (!ready || !svgHostRef.current) return;
    try {
      renderedRef.current = renderScore(svgHostRef.current, lesson, { showNames, labelStyle });
    } catch (err) {
      console.error('[VietPiano] Lỗi vẽ khuông nhạc', err);
      renderedRef.current = null;
    }
    setLayoutVersion((v) => v + 1);
  }, [ready, lesson, showNames, labelStyle]);

  // Cập nhật trạng thái từng nốt bằng CSS class (không vẽ lại).
  useLayoutEffect(() => {
    const r = renderedRef.current;
    if (!r) return;
    r.noteElements.forEach((el, i) => {
      if (!el) return;
      const res = results[i];
      el.classList.toggle('is-current', i === index && status !== 'finished');
      el.classList.toggle('is-correct', res === 'correct');
      el.classList.toggle('is-corrected', res === 'corrected');
      el.classList.toggle('is-skipped', res === 'skipped');
    });
    r.labelElements.forEach((el, i) => el?.classList.toggle('is-current', i === index && status !== 'finished'));
    const cx = r.noteCenters[index] ?? 0;
    r.cursor.setAttribute('x', String(cx - 17));
    r.cursor.style.display = status === 'finished' ? 'none' : '';
    r.cursor.classList.toggle('is-wrong', status === 'wrong');
  }, [index, results, status, layoutVersion]);

  // Rung nhẹ khuông nhạc khi đánh sai (khởi động lại animation CSS).
  useEffect(() => {
    const el = svgHostRef.current;
    if (!el || wrongPulse === 0) return;
    el.classList.remove('animate-shake');
    void el.offsetWidth;
    el.classList.add('animate-shake');
  }, [wrongPulse]);

  const r = renderedRef.current;
  // Phóng to theo chiều cao vùng hiển thị để đọc được từ giá nhạc.
  // Tối đa 2.4: khoảng dòng kẻ ~4 mm trên iPad, vẫn thấy đủ nốt phía trước để đọc trước.
  const scale = size.h > 0 ? Math.max(1, Math.min(2.4, size.h / SCORE_HEIGHT)) : 1.6;
  const contentWidth = (r?.width ?? 0) * scale;
  const focusX = (r?.noteCenters[index] ?? 0) * scale;
  const maxOffset = Math.max(0, contentWidth - size.w);
  const offset = Math.min(maxOffset, Math.max(0, focusX - size.w * FOCUS_RATIO));

  return (
    <div
      ref={viewportRef}
      className="relative h-full w-full overflow-hidden"
      aria-label={`Khuông nhạc bài ${lesson.title}`}
      data-testid="score"
    >
      {!ready && <div className="absolute inset-0 grid place-items-center text-slate-400">Đang tải khuông nhạc…</div>}
      <div
        className="absolute top-1/2 left-0"
        style={{
          width: contentWidth,
          height: SCORE_HEIGHT * scale,
          transform: `translate(${-offset}px, -50%)`,
          transition: 'transform 350ms cubic-bezier(0.22, 1, 0.36, 1)',
        }}
      >
        <div ref={svgHostRef} className="h-full w-full [&>svg]:h-full [&>svg]:w-full" />
      </div>
    </div>
  );
}
