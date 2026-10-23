import { useCallback, useEffect, useRef } from 'react';
import type { PracticeEngine } from '../core/practice/PracticeEngine';
import { NoteStatsCollector } from '../core/practice/NoteStats';
import type { Lesson } from '../core/lessons/types';
import { useApp } from '../store/appStore';
import { useProfiles } from '../store/profileStore';

/** Không tính thời gian nếu quá lâu không có thao tác nào (người học bỏ đi). */
const IDLE_CUTOFF_MS = 60_000;
const TICK_MS = 1000;

/**
 * Đo thời gian luyện tập thực và lưu phiên vào ProgressStorage khi:
 * hoàn thành bài, chơi lại từ đầu, hoặc rời màn hình (nếu đã có thao tác).
 */
export function useSessionRecorder(engine: PracticeEngine, lesson: Lesson) {
  const recordSession = useApp((s) => s.recordSession);
  const ref = useRef({ activeMs: 0, lastTick: null as number | null, wallStart: Date.now(), saved: false });
  const noteStats = useRef(new NoteStatsCollector());

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
    });
  }, [engine, lesson.id, recordSession]);

  useEffect(() => {
    const id = window.setInterval(accumulate, TICK_MS);
    noteStats.current.reset();
    noteStats.current.update(engine.getState());
    const unsub = engine.subscribe((s) => {
      noteStats.current.update(s);
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
    engine.restart();
  }, [engine, accumulate, save]);

  return { restart };
}
