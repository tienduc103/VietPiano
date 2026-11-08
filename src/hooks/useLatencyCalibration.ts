import { useCallback, useEffect, useRef, useState } from 'react';
import { soundOutput } from '../core/audio/SoundOutput';
import { analyzeTaps, CALIBRATION_BPM, CALIBRATION_CLICKS, CALIBRATION_LEAD_IN, type TapAnalysis } from '../core/coach/latency/calibration';
import { MetronomeClock } from '../core/coach/metronome';
import { estimateClock, eventTime } from '../core/coach/recorder/buildPerformance';
import type { PerformanceEvent } from '../core/coach/types';
import { microphoneInput } from '../core/input/MicrophoneInputProvider';
import { midiInput } from '../core/input/MIDIInputProvider';
import type { InputSource } from '../core/input/NoteInputProvider';

export type CalibrationPhase = 'idle' | 'running' | 'done';

export interface CalibrationRun {
  phase: CalibrationPhase;
  /** Đang bắt nhịp (4 tiếng click đầu, không đo). */
  leadIn: boolean;
  /** Tiếng click được đo đã phát. */
  clicksDone: number;
  /** Số lần gõ đã nhận (cả lúc bắt nhịp). */
  taps: number;
  /** Độ lệch các lần gõ gần tiếng click được đo (ms) — chấm trên dải. */
  live: number[];
  analysis: TapAnalysis | null;
  /** Độ trễ đầu ra trình duyệt báo lúc đo xong. */
  outputLatencyMs: number | null;
  /** Lưới tiếng click (performance.now) — e2e / chẩn đoán. */
  originMs: number | null;
  beatMs: number;
}

const BEAT_MS = 60000 / CALIBRATION_BPM;
/** Chờ trước tiếng click đầu tiên (đủ để AudioContext chạy). */
const START_DELAY_MS = 500;
const IDLE: CalibrationRun = { phase: 'idle', leadIn: false, clicksDone: 0, taps: 0, live: [], analysis: null, outputLatencyMs: null, originMs: null, beatMs: BEAT_MS };

/**
 * Đo độ trễ (M1-T7): phát tiếng click (cùng cách lên lịch với metronome lúc ghi), nhận lần gõ từ ĐÚNG nguồn sẽ ghi:
 *  - `midi`: Note On của đàn — mốc qua cùng mô hình đồng hồ với bộ ghi (`estimateClock`) → cùng cơ sở thời gian khi phân tích;
 *  - `virtual`: phím bất kỳ trên bàn phím máy tính (trừ Esc / Tab) hoặc nút chạm `tap()`;
 *  - `microphone`: nốt micro nghe được.
 * Không hiện nhịp bằng hình (người chơi phải bám TIẾNG click, như lúc chơi với metronome).
 */
export function useLatencyCalibration(source: InputSource) {
  const [run, setRun] = useState<CalibrationRun>(IDLE);
  const runRef = useRef(run);
  runRef.current = run;
  const raw = useRef<{ t: number; rt: number }[]>([]);
  const clicksRef = useRef<{ handle: { cancel: () => void } }[]>([]);
  const timer = useRef<{ raf: number } | null>(null);

  const measured = useCallback((originMs: number) => Array.from({ length: CALIBRATION_CLICKS }, (_, k) => originMs + k * BEAT_MS), []);

  const stopLoop = useCallback(() => {
    if (timer.current) cancelAnimationFrame(timer.current.raf);
    timer.current = null;
    for (const c of clicksRef.current) c.handle.cancel();
    clicksRef.current = [];
  }, []);

  /** Mốc các lần gõ theo cùng cơ sở thời gian bộ ghi dùng khi phân tích. */
  const tapTimes = useCallback(() => {
    const events: PerformanceEvent[] = raw.current.map((x) => ({ k: 'on', t: x.t, rt: x.rt, n: 60, v: null, ch: null, src: source }));
    const clock = estimateClock(events);
    return events.map((e) => eventTime(e, clock));
  }, [source]);

  const addTap = useCallback(
    (t: number, rt: number) => {
      const r = runRef.current;
      if (r.phase !== 'running' || r.originMs === null) return;
      raw.current.push({ t, rt });
      const clicks = measured(r.originMs);
      const at = source === 'midi' ? rt : t;
      let best = Infinity;
      for (const c of clicks) if (Math.abs(at - c) < Math.abs(best)) best = at - c;
      setRun((x) => ({ ...x, taps: x.taps + 1, live: Math.abs(best) <= BEAT_MS * 0.45 ? [...x.live, Math.round(best)] : x.live }));
    },
    [measured, source],
  );

  // Nguồn gõ.
  useEffect(() => {
    if (run.phase !== 'running') return;
    const offs: (() => void)[] = [];
    if (source === 'midi') {
      offs.push(midiInput.onDetail((d) => d.type === 'note' && d.on && addTap(d.time, performance.now())));
    } else if (source === 'microphone') {
      offs.push(microphoneInput.onNote((e) => addTap(e.time, e.time)));
    } else {
      const down = (e: KeyboardEvent) => {
        if (e.key === 'Escape' || e.key === 'Tab' || e.metaKey || e.ctrlKey || e.altKey) return;
        // Phím cách / Enter không được bấm nhầm nút đang focus (vd "Huỷ").
        e.preventDefault();
        e.stopPropagation();
        if (e.repeat) return;
        const t = performance.now();
        addTap(t, t);
      };
      window.addEventListener('keydown', down, true);
      offs.push(() => window.removeEventListener('keydown', down, true));
    }
    return () => offs.forEach((f) => f());
  }, [run.phase, source, addTap]);

  const finish = useCallback(() => {
    const r = runRef.current;
    stopLoop();
    if (r.originMs === null) return;
    const clicks = measured(r.originMs);
    // Chỉ lần gõ quanh các tiếng click được đo (lúc bắt nhịp không tính).
    const lo = clicks[0] - BEAT_MS / 2;
    const hi = clicks[clicks.length - 1] + BEAT_MS / 2;
    const taps = tapTimes().filter((t) => t >= lo && t <= hi);
    setRun((x) => ({ ...x, phase: 'done', leadIn: false, analysis: analyzeTaps(clicks, taps, BEAT_MS), outputLatencyMs: soundOutput.outputLatencyMs() }));
  }, [measured, stopLoop, tapTimes]);

  const start = useCallback(() => {
    stopLoop();
    soundOutput.unlock();
    raw.current = [];
    const originMs = performance.now() + START_DELAY_MS + CALIBRATION_LEAD_IN * BEAT_MS;
    const clock = new MetronomeClock({ originMs, beatMs: BEAT_MS, beatsPerMeasure: 4, pickup: 0, countInBeats: CALIBRATION_LEAD_IN });
    const end = originMs + (CALIBRATION_CLICKS - 1) * BEAT_MS + BEAT_MS / 2 + 150;
    setRun({ ...IDLE, phase: 'running', leadIn: true, originMs });
    let shownDone = -1;
    const loop = () => {
      const t = performance.now();
      for (const c of clock.due(t)) {
        if (c.beat >= CALIBRATION_CLICKS) continue;
        clicksRef.current.push({ handle: soundOutput.click(c.accent, Math.max(0, (c.atMs - t) / 1000)) });
      }
      // Số tiếng click được đo đã phát (cập nhật chữ, không phải tín hiệu nhịp).
      const done = Math.max(0, Math.min(CALIBRATION_CLICKS, Math.floor((t - originMs) / BEAT_MS) + 1));
      if (done !== shownDone) {
        shownDone = done;
        setRun((x) => ({ ...x, clicksDone: done, leadIn: t < originMs - BEAT_MS / 2 }));
      }
      if (t >= end) {
        finish();
        return;
      }
      timer.current = { raf: requestAnimationFrame(loop) };
    };
    timer.current = { raf: requestAnimationFrame(loop) };
  }, [finish, stopLoop]);

  const cancel = useCallback(() => {
    stopLoop();
    raw.current = [];
    setRun(IDLE);
  }, [stopLoop]);

  /** Nút chạm trên màn hình (nguồn bàn phím ảo). */
  const tap = useCallback(() => {
    if (source !== 'virtual') return;
    const t = performance.now();
    addTap(t, t);
  }, [addTap, source]);

  useEffect(() => stopLoop, [stopLoop]);

  return { run, start, cancel, tap };
}
