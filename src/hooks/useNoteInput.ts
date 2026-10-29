import { useEffect, useRef } from 'react';
import type { NoteInputEvent, NoteOffEvent } from '../core/input/NoteInputProvider';
import { microphoneInput } from '../core/input/MicrophoneInputProvider';
import { midiInput } from '../core/input/MIDIInputProvider';
import { virtualInput } from '../core/input/VirtualInputProvider';
import { chooseBaseC, keyToMidi } from '../core/input/keyMapping';
import { soundOutput } from '../core/audio/SoundOutput';
import type { InputSourceSetting } from '../core/settings/DeviceSettings';
import { acceptSource } from '../core/input/sourceFilter';

/** Bỏ nốt micro thêm chừng này sau khi tiếng đàn mẫu tắt (âm ngân của loa). */
const PLAYBACK_GUARD_MS = 300;

export interface NoteInputHandlers {
  onNote: (e: NoteInputEvent) => void;
  onNoteOff?: (e: NoteOffEvent) => void;
}

/**
 * Nối micro + đàn MIDI + bàn phím ảo (+ bàn phím máy tính) vào một bộ xử lý, dùng chung cho mọi bài tập
 * giáo trình. Nốt micro trong lúc app đang phát mẫu bị bỏ (micro nghe thấy loa).
 */
export function useNoteInput(
  handlers: NoteInputHandlers,
  setting: InputSourceSetting,
  opts: { computerKeys?: boolean; baseMidi?: number; playbackGuard?: boolean } = {},
): void {
  const ref = useRef(handlers);
  ref.current = handlers;
  const settingRef = useRef(setting);
  settingRef.current = setting;
  // false: màn tự lọc tiếng loa (trò Săn nốt so cao độ với nốt app đang phát thay vì bỏ hết nốt micro).
  const guardRef = useRef(opts.playbackGuard ?? true);
  guardRef.current = opts.playbackGuard ?? true;

  useEffect(() => {
    microphoneInput.resetRecognizer();
    const onNote = (e: NoteInputEvent) => {
      if (!acceptSource(e.source, settingRef.current, midiInput.hasDevice())) return;
      if (guardRef.current && e.source === 'microphone' && e.time < soundOutput.isPlayingUntil + PLAYBACK_GUARD_MS) return;
      ref.current.onNote(e);
    };
    const onOff = (e: NoteOffEvent) => {
      if (!acceptSource(e.source, settingRef.current, midiInput.hasDevice())) return;
      ref.current.onNoteOff?.(e);
    };
    const offs = [microphoneInput.onNote(onNote), midiInput.onNote(onNote), virtualInput.onNote(onNote), midiInput.onNoteOff(onOff), virtualInput.onNoteOff(onOff)];
    return () => offs.forEach((off) => off());
  }, []);

  // Bàn phím máy tính (demo trên Windows): như màn Luyện tập — hàng phím a s d f… từ nốt Đô gần nhất.
  const { computerKeys = true, baseMidi = 60 } = opts;
  useEffect(() => {
    if (!computerKeys) return;
    const baseC = chooseBaseC([baseMidi]);
    const down = (e: KeyboardEvent) => {
      if (e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
      const midi = keyToMidi(e.key, baseC);
      if (midi === null) return;
      e.preventDefault();
      virtualInput.press(midi);
    };
    const up = (e: KeyboardEvent) => {
      const midi = keyToMidi(e.key, baseC);
      if (midi !== null) virtualInput.release(midi);
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, [computerKeys, baseMidi]);
}
