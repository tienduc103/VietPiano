import { useEffect, useMemo, useRef, useSyncExternalStore, type PointerEvent as ReactPointerEvent } from 'react';
import type { UiMode } from '../core/curriculum/types';
import { phrases } from '../core/voice/phrases';
import { DEFAULT_WAIT_COACH, type WaitCoachOptions } from '../core/voice/WaitVoiceCoach';
import { voiceTeacher } from '../core/voice/teacher';
import type { VoiceCue } from '../core/voice/types';
import type { VoiceTeacherState } from '../core/voice/VoiceTeacher';
import { useSettings } from '../store/settingsStore';
import { useUiMode } from './useUiMode';

/** Cô giáo giọng nói có chạy ở giao diện này không (mặc định: chỉ Kids Mode — bé chưa biết đọc). */
export function useVoiceActive(mode?: UiMode): boolean {
  const setting = useSettings((s) => s.settings.voiceTeacher);
  const resolved = useUiMode();
  return setting === 'always' || (setting === 'kids' && (mode ?? resolved) === 'kids');
}

export function useVoiceState(): VoiceTeacherState {
  return useSyncExternalStore(
    (cb) => voiceTeacher.subscribe(cb),
    () => voiceTeacher.getState(),
  );
}

/** Tuỳ chọn của bộ hướng dẫn Wait Mode theo cài đặt phụ huynh. */
export function useWaitCoachOptions(): WaitCoachOptions {
  const autoRead = useSettings((x) => x.settings.voiceAutoRead);
  const encourage = useSettings((x) => x.settings.voiceEncourage);
  const remindSec = useSettings((x) => x.settings.voiceRemindSec);
  return useMemo(() => ({ ...DEFAULT_WAIT_COACH, autoRead, encourage, remindAfterMs: remindSec * 1000 }), [autoRead, encourage, remindSec]);
}

/**
 * Đọc một câu khi màn / trang hiện ra (`key` đổi = câu mới). `autoRead` tắt thì chỉ hiện chữ để bấm "Nghe lại".
 * `encouragement`: câu khen / chúc mừng — theo cài đặt "Động viên".
 */
export function useVoiceCue(cue: VoiceCue | null, key: unknown, mode?: UiMode, kind: 'instruction' | 'encouragement' = 'instruction'): void {
  const active = useVoiceActive(mode);
  const autoRead = useSettings((s) => s.settings.voiceAutoRead);
  const encourage = useSettings((s) => s.settings.voiceEncourage);
  const allowed = kind === 'instruction' ? autoRead : encourage;
  useEffect(() => {
    if (!active || !cue || !allowed) return;
    voiceTeacher.say(cue);
    // `cue` dựng lại mỗi lần render; câu mới chỉ khi `key` đổi.
  }, [active, allowed, key]);
}

/** Rời màn / bước học (unmount) → huỷ lời đọc cũ + hẹn giờ. Cleanup chạy trước effect của màn mới nên câu mới không bị huỷ. */
export function useVoiceScope(): void {
  useEffect(() => () => voiceTeacher.cancelAll(), []);
}

/** Chuột dừng trên đáp án chừng này mới đọc: lướt qua nhiều nút thì không đọc từng nút. */
const HOVER_READ_DELAY_MS = 150;

/**
 * Di chuột vào đáp án → cô đọc đáp án đó. Trả về hàm dựng props cho nút; `key` đổi = đáp án khác (đọc lại).
 * Dùng `pointermove` thay `pointerenter`: sang câu mới mà chuột vẫn nằm trên nút thì nhích chuột là đọc.
 * Chạm (iPad) không có di chuột → bỏ qua, chạm là chọn luôn. Tắt khi cô không chạy ở giao diện này.
 */
export function useHoverRead(mode?: UiMode) {
  const active = useVoiceActive(mode);
  const timer = useRef<number | null>(null);
  const readKey = useRef<string | null>(null);
  const clear = () => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = null;
  };
  useEffect(() => clear, []);
  return (key: string, option: string, enabled = true) => {
    if (!active) return {};
    return {
      onPointerMove: (e: ReactPointerEvent) => {
        if (!enabled || e.pointerType === 'touch' || readKey.current === key) return;
        readKey.current = key;
        clear();
        timer.current = window.setTimeout(() => voiceTeacher.say(phrases.optionHover(option)), HOVER_READ_DELAY_MS);
      },
      onPointerLeave: () => {
        readKey.current = null;
        clear();
      },
      onPointerDown: clear,
    };
  };
}

/** Một lần ở App: bật/tắt tiếng theo cài đặt, mở khoá âm thanh ở lần chạm đầu, vào nền thì im. */
export function useVoiceTeacherLifecycle(): void {
  const muted = useSettings((s) => s.settings.voiceMuted);
  const off = useSettings((s) => s.settings.voiceTeacher === 'off');
  useEffect(() => voiceTeacher.setConfig({ enabled: !muted && !off }), [muted, off]);

  useEffect(() => {
    // Safari / iPad chỉ cho phát tiếng sau một thao tác người dùng.
    const unlock = () => {
      voiceTeacher.unlock();
      window.removeEventListener('pointerdown', unlock, true);
      window.removeEventListener('keydown', unlock, true);
    };
    window.addEventListener('pointerdown', unlock, true);
    window.addEventListener('keydown', unlock, true);
    const onHidden = () => {
      if (document.visibilityState === 'hidden') voiceTeacher.interrupt();
    };
    document.addEventListener('visibilitychange', onHidden);
    return () => {
      window.removeEventListener('pointerdown', unlock, true);
      window.removeEventListener('keydown', unlock, true);
      document.removeEventListener('visibilitychange', onHidden);
    };
  }, []);
}
