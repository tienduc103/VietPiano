import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { useApp } from '../store/appStore';
import { useGameTime } from '../store/gameTimeStore';
import { useProfiles } from '../store/profileStore';
import { Button } from './ui';

function formatTime(ms: number): string {
  const seconds = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

/** Đồng hồ dùng chung: chỉ chạy khi ít nhất một game báo đang chơi và tab đang hiện. */
export function GameTimeController() {
  const profileKey = useProfiles((s) => s.activeId ?? 'guest');
  const selectProfile = useGameTime((s) => s.selectProfile);
  const activeGames = useGameTime((s) => s.activeGames);
  const openGames = useGameTime((s) => s.openGames);
  const remainingMs = useGameTime((s) => s.remainingMs);
  const consume = useGameTime((s) => s.consume);
  const route = useApp((s) => s.route);
  const lastTick = useRef(performance.now());

  useEffect(() => selectProfile(profileKey), [profileKey, selectProfile]);
  useEffect(() => {
    lastTick.current = performance.now();
    if (activeGames <= 0 || remainingMs <= 0) return;
    const tick = () => {
      const now = performance.now();
      const elapsed = now - lastTick.current;
      lastTick.current = now;
      if (!document.hidden) consume(elapsed);
    };
    const id = window.setInterval(tick, 1000);
    return () => {
      window.clearInterval(id);
      tick();
    };
  }, [activeGames, remainingMs > 0, consume, profileKey]);

  const gameArea = ['games', 'note-hunter', 'flappy-note', 'balloon-pop', 'tomato-harvest', 'f1-racing'].includes(route.name);
  if (!gameArea && activeGames <= 0 && openGames <= 0) return null;
  return (
    <div
      className={`fixed top-[calc(.5rem+env(safe-area-inset-top,0px)+var(--fullscreen-top-gap))] left-1/2 z-[70] -translate-x-1/2 rounded-full px-4 py-2 font-bold tabular-nums shadow-lg ring-2 backdrop-blur ${
        remainingMs <= 60_000
          ? 'bg-rose-600/95 text-white ring-rose-300'
          : 'bg-white/95 text-violet-700 ring-violet-200 dark:bg-slate-900/95 dark:text-violet-200 dark:ring-violet-700'
      }`}
      data-testid="game-time-counter"
      aria-label={`Thời gian chơi còn lại ${formatTime(remainingMs)}`}
    >
      🎮 {formatTime(remainingMs)}
    </div>
  );
}

export function GameTimeLocked() {
  const navigate = useApp((s) => s.navigate);
  return (
    <div className="grid h-full place-items-center p-6" data-testid="game-time-locked">
      <section className="grid max-w-lg justify-items-center gap-4 rounded-3xl bg-white/95 p-8 text-center shadow-xl ring-2 ring-violet-200 dark:bg-slate-900/95 dark:ring-violet-800">
        <div className="text-6xl" aria-hidden>⏳</div>
        <h1 className="text-3xl font-extrabold">Đã hết giờ chơi</h1>
        <p className="text-lg text-slate-600 dark:text-slate-300">Hoàn thành một bài học bất kỳ để nhận thêm 10 phút chơi.</p>
        <div className="flex flex-wrap justify-center gap-3">
          <Button variant="primary" onClick={() => navigate({ name: 'curriculum' })}>📚 Học bài để nhận 10 phút</Button>
          <Button onClick={() => navigate({ name: 'dashboard' })}>Về trang chủ</Button>
        </div>
      </section>
    </div>
  );
}

/** Chặn các màn game độc lập ngay khi quỹ thời gian về 0. */
export function TimedGameRoute({ children }: { children: ReactNode }) {
  const remainingMs = useGameTime((s) => s.remainingMs);
  return remainingMs > 0 ? children : <GameTimeLocked />;
}

