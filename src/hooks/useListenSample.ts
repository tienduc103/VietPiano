import { useCallback, useEffect, useRef, useState } from 'react';
import { scheduleNotes, soundOutput } from '../core/audio/SoundOutput';
import { listenPlanAtBeat } from '../core/practice/listenSample';
import { stepIndexAtBeat } from '../core/practice/handPractice';
import type { Lesson } from '../core/lessons/types';

/** Độ trễ `playSequence` trước nốt đầu (giây). */
const START_DELAY_SEC = 0.08;

/**
 * Nghe mẫu ở màn Luyện tập: bật → phát từ đầu ô nhịp chứa bước `index` của dòng tập (`steps`: phách bắt đầu từng bước —
 * nốt giai điệu, hoặc nốt đệm khi tập tay trái) ở nhịp độ `bpm`; `playIndex` = bước đang vang (con trỏ khuông nhạc
 * chạy theo); bấm lại / hết bài / rời màn → tắt. Micro tự bỏ nốt lúc đang phát.
 */
export function useListenSample(lesson: Lesson, steps: readonly { startBeat: number }[]) {
  const [playIndex, setPlayIndex] = useState<number | null>(null);
  const stopRef = useRef<() => void>(() => {});

  // Ổn định qua các lần render: màn hình dùng làm phụ thuộc của effect (đổi chế độ → tắt).
  const stop = useCallback(() => stopRef.current(), []);

  const start = (index: number, bpm: number) => {
    stop();
    const plan = listenPlanAtBeat(lesson, steps[index]?.startBeat ?? 0);
    const ms = soundOutput.playSequence(scheduleNotes(plan.notes, bpm));
    if (ms === 0) return;
    const t0 = performance.now() + START_DELAY_SEC * 1000;
    let raf = 0;
    const loop = () => {
      const beat = (Math.max(0, performance.now() - t0) / 60000) * bpm;
      setPlayIndex(stepIndexAtBeat(steps, plan.fromBeat + beat));
      raf = requestAnimationFrame(loop);
    };
    const timer = window.setTimeout(() => stopRef.current(), ms);
    stopRef.current = () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(timer);
      soundOutput.stop();
      setPlayIndex(null);
      stopRef.current = () => {};
    };
    loop();
  };

  useEffect(() => () => stopRef.current(), []);

  return { playing: playIndex !== null, playIndex, start, stop, supported: soundOutput.isSupported() };
}
