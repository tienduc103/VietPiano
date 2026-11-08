import { useEffect, useMemo, useRef, useState } from 'react';
import { resolveTarget, targetKey } from '../../core/shortcuts/registry';
import { findByTarget } from '../../core/shortcuts/ShortcutService';
import type { ShortcutTarget } from '../../core/shortcuts/types';
import { useShortcuts } from '../../store/shortcutStore';
import { Button, Icon } from '../ui';
import { FOCUS_RING } from './shortcutStyle';

interface Props {
  /** Đích của màn / nội dung đang xem (null → không hiện nút). */
  target: ShortcutTarget | null;
  /**
   * icon: nút nhỏ trên thanh đầu trang (cạnh nút toàn màn hình).
   * row : dòng trong bảng ⚙ Cài đặt của trò chơi (không thêm nút lên thanh đầu màn chơi).
   */
  variant?: 'icon' | 'row';
  className?: string;
}

/**
 * "Ghim lối tắt" tại chỗ: tự nhận đích của màn đang xem → hộp thoại ghim có sẵn tên + biểu tượng (sửa được) → Lưu.
 * Đã ghim → nút ở trạng thái "Đã ghim", bấm để sửa hoặc bỏ ghim (bỏ ghim có Hoàn tác).
 */
export function PinShortcutButton({ target, variant = 'icon', className = '' }: Props) {
  const items = useShortcuts((s) => s.items);
  const openEditor = useShortcuts((s) => s.openEditor);
  const remove = useShortcuts((s) => s.remove);
  // Màn thường dựng đích mới mỗi lần vẽ → chỉ tính lại khi khoá đích đổi.
  const key = target ? targetKey(target) : '';
  const dest = useMemo(() => (target ? resolveTarget(target) : null), [key]);
  const pinned = dest ? findByTarget(items, dest.target) : undefined;
  const [menu, setMenu] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menu) return;
    const onDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setMenu(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setMenu(false);
    document.addEventListener('pointerdown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [menu]);
  useEffect(() => {
    if (!pinned) setMenu(false);
  }, [pinned]);

  if (!dest) return null;
  const pin = () => openEditor({ mode: 'pin', target: dest.target });

  if (variant === 'row') {
    return (
      <div
        className={`flex flex-wrap items-center gap-2 rounded-2xl bg-violet-50 p-3 ring-1 ring-violet-100 dark:bg-slate-900/60 dark:ring-violet-900 ${className}`}
        data-testid="pin-shortcut-row"
        data-pinned={!!pinned}
      >
        <Icon name="pin" className="h-5 w-5 shrink-0 text-fuchsia-600 dark:text-fuchsia-300" />
        <span className="min-w-40 flex-1 text-sm">
          {pinned ? (
            <>
              Đã ghim lên trang chủ:{' '}
              <b>
                {pinned.icon} {pinned.name}
              </b>
            </>
          ) : (
            <>Ghim “{dest.title}” thành lối tắt trên trang chủ</>
          )}
        </span>
        {pinned ? (
          <>
            <Button variant="ghost" className="px-3 text-sm" onClick={() => openEditor({ mode: 'edit', id: pinned.id })}>
              Sửa
            </Button>
            <Button variant="ghost" className="px-3 text-sm" onClick={() => remove(pinned.id)} data-testid="pin-shortcut-remove">
              Bỏ ghim
            </Button>
          </>
        ) : (
          <Button className="px-3 text-sm" onClick={pin} data-testid="pin-shortcut">
            Ghim lối tắt
          </Button>
        )}
      </div>
    );
  }

  return (
    <div ref={ref} className={`relative shrink-0 ${className}`}>
      <Button
        variant="ghost"
        onClick={() => (pinned ? setMenu((m) => !m) : pin())}
        aria-label={pinned ? `Đã ghim lối tắt “${pinned.name}” — sửa hoặc bỏ ghim` : 'Ghim lối tắt tới trang này'}
        title={pinned ? `Đã ghim: ${pinned.name}` : 'Ghim lối tắt'}
        aria-pressed={!!pinned}
        aria-expanded={pinned ? menu : undefined}
        className={`px-2 ${pinned ? 'bg-fuchsia-100 text-fuchsia-700 dark:bg-fuchsia-900/60 dark:text-fuchsia-200' : ''}`}
        data-testid="pin-shortcut"
        data-pinned={!!pinned}
      >
        <Icon name="pin" />
      </Button>
      {menu && pinned && (
        <div
          role="dialog"
          aria-label="Lối tắt đã ghim"
          className="absolute top-full right-0 z-40 mt-2 w-72 rounded-2xl bg-white p-3 text-left text-slate-900 shadow-2xl ring-1 ring-violet-100 dark:bg-slate-800 dark:text-slate-100 dark:ring-violet-900"
          data-testid="pin-shortcut-menu"
        >
          <p className="text-sm text-slate-500 dark:text-slate-400">Đã ghim lên trang chủ</p>
          <p className="mt-1 truncate text-lg font-semibold">
            {pinned.icon} {pinned.name}
          </p>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={() => {
                setMenu(false);
                openEditor({ mode: 'edit', id: pinned.id });
              }}
              className={`min-h-12 flex-1 rounded-xl px-3 font-semibold text-violet-800 ring-1 ring-violet-200 hover:bg-violet-50 dark:text-violet-100 dark:ring-violet-800 dark:hover:bg-slate-700 ${FOCUS_RING}`}
            >
              Sửa
            </button>
            <button
              type="button"
              onClick={() => {
                setMenu(false);
                remove(pinned.id);
              }}
              className={`min-h-12 flex-1 rounded-xl px-3 font-semibold text-rose-700 ring-1 ring-rose-200 hover:bg-rose-50 dark:text-rose-200 dark:ring-rose-800 dark:hover:bg-slate-700 ${FOCUS_RING}`}
              data-testid="pin-shortcut-remove"
            >
              Bỏ ghim
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
