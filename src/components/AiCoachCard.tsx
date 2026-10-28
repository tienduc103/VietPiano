import { useEffect, useMemo, useState } from 'react';
import { buildCoachMessages, type CoachReport } from '../core/feedback/coachPrompt';
import { OllamaError, streamChat } from '../core/feedback/OllamaClient';
import type { UiMode } from '../core/curriculum/types';
import { activeProfile, useProfiles } from '../store/profileStore';
import { useSettings } from '../store/settingsStore';
import { Button, Icon } from './ui';

type Status = 'loading' | 'done' | 'error';

/**
 * Nhận xét của "thầy AI" (Ollama cục bộ) sau mỗi bài. Chỉ hiện khi bật ở Cài đặt;
 * tự viết khi mở, chữ hiện dần theo stream. Lỗi không chặn luồng học.
 */
export function AiCoachCard({ report, mode }: { report: CoachReport; mode: UiMode }) {
  const { aiCoachEnabled, ollamaUrl, ollamaModel } = useSettings((s) => s.settings);
  const profile = useProfiles(activeProfile);
  const [run, setRun] = useState(0);
  const [textOut, setTextOut] = useState('');
  const [status, setStatus] = useState<Status>('loading');
  const [error, setError] = useState<OllamaError | null>(null);

  // Báo cáo mới tạo mỗi lần render → so theo nội dung để không gọi lại AI vô ích.
  const reportKey = JSON.stringify(report);
  const messages = useMemo(
    () => buildCoachMessages(JSON.parse(reportKey) as CoachReport, profile && { name: profile.name, age: profile.age, experience: profile.experience }, mode),
    [reportKey, profile, mode],
  );

  useEffect(() => {
    if (!aiCoachEnabled) return;
    const ctrl = new AbortController();
    setTextOut('');
    setError(null);
    setStatus('loading');
    streamChat({ baseUrl: ollamaUrl, model: ollamaModel, messages, signal: ctrl.signal, onToken: (t) => setTextOut((s) => s + t) })
      .then(() => setStatus('done'))
      .catch((e: unknown) => {
        if (e instanceof OllamaError && e.kind === 'aborted') return;
        setError(e instanceof OllamaError ? e : new OllamaError(String(e), 'http'));
        setStatus('error');
      });
    return () => ctrl.abort();
  }, [aiCoachEnabled, ollamaUrl, ollamaModel, messages, run]);

  if (!aiCoachEnabled) return null;
  const kids = mode === 'kids';

  return (
    <div className="rounded-2xl bg-gradient-to-br from-violet-50 to-fuchsia-50 p-4 ring-1 ring-violet-200 dark:from-slate-700/60 dark:to-slate-700/30 dark:ring-violet-800" data-testid="ai-coach">
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-semibold">{kids ? '🎹 Cô giáo AI nhận xét' : '🤖 Nhận xét của AI'}</h3>
        <Button variant="ghost" className="min-h-10 px-3 text-sm" onClick={() => setRun((r) => r + 1)} disabled={status === 'loading'} aria-label="Viết lại nhận xét">
          <Icon name="restart" className="h-5 w-5" /> Viết lại
        </Button>
      </div>
      {status === 'error' && error ? (
        <div className="mt-2 text-sm text-amber-700 dark:text-amber-300" role="alert" data-testid="ai-coach-error">
          <p>{error.kind === 'network' ? `Không kết nối được Ollama ở ${ollamaUrl}.` : `Ollama báo lỗi: ${error.message}`}</p>
          <p className="mt-1 text-slate-500 dark:text-slate-400">
            {error.kind === 'network'
              ? 'Kiểm tra Ollama đang chạy (biểu tượng ở khay hệ thống, hoặc lệnh "ollama serve"). Nếu mở app từ tên miền khác localhost, đặt biến môi trường OLLAMA_ORIGINS.'
              : `Tải model bằng lệnh "ollama pull ${ollamaModel}" hoặc chọn model khác ở Cài đặt.`}
          </p>
        </div>
      ) : (
        <p className={`mt-2 whitespace-pre-line ${kids ? 'text-lg' : ''}`} aria-live="polite" data-testid="ai-coach-text">
          {textOut || <span className="animate-pulse text-slate-500 dark:text-slate-400">Đang viết nhận xét…</span>}
        </p>
      )}
    </div>
  );
}
