import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { AiLinkMonitor, type AiLinkConfig, type AiLinkSnapshot } from '../core/coach/ai/link';
import { OllamaProvider } from '../core/coach/ai/provider';
import { ollamaCandidatesForPage } from '../components/AiCoachCard';
import { useSettings } from '../store/settingsStore';

/**
 * Một bộ theo dõi kết nối AI cục bộ cho cả màn Coach (chuẩn bị → đang ghi → kết quả): kiểm tra khi mở màn, định kỳ,
 * khi có mạng lại; dừng khi app ẩn / rời màn. Chỉ GET /api/tags — không gửi dữ liệu học viên.
 */
export function useCoachAiLink(): AiLinkMonitor {
  const { aiCoachEnabled, ollamaUrl, ollamaModel } = useSettings((s) => s.settings);
  const config = useMemo<AiLinkConfig>(
    () => ({
      enabled: aiCoachEnabled,
      model: ollamaModel,
      key: `${ollamaUrl}|${ollamaModel}`,
      check: (signal) => new OllamaProvider({ candidates: () => ollamaCandidatesForPage(ollamaUrl), model: ollamaModel }).status(signal),
    }),
    [aiCoachEnabled, ollamaUrl, ollamaModel],
  );
  // Cấu hình ngay khi tạo → lần vẽ đầu đã đúng "đang kiểm tra" / "tắt" (không loé trạng thái sai).
  const [monitor] = useState(() => {
    const m = new AiLinkMonitor();
    m.configure(config);
    return m;
  });

  useEffect(() => monitor.configure(config), [monitor, config]);

  useEffect(() => {
    const onVisibility = () => monitor.setVisible(document.visibilityState !== 'hidden');
    const onOnline = () => monitor.refresh();
    onVisibility();
    monitor.start();
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('online', onOnline);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('online', onOnline);
      monitor.stop();
    };
  }, [monitor]);

  return monitor;
}

export function useAiLink(monitor: AiLinkMonitor): AiLinkSnapshot {
  return useSyncExternalStore(monitor.subscribe, monitor.getSnapshot);
}
