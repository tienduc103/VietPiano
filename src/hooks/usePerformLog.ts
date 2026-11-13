/**
 * Nhật ký Biểu diễn — TẠM THỜI (docs/perform-log.md). Glue React:
 *  - `usePerformLog`: ghi từng lượt của một PerformanceTracker (màn Luyện tập chế độ Biểu diễn, bài Biểu diễn của
 *    giáo trình). Lượt bắt đầu khi đồng hồ chạy (bấm Bắt đầu / Chạy tiếp), kết thúc khi hết bài, chơi lại hoặc rời
 *    màn / đổi chế độ (bỏ dở mà chưa có nốt nào thì không ghi). Nghe RIÊNG cả 3 nguồn nốt → thấy cả nốt bị lọc trước
 *    khi tới màn; màn báo kết quả chấm qua `grade` và lý do bỏ nốt qua `dropped`.
 *  - `usePerformLogVisits`: ghi "máy truy cập" khi mở app / đổi người chơi.
 * Không chạm luồng chấm: chỉ đọc trạng thái tracker, lỗi ghi log không ảnh hưởng bài.
 */
import { useCallback, useEffect, useRef } from 'react';
import { soundOutput } from '../core/audio/SoundOutput';
import { microphoneInput } from '../core/input/MicrophoneInputProvider';
import { midiInput } from '../core/input/MIDIInputProvider';
import type { NoteInputEvent, NoteOffEvent } from '../core/input/NoteInputProvider';
import { acceptSource } from '../core/input/sourceFilter';
import { virtualInput } from '../core/input/VirtualInputProvider';
import { lessonTempo, type Lesson } from '../core/lessons/types';
import { performLog, performLogSettings } from '../core/performLog';
import { deviceEnv, playerOf } from '../core/performLog/env';
import { newLogId } from '../core/performLog/queue';
import { PerformLogSession, type EntryMeta, type SessionNote } from '../core/performLog/session';
import { PERFORM_LOG_SCHEMA, type LogMidiDevice, type PerformEntry, type PerformSetup, type VisitEntry } from '../core/performLog/types';
import { scorePerformanceState, type PerformanceOutcome, type PerformanceState, type PerformanceTracker } from '../core/practice/PerformanceTracker';
import { voiceTeacher } from '../core/voice/teacher';
import { useMic } from '../store/micStore';
import { useMidi } from '../store/midiStore';
import { activeProfile, useProfiles } from '../store/profileStore';
import { useSettings } from '../store/settingsStore';
import { consumedByMidiNav } from './useMidiNav';

/** Cùng `useNoteInput`: nốt micro ngay sau tiếng đàn mẫu bị bỏ — chỉ để đoán lý do nốt không tới bộ chấm. */
const PLAYBACK_GUARD_MS = 300;

export interface PerformLogInfo {
  hand: 'both' | 'right' | 'left';
  scored: boolean;
  singleNotesOnly: boolean;
  /** Bù trễ micro màn đang dùng (ms). */
  micLatencyMs: number;
  metronome: boolean;
  pedalScored: boolean;
  pedalInput: boolean;
  /** % nhịp độ (màn Luyện tập); null = không áp dụng. */
  tempoPercent: number | null;
}

export interface PerformLogHandle {
  /** Chấm nốt: `run` = `tracker.handleNoteOn(…)`; ghi kết quả + nốt được chấm. Trả lại kết quả của `run`. */
  grade: (e: NoteInputEvent, scoredTime: number, run: () => PerformanceOutcome) => PerformanceOutcome;
  /** Màn bỏ nốt trước khi chấm (tay kia, phần đệm, nốt hoà âm không chấm…). */
  dropped: (e: NoteInputEvent, reason: string) => void;
}

function entryMeta(): EntryMeta {
  const s = performLogSettings.get();
  return {
    id: newLogId(),
    at: new Date().toISOString(),
    app: __APP_VERSION__,
    device: { id: s.deviceId, name: s.deviceName },
    player: playerOf(activeProfile(useProfiles.getState())),
    env: deviceEnv(),
  };
}

function lessonInfo(lesson: Lesson): PerformEntry['lesson'] {
  return {
    id: lesson.id,
    title: lesson.title,
    ...(lesson.slice ? { slice: [lesson.slice.from, lesson.slice.to] as [number, number] } : {}),
    timeSignature: [lesson.timeSignature[0], lesson.timeSignature[1]],
    pickup: lesson.pickup ?? 0,
    tempo: lessonTempo(lesson),
  };
}

/** Độ trễ đầu ra âm thanh (nếu bản SoundOutput có báo) — tiếng metronome tới tai muộn chừng này. */
function outputLatencyMs(): number | null {
  try {
    return (soundOutput as unknown as { outputLatencyMs?: () => number | null }).outputLatencyMs?.() ?? null;
  } catch {
    return null;
  }
}

function setupOf(tracker: PerformanceTracker, info: PerformLogInfo): PerformSetup {
  const settings = useSettings.getState().settings;
  const mic = useMic.getState();
  const midi = useMidi.getState();
  const cfg = tracker.getConfig();
  const devices: LogMidiDevice[] = midi.ports
    .filter((p) => p.connected)
    .map((p) => ({
      name: p.name,
      manufacturer: p.manufacturer,
      transport: p.transport,
      enabled: p.config.enabled,
      transpose: p.config.transpose,
      octave: p.config.octave,
      channel: p.config.channel,
      keyCount: p.config.keyCount,
      lowestNote: p.config.lowestNote,
      limitToRange: p.config.limitToRange,
    }));
  return {
    hand: info.hand,
    scored: info.scored,
    bpm: cfg.bpm,
    tempoPercent: info.tempoPercent,
    countInBeats: cfg.countInBeats,
    checkPitch: cfg.checkPitch,
    octaveTolerant: cfg.octaveTolerant,
    maxWindowBeats: cfg.maxWindowBeats,
    onTimeMs: cfg.onTimeMs,
    minOnsetIntervalMs: cfg.minOnsetIntervalMs,
    debounceSamePitch: !!cfg.debounceSamePitch,
    singleNotesOnly: info.singleNotesOnly,
    micLatencyMs: info.micLatencyMs,
    metronome: info.metronome,
    pedalScored: info.pedalScored,
    pedalInput: info.pedalInput,
    inputSource: settings.inputSource,
    mic: { status: mic.status, fallback: mic.fallback },
    midi: { status: midi.status, devices },
    recognizer: { a4: settings.a4, noiseGate: settings.noiseGate, minConfidence: settings.minConfidence, stableMs: settings.stableMs, onsetRatio: settings.onsetRatio },
    outputLatencyMs: outputLatencyMs(),
  };
}

/** Lý do đoán khi nốt không tới bộ chấm mà màn không báo (bộ lọc chung `useNoteInput` của giáo trình). */
function guessWhy(e: NoteInputEvent): string | undefined {
  const midiConnected = midiInput.hasDevice();
  if (e.source === 'microphone' && midiConnected) return 'mic-while-midi';
  if (!acceptSource(e.source, useSettings.getState().settings.inputSource, midiConnected)) return 'source-setting';
  if (e.source === 'midi' && consumedByMidiNav(e)) return 'midi-nav';
  if (e.source === 'microphone' && e.time < soundOutput.isPlayingUntil + PLAYBACK_GUARD_MS) return 'playback';
  if (e.source === 'microphone' && voiceTeacher.blocksMic(e.time)) return 'voice';
  return undefined;
}

const isRunning = (s: PerformanceState) => s.status === 'running' || s.status === 'countIn';

export function usePerformLog(opts: {
  tracker: PerformanceTracker;
  /** false = không ghi (không ở chế độ này / không có bài để chấm). */
  enabled: boolean;
  screen: PerformEntry['screen'];
  /** Đúng danh sách nốt đã đưa cho tracker (+ tên nốt, tay, ô nhịp nếu có). */
  notes: readonly SessionNote[];
  lesson: Lesson;
  /** Đọc lúc bắt đầu lượt. */
  info: () => PerformLogInfo;
}): PerformLogHandle {
  const { tracker, enabled, screen, notes, lesson } = opts;
  const infoRef = useRef(opts.info);
  infoRef.current = opts.info;
  const sessionRef = useRef<PerformLogSession | null>(null);
  const micLatencyRef = useRef(0);

  useEffect(() => {
    if (!enabled) return;
    let session: PerformLogSession | null = null;
    const setSession = (s: PerformLogSession | null) => {
      session = s;
      sessionRef.current = s;
    };
    let prev = tracker.getState();
    let bpm = tracker.bpm;

    const begin = (now: number, s: PerformanceState) => {
      if (!performLogSettings.get().enabled) return;
      const info = infoRef.current();
      micLatencyRef.current = info.micLatencyMs;
      try {
        setSession(new PerformLogSession({ screen, notes, lesson: lessonInfo(lesson), setup: setupOf(tracker, info), startTime: now }));
        session!.mark('start', now, s.beat, tracker.bpm);
        bpm = tracker.bpm;
      } catch {
        setSession(null);
      }
    };
    /** `state` = trạng thái để chấm (chơi lại: trạng thái NGAY TRƯỚC khi tracker xoá). */
    const end = (kind: PerformEntry['end'], now: number, state: PerformanceState, fromCurrent: boolean) => {
      const s = session;
      setSession(null);
      if (!s || (kind !== 'finished' && s.inputCount === 0)) return;
      try {
        const cfg = tracker.getConfig();
        // Tracker đã xoá kết quả khi chơi lại → chấm lại từ trạng thái cũ (không có pedal).
        const result = fromCurrent ? tracker.result() : scorePerformanceState(notes, state, cfg.onTimeMs, (cfg.maxWindowBeats * 60000) / cfg.bpm);
        s.mark('end', now, state.beat);
        void performLog.record(s.build(kind, now, state, result, cfg, entryMeta()));
      } catch {
        // Lỗi dựng log không được ảnh hưởng bài.
      }
    };

    const offState = tracker.subscribe((s) => {
      const now = performance.now();
      const was = prev;
      prev = s;
      if (session && tracker.bpm !== bpm) {
        bpm = tracker.bpm;
        session.mark('bpm', now, s.beat, bpm);
      }
      if (s.status === was.status) return;
      if (isRunning(s)) {
        if (!session) begin(now, s);
        else if (was.status === 'paused') session.mark('resume', now, s.beat, tracker.bpm);
      } else if (s.status === 'paused') session?.mark('pause', now, s.beat);
      else if (s.status === 'finished') end('finished', now, s, true);
      else if (s.status === 'idle') end('restart', now, was, false);
    });

    const scoredBeat = (e: { time: number; source: NoteInputEvent['source'] }) => tracker.beatAt(e.source === 'microphone' ? e.time - micLatencyRef.current : e.time);
    const active = () => (session && isRunning(tracker.getState()) ? session : null);
    const onNote = (e: NoteInputEvent) => active()?.input(e, performance.now(), scoredBeat(e), guessWhy(e));
    const onOff = (e: NoteOffEvent) => active()?.noteOff(e);
    const offs = [
      microphoneInput.onNote(onNote),
      midiInput.onNote(onNote),
      virtualInput.onNote(onNote),
      midiInput.onNoteOff(onOff),
      virtualInput.onNoteOff(onOff),
      midiInput.onPedal((p) => active()?.pedal(p.down, p.time)),
      microphoneInput.analysis.on((a) => active()?.pitchFrame(a.time, a.live, a.rms, !!a.noteOn)),
    ];

    // Ẩn app / đóng trang giữa lượt (iPad có thể tắt hẳn app sau đó) → lưu ngay phần đã chơi; chạy tiếp thì thành lượt mới.
    const onHide = () => {
      if (session && session.inputCount > 0) end('left', performance.now(), tracker.getState(), true);
    };
    const onVisibility = () => document.visibilityState === 'hidden' && onHide();
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', onHide);

    return () => {
      offState();
      offs.forEach((off) => off());
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', onHide);
      if (session) end('left', performance.now(), tracker.getState(), true);
    };
  }, [tracker, enabled, screen, notes, lesson]);

  const grade = useCallback(
    (e: NoteInputEvent, scoredTime: number, run: () => PerformanceOutcome) => {
      const s = sessionRef.current;
      if (!s) return run();
      const before = tracker.getState();
      const out = run();
      try {
        s.graded(e, out, performance.now(), tracker.beatAt(scoredTime), before, tracker.getState());
      } catch {
        // bỏ qua
      }
      return out;
    },
    [tracker],
  );

  const dropped = useCallback(
    (e: NoteInputEvent, reason: string) => {
      const s = sessionRef.current;
      if (!s || !isRunning(tracker.getState())) return;
      s.dropped(e, reason, performance.now(), tracker.beatAt(e.source === 'microphone' ? e.time - micLatencyRef.current : e.time));
    },
    [tracker],
  );

  return { grade, dropped };
}

let lastVisitPlayer: string | null | undefined;

/** "Máy truy cập": một bản khi mở app + mỗi lần đổi người chơi; gửi luôn các bản còn chờ (lượt Biểu diễn lần trước). */
export function usePerformLogVisits(): void {
  const activeId = useProfiles((s) => s.activeId);
  useEffect(() => {
    // StrictMode chạy effect hai lần → nhớ ở module.
    if (lastVisitPlayer === activeId) return;
    const reason: VisitEntry['reason'] = lastVisitPlayer === undefined ? 'open' : 'player';
    lastVisitPlayer = activeId;
    try {
      void performLog.record({ v: PERFORM_LOG_SCHEMA, type: 'visit', reason, ...entryMeta() });
    } catch {
      // bỏ qua
    }
  }, [activeId]);
}
