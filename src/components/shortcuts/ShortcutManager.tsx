import { useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { foldSearchText, resolveTarget, targetStatus } from '../../core/shortcuts/registry';
import { filterShortcuts } from '../../core/shortcuts/ShortcutService';
import type { Shortcut } from '../../core/shortcuts/types';
import { useCurriculum } from '../../store/curriculumStore';
import { activeProfile, useProfiles } from '../../store/profileStore';
import { useShortcuts } from '../../store/shortcutStore';
import { Button, Card, Icon } from '../ui';
import { FOCUS_RING } from './shortcutStyle';

/** Danh sách dài từ mức này thì hiện ô tìm. */
const SEARCH_FROM = 6;

const ACTION = `min-h-12 rounded-xl px-3 text-sm font-semibold transition-colors disabled:opacity-30 ${FOCUS_RING}`;

/**
 * Cài đặt → Lối tắt: danh sách lối tắt của hồ sơ đang chọn — tạo, sửa, xoá (có hoàn tác), mở, bật / tắt hiện trên trang
 * chủ, sắp xếp bằng kéo thả (tay nắm ⠿) hoặc nút lên / xuống / phím mũi tên cho máy không kéo thả được, tìm khi danh sách dài.
 * `extra`: mục con của tính năng khác (vd Lối tắt thông minh), vẽ cuối thẻ.
 */
export function ShortcutManager({ extra }: { extra?: ReactNode }) {
  const items = useShortcuts((s) => s.items);
  const saveError = useShortcuts((s) => s.saveError);
  const openEditor = useShortcuts((s) => s.openEditor);
  const remove = useShortcuts((s) => s.remove);
  const move = useShortcuts((s) => s.move);
  const setShowOnHome = useShortcuts((s) => s.setShowOnHome);
  const openShortcut = useShortcuts((s) => s.open);
  const records = useCurriculum((s) => s.records);
  const profile = useProfiles(activeProfile);
  const [query, setQuery] = useState('');

  const info = useMemo(() => new Map(items.map((s) => [s.id, { dest: resolveTarget(s.target), status: targetStatus(s.target, records) }])), [items, records]);
  const filtering = query.trim().length > 0;
  const shown = useMemo(
    () =>
      filterShortcuts(
        items,
        query,
        (s) => {
          const d = info.get(s.id)?.dest;
          return d ? `${d.title} ${d.path.join(' ')}` : '';
        },
        foldSearchText,
      ),
    [items, query, info],
  );

  // ── Kéo thả bằng con trỏ (chuột, cảm ứng, bút) trên tay nắm ──
  const listRef = useRef<HTMLUListElement>(null);
  const [drag, setDrag] = useState<{ id: string; from: number; to: number; dy: number } | null>(null);
  const geometry = useRef<{ startY: number; centers: number[]; step: number } | null>(null);
  const startDrag = (e: ReactPointerEvent<HTMLButtonElement>, s: Shortcut, index: number) => {
    if (filtering || e.button > 0) return;
    const rows = [...(listRef.current?.children ?? [])] as HTMLElement[];
    const rects = rows.map((r) => r.getBoundingClientRect());
    if (!rects[index]) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture?.(e.pointerId);
    geometry.current = {
      startY: e.clientY,
      centers: rects.map((r) => r.top + r.height / 2),
      step: rects.length > 1 ? Math.abs(rects[1].top - rects[0].top) : rects[index].height + 8,
    };
    setDrag({ id: s.id, from: index, to: index, dy: 0 });
  };
  const moveDrag = (e: ReactPointerEvent<HTMLButtonElement>) => {
    const g = geometry.current;
    if (!drag || !g) return;
    const dy = e.clientY - g.startY;
    const center = g.centers[drag.from] + dy;
    const to = g.centers.reduce((n, c, i) => (i !== drag.from && c < center ? n + 1 : n), 0);
    setDrag({ ...drag, dy, to });
  };
  const endDrag = (commit: boolean) => {
    if (drag && commit && drag.to !== drag.from) move(drag.id, drag.to);
    setDrag(null);
    geometry.current = null;
  };
  const shiftOf = (index: number): number => {
    const g = geometry.current;
    if (!drag || !g || index === drag.from) return 0;
    if (drag.to > drag.from && index > drag.from && index <= drag.to) return -g.step;
    if (drag.to < drag.from && index >= drag.to && index < drag.from) return g.step;
    return 0;
  };
  const onHandleKey = (e: ReactKeyboardEvent, s: Shortcut, index: number) => {
    if (filtering) return;
    if (e.key === 'ArrowUp' && index > 0) {
      e.preventDefault();
      move(s.id, index - 1);
    } else if (e.key === 'ArrowDown' && index < items.length - 1) {
      e.preventDefault();
      move(s.id, index + 1);
    }
  };

  return (
    <Card>
      <div id="shortcuts" className="scroll-mt-6" data-testid="shortcut-manager">
        <div className="flex flex-wrap items-start gap-3">
          <div className="min-w-60 flex-1">
            <h2 className="text-xl font-semibold">Lối tắt</h2>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              Mở thẳng bài học, trò chơi, bài nhạc hay trang hay dùng từ thanh cạnh hồ sơ ở trang chủ. Riêng cho hồ sơ{' '}
              {profile ? (
                <b>
                  {profile.avatar} {profile.name}
                </b>
              ) : (
                'khách (chưa chọn hồ sơ)'
              )}
              , lưu trên máy này. Ghim nhanh: bấm <Icon name="pin" className="inline h-4 w-4 align-[-2px]" /> ở đầu trang bài học, hoặc trong ⚙ Cài đặt của trò chơi.
            </p>
          </div>
          <Button variant="primary" onClick={() => openEditor({ mode: 'create' })} data-testid="shortcut-create">
            <span className="text-xl leading-none" aria-hidden>
              +
            </span>
            Tạo lối tắt
          </Button>
        </div>

        {items.length >= SEARCH_FROM && (
          <label className="mt-4 block">
            <span className="sr-only">Tìm lối tắt</span>
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={`Tìm trong ${items.length} lối tắt…`}
              className="block min-h-12 w-full rounded-xl bg-white px-4 text-base ring-1 ring-slate-300 outline-none focus:ring-2 focus:ring-fuchsia-400 dark:bg-slate-900 dark:ring-slate-600"
              data-testid="shortcut-search"
            />
          </label>
        )}

        {items.length === 0 ? (
          <p className="mt-4 rounded-2xl bg-violet-50 p-4 text-slate-600 dark:bg-slate-900/60 dark:text-slate-300" data-testid="shortcut-empty">
            Chưa có lối tắt nào. Bấm “Tạo lối tắt” để chọn bài học, trò chơi, bài nhạc… muốn mở nhanh.
          </p>
        ) : (
          <>
            {filtering && <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">Đang lọc — xoá ô tìm để kéo thả đổi thứ tự.</p>}
            {filtering && shown.length === 0 && <p className="mt-3 text-slate-500 dark:text-slate-400">Không có lối tắt khớp “{query.trim()}”.</p>}
            <ul ref={listRef} className="mt-3 grid gap-2" data-testid="shortcut-list">
              {shown.map((s) => {
                const index = items.indexOf(s);
                const { dest, status } = info.get(s.id) ?? { dest: null, status: 'missing' as const };
                const dragging = drag?.id === s.id;
                return (
                  <li
                    key={s.id}
                    className={`rounded-2xl bg-white/80 p-2 ring-1 dark:bg-slate-900/50 ${dragging ? 'relative z-10 shadow-xl ring-fuchsia-300 dark:ring-fuchsia-700' : 'ring-violet-100 dark:ring-violet-900'} ${drag && !dragging ? 'transition-transform duration-150' : ''}`}
                    style={drag ? { transform: `translateY(${dragging ? drag.dy : shiftOf(index)}px)` } : undefined}
                    data-testid={`shortcut-row-${s.id}`}
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        aria-label={`Kéo để đổi thứ tự “${s.name}” (hoặc dùng phím mũi tên lên / xuống)`}
                        title="Kéo để đổi thứ tự"
                        disabled={filtering}
                        onPointerDown={(e) => startDrag(e, s, index)}
                        onPointerMove={moveDrag}
                        onPointerUp={() => endDrag(true)}
                        onPointerCancel={() => endDrag(false)}
                        onKeyDown={(e) => onHandleKey(e, s, index)}
                        className={`grid min-h-12 w-10 shrink-0 cursor-grab touch-none place-items-center rounded-xl text-slate-400 hover:bg-violet-50 active:cursor-grabbing disabled:cursor-default disabled:opacity-30 dark:hover:bg-slate-700 ${FOCUS_RING}`}
                        data-testid="shortcut-drag"
                      >
                        <Icon name="grip" className="h-6 w-6" />
                      </button>
                      <span className="w-9 shrink-0 text-center text-3xl leading-none" aria-hidden>
                        {s.icon}
                      </span>
                      <div className="min-w-44 flex-1">
                        <div className="truncate font-semibold" data-testid="shortcut-row-name">
                          {s.name}
                        </div>
                        <div className={`truncate text-xs ${dest ? 'text-slate-500 dark:text-slate-400' : 'text-amber-700 dark:text-amber-300'}`}>
                          {dest ? `${dest.path.join(' › ')} › ${dest.title}` : '⚠️ Nội dung không còn trong phiên bản này — sửa để chọn lại, hoặc xoá'}
                        </div>
                        {status === 'suggest-later' && (
                          <span className="mt-0.5 inline-block rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                            Nên học buổi trước — vẫn mở được
                          </span>
                        )}
                      </div>
                      <div className="flex flex-wrap items-center justify-end gap-1">
                        <label className="flex min-h-12 cursor-pointer items-center gap-2 rounded-xl px-2 text-sm">
                          <span className="text-slate-600 dark:text-slate-300">Trang chủ</span>
                          <button
                            type="button"
                            role="switch"
                            aria-checked={s.showOnHome}
                            aria-label={`Hiện “${s.name}” trên thanh lối tắt ở trang chủ`}
                            onClick={() => setShowOnHome(s.id, !s.showOnHome)}
                            className={`relative h-8 w-14 shrink-0 rounded-full transition-colors ${FOCUS_RING} ${s.showOnHome ? 'bg-gradient-to-r from-violet-500 to-fuchsia-500' : 'bg-slate-300 dark:bg-slate-600'}`}
                            data-testid="shortcut-home-toggle"
                          >
                            <span className={`absolute top-1 left-1 h-6 w-6 rounded-full bg-white shadow transition-transform ${s.showOnHome ? 'translate-x-6' : ''}`} />
                          </button>
                        </label>
                        <button
                          type="button"
                          onClick={() => openShortcut(s)}
                          className={`${ACTION} text-violet-800 hover:bg-violet-50 dark:text-violet-100 dark:hover:bg-slate-700`}
                          data-testid="shortcut-open"
                        >
                          Mở
                        </button>
                        <button
                          type="button"
                          onClick={() => openEditor({ mode: 'edit', id: s.id })}
                          className={`${ACTION} text-violet-800 hover:bg-violet-50 dark:text-violet-100 dark:hover:bg-slate-700`}
                          data-testid="shortcut-edit"
                        >
                          Sửa
                        </button>
                        <button
                          type="button"
                          onClick={() => move(s.id, index - 1)}
                          disabled={filtering || index === 0}
                          aria-label={`Đưa “${s.name}” lên trên`}
                          className={`${ACTION} w-12 px-0 text-lg text-violet-800 hover:bg-violet-50 dark:text-violet-100 dark:hover:bg-slate-700`}
                          data-testid="shortcut-up"
                        >
                          ↑
                        </button>
                        <button
                          type="button"
                          onClick={() => move(s.id, index + 1)}
                          disabled={filtering || index === items.length - 1}
                          aria-label={`Đưa “${s.name}” xuống dưới`}
                          className={`${ACTION} w-12 px-0 text-lg text-violet-800 hover:bg-violet-50 dark:text-violet-100 dark:hover:bg-slate-700`}
                          data-testid="shortcut-down"
                        >
                          ↓
                        </button>
                        <button
                          type="button"
                          onClick={() => remove(s.id)}
                          aria-label={`Xoá lối tắt “${s.name}”`}
                          className={`${ACTION} text-rose-700 hover:bg-rose-50 dark:text-rose-300 dark:hover:bg-rose-950/50`}
                          data-testid="shortcut-delete"
                        >
                          Xoá
                        </button>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          </>
        )}

        {saveError && (
          <p className="mt-3 rounded-xl bg-amber-100 px-4 py-2 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-200" role="alert">
            {saveError}
          </p>
        )}

        {extra && <div className="mt-5 border-t border-violet-100 pt-4 dark:border-violet-900">{extra}</div>}
      </div>
    </Card>
  );
}
