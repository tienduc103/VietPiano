import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { renderScore, scoreFontsReady, SCORE_HEIGHT, type RenderedScore } from '../core/score/ScoreRenderer';
import type { Hand, Lesson } from '../core/lessons/types';
import type { NoteResult, PracticeStatus } from '../core/practice/PracticeEngine';
import type { NoteLabelStyle } from '../core/music/notes';
import { fitScore, type ScoreFit } from '../core/score/scoreFit';

interface Props {
  lesson: Lesson;
  index: number;
  results: readonly NoteResult[];
  status: PracticeStatus;
  /** Đổi giá trị để kích hoạt hiệu ứng rung khi đánh sai. */
  wrongPulse: number;
  showNames: boolean;
  labelStyle: NoteLabelStyle;
  /** `index` / `results` trỏ vào nốt giai điệu (mặc định) hay nốt đệm tay trái (tập tay trái). */
  staff?: 'melody' | 'accompaniment';
  /** Làm mờ tay không tập (tập một tay). */
  dim?: Hand;
  /** Tỉ lệ thu nhỏ tối thiểu (mặc định 0.8). Màn Luyện tập cho thu nhỏ hơn để cửa sổ thấp vẫn thấy đủ khuông. */
  minScale?: number;
  /** Vẽ số ngón / ký hiệu hợp âm / ký hiệu pedal (mặc định có). */
  showFingers?: boolean;
  showChords?: boolean;
  showPedal?: boolean;
  /** Phóng to / thu nhỏ so với cỡ vừa khung (1 = vừa khung); phóng to quá khung thì cuộn dọc được. */
  zoom?: number;
  /** Kết quả từng nốt / hợp âm phần đệm khi đang chấm cả hai tay (`staff` = giai điệu) — tô đúng / sai cả khuông Fa. */
  accResults?: readonly NoteResult[];
  /** Khuông đôi: tô màu riêng nốt tay trái. */
  colorHands?: boolean;
}

/** Vị trí nốt hiện tại trên màn hình (tỉ lệ chiều rộng). */
const FOCUS_RATIO = 0.3;
// Phóng to theo chiều cao vùng hiển thị để đọc được từ giá nhạc.
// Tối đa 2.4: khoảng dòng kẻ ~4 mm trên iPad, vẫn thấy đủ nốt phía trước để đọc trước.
// Tối thiểu 0.8: khuông đôi có phần đệm + chữ đánh dấu đoạn thu nhỏ một chút thay vì bị cắt mất hàng tên nốt.
const FIT = { minScale: 0.8, maxScale: 2.4, fallbackScale: 1.6 };

export function ScoreView({
  lesson,
  index,
  results,
  status,
  wrongPulse,
  showNames,
  labelStyle,
  staff = 'melody',
  dim,
  minScale = FIT.minScale,
  showFingers = true,
  showChords = true,
  showPedal = true,
  zoom = 1,
  accResults,
  colorHands = false,
}: Props) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const svgHostRef = useRef<HTMLDivElement>(null);
  const renderedRef = useRef<RenderedScore | null>(null);
  const fitRef = useRef<ScoreFit | null>(null);
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

  // Vẽ lại toàn bộ chỉ khi đổi bài hoặc cách hiển thị (tên nốt, số ngón, hợp âm, pedal).
  useLayoutEffect(() => {
    if (!ready || !svgHostRef.current) return;
    try {
      renderedRef.current = renderScore(svgHostRef.current, lesson, { showNames, labelStyle, showFingers, showChords, showPedal });
    } catch (err) {
      console.error('[VietPiano] Lỗi vẽ khuông nhạc', err);
      renderedRef.current = null;
    }
    setLayoutVersion((v) => v + 1);
  }, [ready, lesson, showNames, labelStyle, showFingers, showChords, showPedal]);

  // Cập nhật trạng thái từng nốt bằng CSS class (không vẽ lại).
  useLayoutEffect(() => {
    const r = renderedRef.current;
    if (!r) return;
    const onAcc = staff === 'accompaniment';
    const mark = (els: readonly (SVGElement | null)[], active: boolean) =>
      els.forEach((el, i) => {
        if (!el) return;
        const res = active ? results[i] : undefined;
        el.classList.toggle('is-current', active && i === index && status !== 'finished');
        el.classList.toggle('is-correct', res === 'correct');
        el.classList.toggle('is-corrected', res === 'corrected');
        el.classList.toggle('is-skipped', res === 'skipped');
        el.classList.toggle('is-wrong', res === 'wrong');
      });
    mark(r.noteElements, !onAcc);
    if (!onAcc && accResults)
      r.accompanimentElements.forEach((el, i) => {
        if (!el) return;
        const res = accResults[i];
        el.classList.remove('is-current');
        el.classList.toggle('is-correct', res === 'correct');
        el.classList.toggle('is-corrected', res === 'corrected');
        el.classList.toggle('is-skipped', res === 'skipped');
        el.classList.toggle('is-wrong', res === 'wrong');
      });
    else mark(r.accompanimentElements, onAcc);
    r.labelElements.forEach((el, i) => el?.classList.toggle('is-current', !onAcc && i === index && status !== 'finished'));
    r.fingerElements.forEach((el, i) => el?.classList.toggle('is-current', !onAcc && i === index && status !== 'finished'));
    const cx = (onAcc ? r.accompanimentCenters : r.noteCenters)[index] ?? 0;
    r.cursor.setAttribute('x', String(cx - 17));
    r.cursor.style.display = status === 'finished' ? 'none' : '';
    r.cursor.classList.toggle('is-wrong', status === 'wrong');
  }, [index, results, status, staff, layoutVersion, accResults]);

  // Rung nhẹ khuông nhạc khi đánh sai (khởi động lại animation CSS).
  useEffect(() => {
    const el = svgHostRef.current;
    if (!el || wrongPulse === 0) return;
    el.classList.remove('animate-shake');
    void el.offsetWidth;
    el.classList.add('animate-shake');
  }, [wrongPulse]);

  const r = renderedRef.current;
  const height = r?.height ?? SCORE_HEIGHT;
  // Giữ cố định tỉ lệ + vị trí khi vùng nhìn chỉ co giãn chút ít theo từng nốt (khuông không nhảy lên xuống).
  const fit = (fitRef.current = fitScore(fitRef.current, size.h, height, { ...FIT, minScale }));
  const scale = fit.scale * zoom;
  // Phóng to quá khung: đặt khuông sát mép trên, khung cuộn dọc được; thu nhỏ: giữ khuông giữa khung.
  const top = zoom === 1 ? fit.top : Math.max(0, (size.h - height * scale) / 2);
  const contentWidth = (r?.width ?? 0) * scale;
  const focusX = ((staff === 'accompaniment' ? r?.accompanimentCenters : r?.noteCenters)?.[index] ?? 0) * scale;
  const maxOffset = Math.max(0, contentWidth - size.w);
  const offset = Math.min(maxOffset, Math.max(0, focusX - size.w * FOCUS_RATIO));

  return (
    <div
      ref={viewportRef}
      className={`relative h-full w-full ${zoom > 1 ? 'overflow-x-hidden overflow-y-auto' : 'overflow-hidden'} ${dim ? `score-dim-${dim}` : ''} ${colorHands && lesson.clef === 'grand' ? 'score-hand-colors' : ''}`}
      aria-label={`Khuông nhạc bài ${lesson.title}`}
      data-testid="score"
      data-zoom={zoom}
    >
      {!ready && <div className="absolute inset-0 grid place-items-center text-slate-400">Đang tải khuông nhạc…</div>}
      <div
        className="absolute left-0"
        style={{
          top,
          width: contentWidth,
          height: height * scale,
          transform: `translateX(${-offset}px)`,
          transition: 'transform 350ms cubic-bezier(0.22, 1, 0.36, 1)',
        }}
      >
        <div ref={svgHostRef} className="h-full w-full [&>svg]:h-full [&>svg]:w-full" />
      </div>
    </div>
  );
}
