import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { soundOutput } from '../core/audio/SoundOutput';
import { pedalRanges } from '../core/curriculum/piece';
import { midiInput } from '../core/input/MIDIInputProvider';
import type { NoteInputEvent } from '../core/input/NoteInputProvider';
import { virtualInput } from '../core/input/VirtualInputProvider';
import { lessonTempo, measureLength, type Lesson } from '../core/lessons/types';
import { loudnessDb } from '../core/music/dynamics';
import type { PracticeHand } from '../core/practice/handPractice';
import { PerformanceTracker } from '../core/practice/PerformanceTracker';
import { performanceBreakdown, performancePlan } from '../core/practice/performPlan';
import { useSettings } from '../store/settingsStore';
import { usePerformLog } from './usePerformLog';

/** Độ trễ ước lượng micro (cùng giá trị màn Luyện tập dùng cho chế độ Theo nhịp). */
const MIC_LATENCY_MS = 60;

/**
 * Chế độ Biểu diễn ở màn Luyện tập: đồng hồ nhịp CỐ ĐỊNH (đếm vào một ô + các phách trước nốt lấy đà), chơi một mạch,
 * sai không dừng; chấm cao độ + thời điểm + thả phím (Note Off) + lực gõ (mạnh nhẹ) + pedal CC64 — cùng PerformanceTracker
 * và rubric với bài Biểu diễn của giáo trình. `enabled` = đang ở chế độ này (tắt → tạm dừng).
 */
export function usePracticePerformance({
  lesson,
  hand,
  singleNotesOnly,
  enabled,
  bpm,
  octaveTolerant,
  withPedal,
  pedalInput,
  metronomeDefault,
}: {
  lesson: Lesson;
  hand: PracticeHand;
  /** Nốt chỉ đến từ micro → chỉ chấm nốt đơn. */
  singleNotesOnly: boolean;
  enabled: boolean;
  bpm: number;
  octaveTolerant: boolean;
  /** Bài có ký hiệu pedal được chấm (không phải pedal tuỳ chọn). */
  withPedal: boolean;
  /** Nguồn vào gửi được pedal (đàn MIDI). */
  pedalInput: boolean;
  /** Bật tiếng metronome mặc định (tắt khi dùng micro, trừ khi Cài đặt cho phép). */
  metronomeDefault: boolean;
}) {
  const plan = useMemo(() => performancePlan(lesson, hand, singleNotesOnly), [lesson, hand, singleNotesOnly]);
  const beatsPerMeasure = measureLength(lesson.timeSignature);
  const tracker = useMemo(
    () =>
      plan.length
        ? new PerformanceTracker(plan, {
            bpm: lessonTempo(lesson),
            // Một ô đếm vào + các phách trước nốt lấy đà (3/4 lấy đà 1 phách: "1 2 3 | 1 2" rồi vào "Hap-py").
            countInBeats: beatsPerMeasure + (lesson.pickup ? beatsPerMeasure - lesson.pickup : 0),
            octaveTolerant,
            pedal: withPedal ? pedalRanges(lesson) : [],
            debounceSamePitch: !singleNotesOnly,
          })
        : null,
    [plan, lesson, beatsPerMeasure, octaveTolerant, withPedal, singleNotesOnly],
  );
  const empty = useMemo(() => new PerformanceTracker([{ startBeat: 0, durationBeats: 1, midi: 60 }]), []);
  const t = tracker ?? empty;
  const state = useSyncExternalStore(
    (cb) => t.subscribe(cb),
    () => t.getState(),
  );
  useEffect(() => t.setBpm(bpm, performance.now()), [t, bpm]);
  useEffect(() => t.setPedalInput(pedalInput), [t, pedalInput]);
  useEffect(() => {
    if (!enabled) return;
    return midiInput.onPedal((e) => t.handlePedal(e.down, e.time));
  }, [t, enabled]);
  useEffect(() => {
    if (!enabled) return;
    const off = (e: { midi: number; time: number }) => t.handleNoteOff(e.midi, e.time);
    const a = midiInput.onNoteOff(off);
    const b = virtualInput.onNoteOff(off);
    return () => {
      a();
      b();
    };
  }, [t, enabled]);

  const running = state.status === 'running' || state.status === 'countIn';
  const [metronome, setMetronome] = useState(metronomeDefault);
  const metronomeRef = useRef(metronome);
  metronomeRef.current = metronome;

  // TẠM THỜI: Nhật ký Biểu diễn (docs/perform-log.md) — ghi từng lượt để điều tra chấm sai / lỡ nhiều.
  const log = usePerformLog({
    tracker: t,
    enabled: enabled && !!tracker,
    screen: 'practice',
    notes: plan,
    lesson,
    info: () => ({
      hand,
      scored: true,
      singleNotesOnly,
      micLatencyMs: MIC_LATENCY_MS,
      metronome: metronomeRef.current,
      pedalScored: withPedal,
      pedalInput,
      tempoPercent: useSettings.getState().settings.tempoPercent,
    }),
  });
  // Đồng hồ nhịp theo khung hình; click metronome mỗi phách (phách đầu ô cao hơn).
  useEffect(() => {
    if (!running) return;
    let id = 0;
    let lastBeat = Math.floor(t.getState().beat);
    const pickup = lesson.pickup ?? 0;
    const loop = () => {
      t.tick(performance.now());
      const b = Math.floor(t.getState().beat);
      if (b !== lastBeat) {
        lastBeat = b;
        if (metronomeRef.current && t.getState().status !== 'finished') {
          // Phách 0 của bài là ô lấy đà → đầu ô nhịp thật lệch `pickup` phách.
          const inMeasure = (((b - pickup) % beatsPerMeasure) + beatsPerMeasure) % beatsPerMeasure;
          soundOutput.click(inMeasure === 0);
        }
      }
      id = requestAnimationFrame(loop);
    };
    id = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(id);
  }, [t, running, beatsPerMeasure, lesson.pickup]);

  // Rời chế độ / ẩn app → tạm dừng.
  useEffect(() => {
    if (!enabled) {
      t.pause(performance.now());
      return;
    }
    const onVis = () => document.visibilityState === 'hidden' && t.pause(performance.now());
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [t, enabled]);

  const { grade, dropped: logDropped } = log;
  const handleNoteOn = useCallback(
    (e: NoteInputEvent) => {
      const time = e.source === 'microphone' ? e.time - MIC_LATENCY_MS : e.time;
      grade(e, time, () => t.handleNoteOn(e.midi, time, loudnessDb(e)));
    },
    [t, grade],
  );

  const toggle = useCallback(() => {
    const now = performance.now();
    const s = t.getState();
    if (s.status === 'running' || s.status === 'countIn') t.pause(now);
    else if (s.status === 'finished') t.restart();
    else t.start(now);
  }, [t]);
  const restart = useCallback(() => t.restart(), [t]);

  const finished = state.status === 'finished';
  const breakdown = useMemo(() => {
    if (!finished || !tracker) return null;
    const result = tracker.result();
    return { result, ...performanceBreakdown(plan, state, result, 150, 0.5 * tracker.beatMs) };
  }, [finished, tracker, plan, state]);

  return { plan, tracker: t, available: !!tracker, state, running, finished, breakdown, handleNoteOn, logDropped, toggle, restart, metronome, setMetronome };
}
