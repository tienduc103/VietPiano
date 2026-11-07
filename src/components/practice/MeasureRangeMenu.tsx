import { useEffect, useMemo, useRef, useState } from 'react';
import { measureRange } from '../../core/lessons/slice';
import type { Lesson } from '../../core/lessons/types';
import { frequentMistakes } from '../../core/practice/waitBreakdown';
import { useProfileSessions } from '../../hooks/useProfileProgress';
import { useApp } from '../../store/appStore';
import { Button, Icon } from '../ui';

/**
 * Luyện theo đoạn: chọn ô nhịp từ – tới (số ô in trên bản nhạc) hoặc bấm nhanh đoạn hay sai (gộp từ lịch sử luyện bài này
 * của hồ sơ đang chọn). Mở lại màn Luyện tập với đoạn cắt; "Cả bài" quay về bài đầy đủ.
 */
export function MeasureRangeMenu({ lesson, base }: { lesson: Lesson; base: Lesson }) {
  const openLesson = useApp((s) => s.openLesson);
  const sessions = useProfileSessions();
  const { first, last } = useMemo(() => measureRange(base), [base]);
  const [open, setOpen] = useState(false);
  const [from, setFrom] = useState(lesson.slice?.from ?? first);
  const [to, setTo] = useState(lesson.slice?.to ?? Math.min(last, first + 1));
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [open]);
  const weak = useMemo(() => frequentMistakes(sessions.filter((s) => s.lessonId === base.id).map((s) => s.measureErrors)), [sessions, base.id]);
  const go = (a: number, b: number) => {
    setOpen(false);
    openLesson(base.id, [Math.max(first, Math.min(a, b)), Math.min(last, Math.max(a, b))]);
  };
  const label = (m: number) => (base.pickup && m === 0 ? 'lấy đà' : `ô ${m}`);
  const stepper = (value: number, set: (v: number) => void, name: string) => (
    <div className="flex items-center gap-1">
      <Button variant="ghost" className="px-3 text-xl" aria-label={`${name} lùi một ô`} disabled={value <= first} onClick={() => set(value - 1)}>
        −
      </Button>
      <span className="min-w-16 text-center font-semibold tabular-nums">{label(value)}</span>
      <Button variant="ghost" className="px-3 text-xl" aria-label={`${name} tiến một ô`} disabled={value >= last} onClick={() => set(value + 1)}>
        +
      </Button>
    </div>
  );

  return (
    <div ref={ref} className="relative shrink-0">
      <Button variant="ghost" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="gap-1.5 px-3 text-sm whitespace-nowrap" data-testid="measure-range">
        <Icon name="brackets" className="h-5 w-5" />
        {lesson.slice ? (lesson.slice.from === lesson.slice.to ? label(lesson.slice.from) : `${label(lesson.slice.from)}–${lesson.slice.to}`) : 'Đoạn'}
      </Button>
      {open && (
        <div
          role="dialog"
          aria-label="Luyện theo đoạn"
          className="absolute top-full left-0 z-30 mt-2 w-80 rounded-2xl bg-white p-3 shadow-2xl ring-1 ring-violet-100 dark:bg-slate-800 dark:ring-violet-900"
          data-testid="measure-range-panel"
        >
          <p className="px-1 pb-2 text-sm text-slate-500 dark:text-slate-400">Luyện riêng một đoạn (số ô như trên bản nhạc). Luyện đoạn không tính là xong cả bài.</p>
          <div className="flex items-center justify-between gap-2">
            <span>Từ</span>
            {stepper(from, (v) => (setFrom(v), v > to && setTo(v)), 'Ô bắt đầu')}
          </div>
          <div className="flex items-center justify-between gap-2">
            <span>Tới</span>
            {stepper(to, (v) => (setTo(v), v < from && setFrom(v)), 'Ô kết thúc')}
          </div>
          <div className="mt-2 flex gap-2">
            <Button variant="primary" className="flex-1" onClick={() => go(from, to)} data-testid="measure-range-go">
              Tập đoạn này
            </Button>
            {lesson.slice && (
              <Button className="flex-1" onClick={() => (setOpen(false), openLesson(base.id))} data-testid="measure-range-full">
                Cả bài
              </Button>
            )}
          </div>
          {weak.length > 0 && (
            <div className="mt-3 border-t border-violet-100 pt-2 dark:border-violet-900">
              <div className="px-1 pb-1 text-xs font-semibold tracking-wide text-slate-500 uppercase dark:text-slate-400">Đoạn hay sai</div>
              <div className="flex flex-wrap gap-2">
                {weak.map((w) => (
                  <Button key={w.measure} className="text-sm" onClick={() => go(w.measure, w.measure)} data-testid={`weak-measure-${w.measure}`}>
                    {label(w.measure)} · {w.total} lỗi
                  </Button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
