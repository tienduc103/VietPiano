import { useCallback, useEffect, useRef, useState } from 'react';
import { soundOutput, type ScheduledNote } from '../core/audio/SoundOutput';
import { soundingAt } from '../core/coach/replay';

/** Độ trễ `playSequence` trước nốt đầu (giây) — như nghe mẫu ở màn Luyện tập. */
const START_DELAY_SEC = 0.08;

export type ReplayKind = 'mine' | 'reference' | 'ab';

/**
 * Phát lại trong Coach: lên lịch qua `soundOutput` (cùng AudioContext tiếng đàn mẫu), mỗi khung hình tính phách đang vang
 * (`beatAt` theo giây kể từ đầu lịch) để con trỏ khuông nhạc + phím sáng chạy theo. Bấm lại / hết lịch / rời màn → dừng.
 */
export function useCoachReplay() {
  const [kind, setKind] = useState<ReplayKind | null>(null);
  const [beat, setBeat] = useState<number | null>(null);
  const [keys, setKeys] = useState<ReadonlySet<number>>(new Set());
  const [part, setPart] = useState<'A' | 'B' | null>(null);
  const stopRef = useRef<() => void>(() => {});

  const stop = useCallback(() => stopRef.current(), []);

  const play = useCallback(
    (k: ReplayKind, notes: ScheduledNote[], beatAt: (t: number) => number | null, bStart?: number) => {
      stopRef.current();
      const ms = soundOutput.playSequence(notes);
      if (ms === 0) return;
      const t0 = performance.now() + START_DELAY_SEC * 1000;
      let raf = 0;
      setKind(k);
      const loop = () => {
        const t = Math.max(0, (performance.now() - t0) / 1000);
        setBeat(beatAt(t));
        setKeys(soundingAt(notes, t));
        setPart(bStart === undefined ? null : t < bStart ? 'A' : 'B');
        raf = requestAnimationFrame(loop);
      };
      const timer = window.setTimeout(() => stopRef.current(), ms + 200);
      stopRef.current = () => {
        cancelAnimationFrame(raf);
        window.clearTimeout(timer);
        soundOutput.stop();
        setKind(null);
        setBeat(null);
        setKeys(new Set());
        setPart(null);
        stopRef.current = () => {};
      };
      loop();
    },
    [],
  );

  useEffect(() => () => stopRef.current(), []);

  return { kind, beat, keys, part, play, stop, supported: soundOutput.isSupported() };
}
