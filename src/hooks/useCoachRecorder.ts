import { useCallback, useEffect, useRef, useState } from 'react';
import { soundOutput } from '../core/audio/SoundOutput';
import { PerformanceRecorder, type RecorderState, type SessionMeta } from '../core/coach/recorder/PerformanceRecorder';
import { coachStorage } from '../core/coach/storage/CoachStorage';
import type { RecordedSession } from '../core/coach/types';
import { microphoneInput } from '../core/input/MicrophoneInputProvider';
import { midiInput } from '../core/input/MIDIInputProvider';
import type { InputSource, NoteInputEvent } from '../core/input/NoteInputProvider';
import { virtualInput } from '../core/input/VirtualInputProvider';
import { chooseBaseC, keyToMidi } from '../core/input/keyMapping';
import { consumedByMidiNav } from './useMidiNav';

/** Lưu nháp log trong lúc ghi (khôi phục được khi app tắt giữa chừng). */
export const AUTOSAVE_MS = 3000;

export interface RecordingSetup {
  meta: SessionMeta;
  /** Nguồn được ghi: đàn MIDI và / hoặc bàn phím ảo (luôn có), micro (thử nghiệm). */
  sources: ReadonlySet<InputSource>;
  bpm: number;
  metronome: boolean;
  /** Số phách đếm vào trước khi chơi (0 = không đếm). */
  countInBeats: number;
  beatsPerMeasure: number;
  /** Phách đầu ô lệch bấy nhiêu phách so với phách 0 của bài (ô lấy đà). */
  pickup: number;
  /** Nốt của bài — chọn nốt Đô gốc cho bàn phím máy tính (như màn Luyện tập). */
  keyboardMidis?: number[];
  onNote?: (midi: number, source: InputSource) => void;
}

export interface CoachRecorderApi {
  state: RecorderState | null;
  /** Số phách đếm vào còn lại (null = không đếm). */
  countIn: number | null;
  start: (setup: RecordingSetup) => void;
  pause: () => void;
  resume: () => void;
  /** Kết thúc, lưu bản cuối, trả về log. */
  stop: () => Promise<RecordedSession | null>;
  abort: () => Promise<void>;
  /** Bàn phím ảo trên màn hình. */
  press: (midi: number) => void;
  release: (midi: number) => void;
}

const now = () => performance.now();

/**
 * Glue thành phần A (bộ ghi) với các nguồn nốt của app. Không có logic chấm. Gọi `useMidiNavListening` TRƯỚC hook này
 * để điều hướng bằng đàn MIDI nhận phím trước (phím bấm nút "Bắt đầu ghi" không thành nốt).
 */
export function useCoachRecorder(): CoachRecorderApi {
  const recRef = useRef<PerformanceRecorder | null>(null);
  const setupRef = useRef<RecordingSetup | null>(null);
  const [state, setState] = useState<RecorderState | null>(null);
  const [countIn, setCountIn] = useState<number | null>(null);
  const pedalDown = useRef(false);
  /** Mốc bắt đầu metronome (performance.now() của phách 0 sau khi đếm vào), đặt lại khi tiếp tục. */
  const clickOrigin = useRef(0);

  const save = useCallback(async (force = false) => {
    const rec = recRef.current;
    if (!rec || rec.status === 'idle') return;
    if (!force && !rec.takeDirty()) return;
    try {
      await coachStorage.saveSession(rec.snapshot());
    } catch (e) {
      console.warn('[VietPiano] Không lưu được phiên ghi', e);
    }
  }, []);

  // Theo dõi pedal + kết nối ngay cả trước khi ghi (pedal đạp sẵn lúc bắt đầu).
  useEffect(() => {
    const offPedal = midiInput.onPedal((e) => (pedalDown.current = e.down));
    let hadDevice = midiInput.hasDevice();
    const offState = midiInput.stateChanges.on((s) => {
      const has = s.status === 'ready' && s.devices.length > 0;
      const rec = recRef.current;
      if (rec?.isOpen) {
        if (hadDevice && !has) rec.disconnect(now(), s.error ?? 'Đàn MIDI ngắt kết nối');
        else if (!hadDevice && has) {
          rec.reconnect(now(), s.devices[0]?.name);
          rec.updateMeta({ input: { ...rec.snapshot().session.input, deviceName: s.devices[0]?.name } });
        }
      }
      hadDevice = has;
    });
    return () => {
      offPedal();
      offState();
    };
  }, []);

  // Nguồn nốt → bộ ghi.
  useEffect(() => {
    const accept = (src: InputSource) => {
      const rec = recRef.current;
      return !!rec?.isOpen && !!setupRef.current?.sources.has(src);
    };
    const consumed = new Set<string>();
    const onMidiNote = (e: NoteInputEvent) => {
      if (consumedByMidiNav(e)) consumed.add(`${e.midi}@${e.time}`);
    };
    const offDetail = midiInput.onDetail((d) => {
      const rec = recRef.current;
      if (!rec || !accept('midi')) return;
      if (d.type === 'note') {
        if (d.on) {
          if (consumed.delete(`${d.midi}@${d.time}`)) return;
          rec.noteOn({ midi: d.midi, time: d.time, velocity: d.velocity, channel: d.channel, raw: d.raw, port: d.portId, source: 'midi' });
          setupRef.current?.onNote?.(d.midi, 'midi');
        } else rec.noteOff({ midi: d.midi, time: d.time, channel: d.channel, raw: d.raw, port: d.portId, source: 'midi' });
      } else if (d.type === 'message' && d.accepted && d.message.type === 'controlChange') {
        rec.control({ controller: d.message.controller, value: d.message.value, channel: d.message.channel, time: d.time, port: d.portId, source: 'midi' });
      }
    });
    const offNote = midiInput.onNote(onMidiNote);
    const offVirtual = virtualInput.onNote((e) => {
      if (!accept('virtual')) return;
      recRef.current!.noteOn({ midi: e.midi, time: e.time, source: 'virtual' });
      setupRef.current?.onNote?.(e.midi, 'virtual');
    });
    const offVirtualUp = virtualInput.onNoteOff((e) => accept('virtual') && recRef.current!.noteOff({ midi: e.midi, time: e.time, source: 'virtual' }));
    const offMic = microphoneInput.onNote((e) => {
      if (!accept('microphone')) return;
      // Micro nghe cả tiếng loa (metronome / phát lại) → bỏ nốt lúc app đang phát.
      if (e.time < soundOutput.isPlayingUntil + 300) return;
      recRef.current!.noteOn({ midi: e.midi, time: e.time, source: 'microphone', ...(e.level !== undefined ? { level: e.level } : {}) });
      setupRef.current?.onNote?.(e.midi, 'microphone');
    });
    return () => {
      offDetail();
      offNote();
      offVirtual();
      offVirtualUp();
      offMic();
    };
  }, []);

  // Bàn phím máy tính (như các màn khác): hàng a s d f… từ nốt Đô gần dải nốt của bài nhất.
  const baseRef = useRef(60);
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      const baseC = baseRef.current;
      if (e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement || e.target instanceof HTMLTextAreaElement) return;
      const midi = keyToMidi(e.key, baseC);
      if (midi === null || !recRef.current?.isOpen) return;
      e.preventDefault();
      virtualInput.press(midi);
    };
    const up = (e: KeyboardEvent) => {
      const midi = keyToMidi(e.key, baseRef.current);
      if (midi !== null) virtualInput.release(midi);
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, []);

  // Lưu nháp định kỳ + khi ẩn app (và tạm dừng ghi: không ghi lúc người chơi rời app).
  useEffect(() => {
    const id = window.setInterval(() => void save(), AUTOSAVE_MS);
    const onHide = () => {
      if (document.visibilityState !== 'hidden') return;
      const rec = recRef.current;
      if (rec?.status === 'recording') rec.pause(now());
      void save(true);
    };
    const onPageHide = () => void save(true);
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', onPageHide);
    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('pagehide', onPageHide);
      // Rời màn giữa lúc ghi → tạm dừng + lưu nháp (mở lại Coach sẽ thấy phiên dở dang để chấm tiếp).
      const rec = recRef.current;
      if (rec?.status === 'recording') rec.pause(now());
      if (rec?.isOpen) void save(true);
    };
  }, [save]);

  // Metronome + đếm vào (đồng hồ khung hình; tiếng click không qua bộ ghi).
  useEffect(() => {
    if (!state || state.status !== 'recording') return;
    const setup = setupRef.current;
    if (!setup) return;
    const beatMs = 60000 / setup.bpm;
    let raf = 0;
    let last = Math.floor((now() - clickOrigin.current) / beatMs) - 1;
    const loop = () => {
      const b = Math.floor((now() - clickOrigin.current) / beatMs);
      if (b !== last) {
        last = b;
        const countBeat = b + setup.countInBeats;
        if (countBeat >= 0 && b < 0) setCountIn(-b);
        else if (b >= 0) setCountIn(null);
        if (setup.metronome || b < 0) {
          const inMeasure = (((b - setup.pickup) % setup.beatsPerMeasure) + setup.beatsPerMeasure) % setup.beatsPerMeasure;
          if (countBeat >= 0) soundOutput.click(inMeasure === 0);
        }
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [state?.status]); // eslint-disable-line react-hooks/exhaustive-deps

  const start = useCallback((setup: RecordingSetup) => {
    soundOutput.unlock();
    const rec = new PerformanceRecorder(setup.meta);
    recRef.current = rec;
    setupRef.current = setup;
    baseRef.current = chooseBaseC(setup.keyboardMidis?.length ? setup.keyboardMidis : [60]);
    rec.subscribe(setState);
    const t = now();
    rec.start(t, { pedalDown: pedalDown.current && setup.sources.has('midi') });
    clickOrigin.current = t + setup.countInBeats * (60000 / setup.bpm);
    setCountIn(setup.countInBeats > 0 ? setup.countInBeats : null);
    setState(rec.state);
    void save(true);
  }, [save]);

  const pause = useCallback(() => {
    recRef.current?.pause(now());
    void save(true);
  }, [save]);

  const resume = useCallback(() => {
    const rec = recRef.current;
    const setup = setupRef.current;
    if (!rec || !setup) return;
    rec.resume(now());
    // Metronome bắt đầu lại từ lúc tiếp tục (đếm vào một ô nếu có đếm vào).
    clickOrigin.current = now() + Math.min(setup.countInBeats, setup.beatsPerMeasure) * (60000 / setup.bpm);
  }, []);

  const stop = useCallback(async () => {
    const rec = recRef.current;
    if (!rec) return null;
    rec.stop(now());
    setCountIn(null);
    await save(true);
    return rec.snapshot();
  }, [save]);

  const abort = useCallback(async () => {
    const rec = recRef.current;
    if (!rec) return;
    rec.abort(now(), 'Người dùng huỷ');
    setCountIn(null);
    await save(true);
    recRef.current = null;
    setState(null);
  }, [save]);

  return { state, countIn, start, pause, resume, stop, abort, press: (m) => virtualInput.press(m), release: (m) => virtualInput.release(m) };
}
