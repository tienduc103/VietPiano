/** Dòng phiên bản cuối trang (đọc từ file VERSION lúc build; "dev" nếu chưa phát hành). */
export function AppVersion({ className = '' }: { className?: string }) {
  return (
    <p className={`text-center text-xs text-slate-400 dark:text-slate-500 ${className}`} data-testid="app-version">
      VietPiano · phiên bản {__APP_VERSION__}
    </p>
  );
}

/**
 * TẠM THỜI trong giai đoạn xây dựng site: dòng phiên bản mờ ở trên cùng mọi màn hình.
 * Xoá component này (và chỗ dùng trong App.tsx) khi không cần nữa.
 */
export function AppVersionTop() {
  return (
    <p
      className="pointer-events-none fixed inset-x-0 top-[calc(2px+env(safe-area-inset-top,0px)+var(--fullscreen-top-gap))] z-50 text-center text-[10px] leading-none text-slate-400/50 select-none dark:text-slate-500/50"
      data-testid="app-version-top"
      aria-hidden="true"
    >
      VietPiano · phiên bản {__APP_VERSION__}
    </p>
  );
}
