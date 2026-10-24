import { useEffect } from 'react';
import { microphoneInput } from '../core/input/MicrophoneInputProvider';
import { midiInput } from '../core/input/MIDIInputProvider';
import { useMic } from '../store/micStore';
import { useSettings } from '../store/settingsStore';

/**
 * Xử lý khi iPad đưa app vào nền / tắt màn hình:
 * giải phóng micro ngay (tắt chấm cam, tránh iOS giữ AudioContext treo),
 * khi quay lại thì hiện nút để người dùng bật lại (Safari cần thao tác người dùng).
 */
export function useAppLifecycle(): void {
  useEffect(() => {
    const onHidden = () => {
      const { status } = useMic.getState();
      if (status === 'running' || status === 'starting' || status === 'suspended') {
        useMic.getState().setPausedByBackground(true);
        void microphoneInput.stop();
      }
    };
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') onHidden();
    };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', onHidden);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', onHidden);
      void microphoneInput.stop();
    };
  }, []);
}

/**
 * Kết nối đàn MIDI theo cài đặt. Khác micro: MIDI không ghi âm nên giữ kết nối cả khi app vào nền,
 * và Web MIDI không cần thao tác người dùng → tự kết nối lại khi mở app.
 */
export function useMidiConnection(): void {
  const enabled = useSettings((s) => s.settings.midiEnabled);
  useEffect(() => {
    if (!enabled) return;
    void midiInput.start();
    return () => void midiInput.stop();
  }, [enabled]);
}

/** Áp dụng giao diện sáng/tối theo cài đặt hoặc theo hệ thống. */
export function useTheme(): void {
  const theme = useSettings((s) => s.settings.theme);
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      const dark = theme === 'dark' || (theme === 'system' && mq.matches);
      document.documentElement.classList.toggle('dark', dark);
      document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#0f172a' : '#7c3aed');
    };
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, [theme]);
}

/** Giữ màn hình sáng khi đang luyện tập (Screen Wake Lock, Safari 16.4+). */
export function useWakeLock(enabled: boolean): void {
  useEffect(() => {
    if (!enabled || !('wakeLock' in navigator)) return;
    let sentinel: WakeLockSentinel | null = null;
    let cancelled = false;
    const acquire = async () => {
      try {
        if (document.visibilityState !== 'visible') return;
        sentinel = await navigator.wakeLock.request('screen');
        if (cancelled) void sentinel.release();
      } catch {
        // Không hỗ trợ hoặc bị từ chối (vd chế độ tiết kiệm pin): bỏ qua.
      }
    };
    const onVisibility = () => {
      if (document.visibilityState === 'visible') void acquire();
    };
    void acquire();
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisibility);
      void sentinel?.release().catch(() => undefined);
    };
  }, [enabled]);
}
