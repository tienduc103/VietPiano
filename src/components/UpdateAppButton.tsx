import { useEffect, useRef, useState } from 'react';
import { checkForUpdate } from '../appUpdate';
import { hardReload } from '../hardReload';
import { Icon } from './ui';

type State = 'idle' | 'checking' | 'updating' | 'latest' | 'offline';

const LABELS: Record<State, string> = {
  idle: 'Cập nhật bản mới nhất',
  checking: 'Đang kiểm tra…',
  updating: 'Đang cập nhật…',
  latest: 'Đã là bản mới nhất',
  offline: 'Không có mạng',
};

/**
 * Nút cập nhật phiên bản mới nhất (thay nút nổi tải lại cứng, đang tạm tắt): hỏi server `version.json`;
 * có bản khác bản đang chạy → tải lại cứng (gỡ service worker + xoá cache, giữ tiến độ / cài đặt);
 * đã mới nhất → báo, không tải lại; không kiểm tra được (server cũ chưa có version.json…) → vẫn tải lại cứng.
 */
export function UpdateAppButton({ className = '' }: { className?: string }) {
  const [state, setState] = useState<State>('idle');
  const [target, setTarget] = useState<string | null>(null);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  const flash = (s: State) => {
    setState(s);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setState('idle'), 3000);
  };

  const run = async () => {
    setState('checking');
    const res = await checkForUpdate(__APP_VERSION__, `${import.meta.env.BASE_URL}version.json`);
    if (res.status === 'latest') return flash('latest');
    if (res.status === 'offline') return flash('offline');
    setTarget(res.status === 'available' ? res.version : null);
    setState('updating');
    await hardReload();
  };

  const busy = state === 'checking' || state === 'updating';
  const label = state === 'updating' && target ? `Đang cập nhật lên ${target}…` : LABELS[state];

  return (
    <button
      type="button"
      disabled={busy}
      onClick={() => void run()}
      data-testid="update-app"
      data-state={state}
      title="Kiểm tra và cập nhật lên phiên bản mới nhất — tiến độ và cài đặt vẫn giữ nguyên."
      className={`inline-flex min-h-12 items-center gap-2 rounded-xl px-3 text-sm font-semibold text-violet-700 transition-colors hover:bg-violet-50 active:bg-violet-100 disabled:opacity-60 dark:text-violet-300 dark:hover:bg-slate-800 ${className}`}
    >
      <Icon name="reload" className={`h-5 w-5 ${busy ? 'animate-spin' : ''}`} />
      <span aria-live="polite">{label}</span>
    </button>
  );
}
