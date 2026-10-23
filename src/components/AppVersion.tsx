/** Dòng phiên bản cuối trang (đọc từ file VERSION lúc build; "dev" nếu chưa phát hành). */
export function AppVersion({ className = '' }: { className?: string }) {
  return (
    <p className={`text-center text-xs text-slate-400 dark:text-slate-500 ${className}`} data-testid="app-version">
      VietPiano · phiên bản {__APP_VERSION__}
    </p>
  );
}

/**
 * TẠM THỜI trong giai đoạn xây dựng site: dòng phiên bản mờ chạy dọc sát mép trái mọi màn hình
 * (mép trên hay bị thanh công cụ che). Xoá component này (và chỗ dùng trong App.tsx) khi không cần nữa.
 */
export function AppVersionSide() {
  return (
    <p
      className="pointer-events-none fixed top-1/2 left-[calc(2px+env(safe-area-inset-left,0px))] z-50 -translate-y-1/2 rotate-180 text-[10px] leading-none whitespace-nowrap text-slate-400/70 select-none [writing-mode:vertical-rl] dark:text-slate-500/70"
      data-testid="app-version-side"
      aria-hidden="true"
    >
      VietPiano · phiên bản {__APP_VERSION__}
    </p>
  );
}
