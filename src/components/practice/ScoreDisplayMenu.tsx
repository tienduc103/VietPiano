import { useEffect, useRef, useState } from 'react';
import type { Lesson } from '../../core/lessons/types';
import { SCORE_ZOOM_MAX, SCORE_ZOOM_MIN, SCORE_ZOOM_STEP } from '../../core/settings/DeviceSettings';
import { useSettings } from '../../store/settingsStore';
import { Button, Icon, Toggle } from '../ui';

/**
 * Tuỳ chọn hiển thị khuông nhạc ở màn Luyện tập: tên nốt, số ngón, ký hiệu hợp âm, ký hiệu pedal, cỡ khuông.
 * Tên nốt + số ngón áp dụng cả khối "Cần đánh" và bàn phím ảo dưới khuông.
 * Chỉ đổi hình vẽ — không đổi dữ liệu bài hay cách chấm (ẩn ký hiệu pedal vẫn chấm pedal).
 */
export function ScoreDisplayMenu({ lesson }: { lesson: Lesson }) {
  const settings = useSettings((s) => s.settings);
  const update = useSettings((s) => s.update);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Chạm ra ngoài bảng → đóng.
  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [open]);

  const zoom = settings.scoreZoom;
  const setZoom = (dir: 1 | -1) => update({ scoreZoom: Math.round(Math.min(SCORE_ZOOM_MAX, Math.max(SCORE_ZOOM_MIN, zoom + dir * SCORE_ZOOM_STEP)) * 100) / 100 });

  return (
    <div ref={ref} className="relative">
      <Button
        variant="ghost"
        aria-label="Hiển thị khuông nhạc"
        title="Hiển thị: tên nốt, số ngón, hợp âm, pedal, cỡ khuông"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="px-2"
        data-testid="score-display"
      >
        <Icon name="sliders" />
      </Button>
      {open && (
        <div
          role="dialog"
          aria-label="Hiển thị khuông nhạc"
          className="absolute top-full right-0 z-30 mt-2 w-72 rounded-2xl bg-white px-4 py-2 shadow-2xl ring-1 ring-violet-100 dark:bg-slate-800 dark:ring-violet-900"
          data-testid="score-display-panel"
        >
          <Toggle checked={settings.showNoteNames} onChange={(v) => update({ showNoteNames: v })} label="Tên nốt" />
          <Toggle checked={settings.showFingers} onChange={(v) => update({ showFingers: v })} label="Số ngón tay" />
          {!!lesson.chordSymbols?.length && <Toggle checked={settings.showChordSymbols} onChange={(v) => update({ showChordSymbols: v })} label="Ký hiệu hợp âm" />}
          {!!lesson.pedal?.length && <Toggle checked={settings.showPedalMarks} onChange={(v) => update({ showPedalMarks: v })} label="Ký hiệu pedal" />}
          {lesson.clef === 'grand' && <Toggle checked={settings.colorHands} onChange={(v) => update({ colorHands: v })} label="Tô màu riêng tay trái" />}
          <div className="flex min-h-12 items-center justify-between gap-2">
            <span>Cỡ khuông</span>
            <div className="flex items-center gap-1">
              <Button variant="ghost" onClick={() => setZoom(-1)} aria-label="Thu nhỏ khuông nhạc" disabled={zoom <= SCORE_ZOOM_MIN + 1e-9} className="px-3 text-xl">
                −
              </Button>
              <span className="min-w-14 text-center font-semibold tabular-nums" data-testid="score-zoom">
                {Math.round(zoom * 100)}%
              </span>
              <Button variant="ghost" onClick={() => setZoom(1)} aria-label="Phóng to khuông nhạc" disabled={zoom >= SCORE_ZOOM_MAX - 1e-9} className="px-3 text-xl">
                +
              </Button>
            </div>
          </div>
          {zoom !== 1 && (
            <Button variant="ghost" className="mb-1 w-full" onClick={() => update({ scoreZoom: 1 })}>
              Vừa khung
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
