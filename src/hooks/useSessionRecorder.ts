import { useCallback, useEffect, useRef } from 'react';
import type { PracticeEngine } from '../core/practice/PracticeEngine';
import { NoteStatsCollector } from '../core/practice/NoteStats';
import { measureErrorsFrom } from '../core/practice/waitBreakdown';
import type { Lesson } from '../core/lessons/types';
import { useApp } from '../store/appStore';
import { useProfiles } from '../store/profileStore';

/** Không tính thời gian nếu quá lâu không có thao tác nào (người học bỏ đi). */
const IDLE_CUTOFF_MS = 60_000;
const TICK_MS = 1000;

/**
 * Đo thời gian luyện tập thực và lưu phiên vào ProgressStorage khi:
 * hoàn thành bài, chơi lại từ đầu, hoặc rời màn hình (nếu đã có thao tác).
 * `extra`: chế độ (Chờ / Đếm nốt) + số ô in của từng bước → lưu lỗi theo ô (tìm lại đoạn hay sai). Bài là đoạn cắt
 * (`lesson.slice`) → ghi `measures`, không tính là hoàn thành cả bài.
 */
export function useSessionRecorder(engine: PracticeEngine, lesson: Lesson, hand?: 'right' | 'left', extra?: { mode: 'wait' | 'count'; stepMeasures: readonly number[] }) {
  const recordSession = useApp((s) => s.recordSession);
  const ref = useRef({ activeMs: 0, lastTick: null as number | null, wallStart: Date.now(), saved: false });
  const noteStats = useRef(new NoteStatsCollector());
  // Số lần bấm sai ở từng bước (suy từ trạng thái: số lỗi tăng lúc đang chờ bước đó).
  const stepWrong = useRef<number[]>([]);
  const prevState = useRef<ReturnType<PracticeEngine['getState']> | null>(null);
  const extraRef = useRef(extra);
  extraRef.current = extra;

  const accumulate = useCallback(() => {
    const s = engine.getState();
    const r = ref.current;
    const now = performance.now();
    const active =
      document.visibilityState === 'visible' &&
      s.startedAt !== null &&
      s.status !== 'finished' &&
      now - s.lastEventTime < IDLE_CUTOFF_MS;
    if (active && r.lastTick !== null) r.activeMs += Math.min(now - r.lastTick, TICK_MS * 3);
    r.lastTick = active ? now : null;
  }, [engine]);

  const save = useCallback(() => {
    const s = engine.getState();
    const r = ref.current;
    if (r.saved || s.correct + s.wrong + s.skipped === 0) return;
    r.saved = true;
    const completed = s.status === 'finished';
    const { reading, notes } = noteStats.current.result();
    const x = extraRef.current;
    const measureErrors = x ? measureErrorsFrom(stepWrong.current, s.results, x.stepMeasures) : undefined;
    void recordSession({
      lessonId: lesson.id,
      profileId: useProfiles.getState().activeId ?? undefined,
      startedAt: r.wallStart,
      durationMs: Math.round(r.activeMs),
      correct: s.correct,
      wrong: s.wrong,
      skipped: s.skipped,
      completed,
      notesReached: completed ? s.expected.length : s.index,
      totalNotes: s.expected.length,
      reading,
      noteTallies: notes,
      ...(hand ? { hand } : {}),
      ...(x ? { mode: x.mode } : {}),
      ...(measureErrors && Object.keys(measureErrors).length ? { measureErrors } : {}),
      ...(lesson.slice ? { measures: [lesson.slice.from, lesson.slice.to] as [number, number] } : {}),
    });
  }, [engine, lesson.id, lesson.slice, hand, recordSession]);

  useEffect(() => {
    const id = window.setInterval(accumulate, TICK_MS);
    noteStats.current.reset();
    noteStats.current.update(engine.getState());
    stepWrong.current = [];
    prevState.current = engine.getState();
    const unsub = engine.subscribe((s) => {
      noteStats.current.update(s);
      const prev = prevState.current;
      prevState.current = s;
      if (s.startedAt === null) stepWrong.current = [];
      else if (prev && s.wrong > prev.wrong) stepWrong.current[prev.index] = (stepWrong.current[prev.index] ?? 0) + (s.wrong - prev.wrong);
      // Tính phần thời gian lẻ ngay tại thời điểm hoàn thành rồi lưu.
      if (s.status === 'finished') {
        const r = ref.current;
        if (r.lastTick !== null) r.activeMs += Math.min(performance.now() - r.lastTick, TICK_MS * 3);
        r.lastTick = null;
        save();
      } else if (ref.current.lastTick === null && s.startedAt !== null) {
        ref.current.lastTick = performance.now();
      }
    });
    return () => {
      window.clearInterval(id);
      unsub();
      accumulate();
      save();
    };
  }, [engine, accumulate, save]);

  /** Lưu phiên dang dở (nếu có) rồi bắt đầu lại. */
  const restart = useCallback(() => {
    accumulate();
    save();
    ref.current = { activeMs: 0, lastTick: null, wallStart: Date.now(), saved: false };
    stepWrong.current = [];
    engine.restart();
  }, [engine, accumulate, save]);

  return { restart };
}
