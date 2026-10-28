import { useEffect, useState, useSyncExternalStore } from 'react';

export interface GameResult {
  score: number;
  stars: 0 | 1 | 2 | 3;
  hits: number;
  total: number;
  bestCombo: number;
}

/** Engine game có `subscribe` / `getState` như QuizEngine. */
export function useGameState<S>(engine: { subscribe: (cb: () => void) => () => void; getState: () => S }): S {
  return useSyncExternalStore(
    (cb) => engine.subscribe(cb),
    () => engine.getState(),
  );
}

/** Đồng hồ khung hình (performance.now) khi `active`; gọi `onFrame` trước mỗi lần vẽ. */
export function useFrameClock(active: boolean, onFrame: (now: number) => void): number {
  const [now, setNow] = useState(() => performance.now());
  useEffect(() => {
    if (!active) return;
    let id = 0;
    const loop = () => {
      const t = performance.now();
      onFrame(t);
      setNow(t);
      id = requestAnimationFrame(loop);
    };
    id = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(id);
    // `onFrame` gọi engine.tick — engine cố định trong suốt ván.
  }, [active]);
  return now;
}

/** Phản hồi trên phím vừa đánh trong chốc lát. */
export function useKeyFlash(eventTime: number, midi: number | null, outcome: 'hit' | 'wrong' | 'miss' | null, ms = 300) {
  const [flash, setFlash] = useState<{ midi: number; kind: 'correct' | 'wrong' } | null>(null);
  useEffect(() => {
    if (eventTime === 0 || midi === null || (outcome !== 'hit' && outcome !== 'wrong')) return;
    setFlash({ midi, kind: outcome === 'hit' ? 'correct' : 'wrong' });
    const id = window.setTimeout(() => setFlash(null), ms);
    return () => window.clearTimeout(id);
  }, [eventTime, midi, outcome, ms]);
  return flash;
}

export function Hud({ score, combo, children }: { score: number; combo: number; children?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-4 text-lg font-bold">
      <span data-testid="game-score" className="tabular-nums">
        ⭐ {score}
      </span>
      <span className={`tabular-nums transition-opacity ${combo >= 2 ? 'text-fuchsia-600 opacity-100 dark:text-fuchsia-300' : 'opacity-0'}`} aria-hidden={combo < 2}>
        Chuỗi ×{combo}
      </span>
      {children}
    </div>
  );
}

export function Stars({ stars, className = 'text-6xl' }: { stars: number; className?: string }) {
  return (
    <div className={`text-amber-400 ${className}`} aria-label={`${stars} sao`} data-testid="game-stars" data-stars={stars}>
      {'★'.repeat(stars)}
      <span className="text-slate-300 dark:text-slate-600">{'★'.repeat(3 - stars)}</span>
    </div>
  );
}
