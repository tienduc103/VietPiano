import { create } from 'zustand';
import type { AudioInputError, AudioInputStatus } from '../core/audio/AudioInput';
import type { LivePitch } from '../core/audio/NoteRecognizer';
import { microphoneInput } from '../core/input/MicrophoneInputProvider';

interface MicStore {
  status: AudioInputStatus;
  error: AudioInputError | null;
  /** Micro bị tắt do app chạy nền → cần người dùng bấm để bật lại. */
  pausedByBackground: boolean;
  live: LivePitch | null;
  rms: number;
  setPausedByBackground: (v: boolean) => void;
}

export const useMic = create<MicStore>((set) => ({
  ...microphoneInput.status,
  pausedByBackground: false,
  live: null,
  rms: 0,
  setPausedByBackground: (pausedByBackground) => set({ pausedByBackground }),
}));

microphoneInput.statusChanges.on(({ status, error }) => {
  useMic.setState({ status, error, ...(status !== 'running' ? { live: null, rms: 0 } : {}) });
});

microphoneInput.analysis.on(({ live, rms }) => {
  const prev = useMic.getState();
  // Tránh cập nhật React khi không có gì thay đổi đáng kể.
  const same =
    prev.live?.midi === live?.midi &&
    Math.abs((prev.live?.cents ?? 0) - (live?.cents ?? 0)) < 1 &&
    Math.abs(prev.rms - rms) < 0.0005;
  if (!same) useMic.setState({ live, rms });
});

export async function toggleMicrophone(): Promise<void> {
  const { status } = useMic.getState();
  useMic.getState().setPausedByBackground(false);
  if (status === 'running' || status === 'starting') {
    await microphoneInput.stop();
  } else {
    // Lỗi đã được phản ánh qua status/error; không ném tiếp ra UI.
    await microphoneInput.start().catch(() => undefined);
  }
}
