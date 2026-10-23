import { useEffect, useRef, useState } from 'react';
import { hardReload } from '../hardReload';
import { isDrag, pixelsToPosition, positionToPixels, type Viewport } from '../core/settings/floatingPosition';
import { useSettings } from '../store/settingsStore';
import { Icon } from './ui';

const SIZE = 48;

function useViewport(): Viewport {
  const read = () => ({ width: window.innerWidth, height: window.innerHeight });
  const [vp, setVp] = useState(read);
  useEffect(() => {
    const onResize = () => setVp(read());
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  return vp;
}

/**
 * Nút nổi tải lại cứng (như Ctrl+F5) để lấy bản mới nhất. Mặc định ở góc trên bên trái (header các màn hình
 * chừa lề trái cho nút); kéo để di chuyển, vị trí lưu trong cài đặt. Kéo xong không tính là bấm.
 */
export function FloatingReloadButton() {
  const pos = useSettings((s) => s.settings.reloadButtonPos);
  const update = useSettings((s) => s.update);
  const viewport = useViewport();
  const [reloading, setReloading] = useState(false);
  const [dragging, setDragging] = useState<{ left: number; top: number } | null>(null);
  const drag = useRef<{ startX: number; startY: number; left: number; top: number; moved: boolean } | null>(null);
  // Sau khi kéo trình duyệt vẫn phát click → bỏ qua đúng một click đó.
  const suppressClick = useRef(false);

  const place = dragging
    ? positionToPixels(pixelsToPosition(dragging.left, dragging.top, SIZE, viewport), SIZE, viewport)
    : pos && positionToPixels(pos, SIZE, viewport);

  return (
    <button
      type="button"
      disabled={reloading}
      onPointerDown={(e) => {
        suppressClick.current = false;
        const r = e.currentTarget.getBoundingClientRect();
        drag.current = { startX: e.clientX, startY: e.clientY, left: r.left, top: r.top, moved: false };
        e.currentTarget.setPointerCapture(e.pointerId);
      }}
      onPointerMove={(e) => {
        const d = drag.current;
        if (!d) return;
        const dx = e.clientX - d.startX;
        const dy = e.clientY - d.startY;
        if (!d.moved && !isDrag(dx, dy)) return;
        d.moved = true;
        setDragging({ left: d.left + dx, top: d.top + dy });
      }}
      onPointerUp={(e) => {
        const d = drag.current;
        drag.current = null;
        if (!d?.moved) return;
        suppressClick.current = true;
        update({ reloadButtonPos: pixelsToPosition(d.left + e.clientX - d.startX, d.top + e.clientY - d.startY, SIZE, viewport) });
        setDragging(null);
      }}
      onPointerCancel={() => {
        drag.current = null;
        setDragging(null);
      }}
      onClick={() => {
        if (suppressClick.current) {
          suppressClick.current = false;
          return;
        }
        setReloading(true);
        void hardReload();
      }}
      data-testid="floating-reload"
      aria-label="Tải lại bản mới nhất"
      title="Tải lại bản mới nhất (như Ctrl+F5) — tiến độ và cài đặt vẫn giữ nguyên. Kéo để di chuyển."
      style={place ? { left: place.left, top: place.top } : undefined}
      className={`fixed z-50 flex h-12 w-12 touch-none items-center justify-center rounded-2xl bg-white/90 text-violet-900 shadow-lg ring-1 ring-slate-900/10 transition-colors select-none hover:bg-violet-50 active:bg-violet-100 dark:bg-slate-800/90 dark:text-slate-100 dark:ring-white/10 dark:hover:bg-slate-700 ${
        place ? '' : 'top-[calc(8px+env(safe-area-inset-top,0px)+var(--fullscreen-top-gap))] left-[calc(8px+env(safe-area-inset-left,0px))]'
      } ${dragging ? 'scale-110 cursor-grabbing opacity-80 shadow-xl' : 'cursor-grab'}`}
    >
      <Icon name="restart" className={`h-6 w-6 ${reloading ? 'animate-spin' : ''}`} />
    </button>
  );
}
