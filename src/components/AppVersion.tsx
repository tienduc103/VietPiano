/** Dòng phiên bản cuối trang (đọc từ file VERSION lúc build; "dev" nếu chưa phát hành). */
export function AppVersion({ className = '' }: { className?: string }) {
  return (
    <p className={`text-center text-xs text-slate-400 dark:text-slate-500 ${className}`} data-testid="app-version">
      VietPiano · phiên bản {__APP_VERSION__}
    </p>
  );
}
