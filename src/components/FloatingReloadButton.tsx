import { useState } from 'react';
import { hardReload } from '../hardReload';
import { Icon } from './ui';

/**
 * Nút nổi góc trên bên trái mọi màn hình: tải lại cứng (như Ctrl+F5) để lấy bản mới nhất.
 * Header các màn hình chừa lề trái để nút không che nút "Quay lại"/logo.
 */
export function FloatingReloadButton() {
  const [reloading, setReloading] = useState(false);
  return (
    <button
      type="button"
      disabled={reloading}
      onClick={() => {
        setReloading(true);
        void hardReload();
      }}
      data-testid="floating-reload"
      aria-label="Tải lại bản mới nhất"
      title="Tải lại bản mới nhất (như Ctrl+F5) — tiến độ và cài đặt vẫn giữ nguyên"
      className="fixed top-[calc(8px+env(safe-area-inset-top,0px)+var(--fullscreen-top-gap))] left-[calc(8px+env(safe-area-inset-left,0px))] z-50 flex h-12 w-12 items-center justify-center rounded-2xl bg-white/90 text-violet-900 shadow-lg ring-1 ring-slate-900/10 transition-colors select-none hover:bg-violet-50 active:bg-violet-100 dark:bg-slate-800/90 dark:text-slate-100 dark:ring-white/10 dark:hover:bg-slate-700"
    >
      <Icon name="restart" className={`h-6 w-6 ${reloading ? 'animate-spin' : ''}`} />
    </button>
  );
}
