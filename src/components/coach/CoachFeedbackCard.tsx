import { useEffect, useMemo, useRef, useState } from 'react';
import { ruleBasedFeedback } from '../../core/coach/ai/fallback';
import type { CoachAiPayload } from '../../core/coach/ai/payload';
import type { CoachAudience } from '../../core/coach/ai/prompt';
import { OllamaProvider } from '../../core/coach/ai/provider';
import { requestCoachFeedback } from '../../core/coach/ai/teacher';
import { newId } from '../../core/coach/storage/CoachStorage';
import type { AIFeedback, ScoringResult } from '../../core/coach/types';
import { useSettings } from '../../store/settingsStore';
import { ollamaConnectHint } from '../../core/feedback/OllamaClient';
import { ollamaCandidatesForPage } from '../AiCoachCard';
import { Button, Icon } from '../ui';

interface Props {
  result: ScoringResult;
  payload: CoachAiPayload;
  audience: CoachAudience;
  timeoutSec: number;
  retries: number;
  /** Nhận xét đã lưu của lần chấm này (mở lại từ lịch sử) — có thì không gọi AI lại. */
  saved?: AIFeedback | null;
  onFeedback?: (fb: AIFeedback) => void;
  onPractice?: (measures: [number, number], bpm: number | null) => void;
}

type Phase = 'rules' | 'loading' | 'ai' | 'error';

/**
 * Nhận xét sau khi chấm. Luôn hiện ngay nhận xét theo quy tắc; bật AI cục bộ (Cài đặt → AI) thì gọi Ollama (timeout + thử lại có giới hạn)
 * và thay bằng câu trả lời đã xác minh. Lỗi AI chỉ hiện trong thẻ, không chặn kết quả chấm. Điểm số luôn là của thuật toán.
 */
export function CoachFeedbackCard({ result, payload, audience, timeoutSec, retries, saved, onFeedback, onPractice }: Props) {
  const { aiCoachEnabled, ollamaUrl, ollamaModel } = useSettings((s) => s.settings);
  const rules = useMemo(() => ruleBasedFeedback(result, payload, audience), [result, payload, audience]);
  const [fb, setFb] = useState<AIFeedback | null>(saved ?? null);
  const [phase, setPhase] = useState<Phase>(saved ? (saved.source === 'ai' ? 'ai' : 'rules') : 'rules');
  const [run, setRun] = useState(0);
  const onFeedbackRef = useRef(onFeedback);
  onFeedbackRef.current = onFeedback;

  useEffect(() => {
    if (saved && run === 0) return;
    const ctrl = new AbortController();
    const provider = aiCoachEnabled ? new OllamaProvider({ candidates: () => ollamaCandidatesForPage(ollamaUrl), model: ollamaModel }) : null;
    setPhase(provider ? 'loading' : 'rules');
    void requestCoachFeedback({ provider, payload, result, audience, timeoutMs: timeoutSec * 1000, retries, signal: ctrl.signal, id: newId('fb') }).then((out) => {
      if (ctrl.signal.aborted) return;
      setFb(out);
      setPhase(out.source === 'ai' ? 'ai' : provider ? 'error' : 'rules');
      onFeedbackRef.current?.(out);
    });
    return () => ctrl.abort();
  }, [aiCoachEnabled, ollamaUrl, ollamaModel, payload, result, audience, timeoutSec, retries, run, saved]);

  const content = fb?.content ?? rules;
  const kids = audience === 'kids';
  return (
    <section className="rounded-2xl bg-gradient-to-br from-violet-50 to-fuchsia-50 p-4 ring-1 ring-violet-200 dark:from-slate-700/60 dark:to-slate-700/30 dark:ring-violet-800" data-testid="coach-feedback" data-source={fb?.source ?? 'rules'}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-semibold">{kids ? '🎹 Cô giáo nhận xét' : '🤖 Nhận xét của AI Piano Coach'}</h3>
        <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
          <span data-testid="coach-feedback-status">
            {phase === 'loading' ? 'AI đang viết… (đang hiện nhận xét theo quy tắc)' : phase === 'ai' ? `AI cục bộ · ${fb?.model ?? ollamaModel}${fb?.verification.ok === false ? ' · đã lọc câu không khớp số liệu' : ''}` : phase === 'error' ? 'AI lỗi — đang hiện nhận xét theo quy tắc' : aiCoachEnabled ? 'Nhận xét theo quy tắc' : 'Nhận xét theo quy tắc (AI đang tắt ở Cài đặt)'}
          </span>
          {aiCoachEnabled && (
            <Button variant="ghost" className="min-h-10 px-3 text-sm" onClick={() => setRun((r) => r + 1)} disabled={phase === 'loading'} aria-label="Viết lại nhận xét">
              <Icon name="restart" className="h-5 w-5" /> Viết lại
            </Button>
          )}
        </div>
      </div>
      {phase === 'error' && fb?.error && (
        <p className="mt-1 text-sm text-amber-700 dark:text-amber-300" role="alert" data-testid="coach-feedback-error">
          {fb.error}. {/kết nối/i.test(fb.error) ? ollamaConnectHint(location.origin) : 'Kiểm tra Ollama đang chạy hoặc chọn model khác ở Cài đặt → AI.'}
        </p>
      )}
      <p className={`mt-2 ${kids ? 'text-lg' : ''}`} data-testid="coach-feedback-summary" aria-live="polite">
        {content.summary}
      </p>
      {content.strengths.length > 0 && (
        <div className="mt-3">
          <div className="text-sm font-semibold text-emerald-700 dark:text-emerald-300">Làm tốt</div>
          <ul className="mt-1 list-disc pl-5 text-sm">
            {content.strengths.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ul>
        </div>
      )}
      {content.priorities.length > 0 && (
        <div className="mt-3">
          <div className="text-sm font-semibold text-rose-700 dark:text-rose-300">Cần ưu tiên sửa</div>
          <ol className="mt-1 grid gap-2 text-sm" data-testid="coach-priorities">
            {content.priorities.map((p, i) => (
              <li key={i} className="rounded-xl bg-white/70 p-2 dark:bg-slate-800/60">
                <div className="font-semibold">
                  {i + 1}. {p.title}
                </div>
                <div className="text-slate-600 dark:text-slate-300">{p.explanation}</div>
                <div className="mt-0.5">💡 {p.fix}</div>
              </li>
            ))}
          </ol>
        </div>
      )}
      <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
        {content.practiceSection && (
          <Button variant="secondary" className="min-h-10 text-sm" onClick={() => onPractice?.([content.practiceSection!.fromMeasure, content.practiceSection!.toMeasure], content.practiceTempo ?? null)} data-testid="coach-feedback-practice">
            <Icon name="brackets" className="h-5 w-5" />
            Luyện ô {content.practiceSection.fromMeasure === content.practiceSection.toMeasure ? content.practiceSection.fromMeasure : `${content.practiceSection.fromMeasure}–${content.practiceSection.toMeasure}`}
            {content.practiceTempo ? ` ở ♩=${content.practiceTempo}` : ''}
          </Button>
        )}
        {content.nextExercise && <span className="text-slate-600 dark:text-slate-300">Bài tiếp theo: {content.nextExercise.text}</span>}
      </div>
      {content.comparison && <p className="mt-2 text-sm">📈 {content.comparison}</p>}
      <details className="mt-3 text-xs text-slate-500 dark:text-slate-400">
        <summary className="cursor-pointer select-none">Xem dữ liệu gửi cho AI (chỉ số liệu tóm tắt, không có âm thanh / log MIDI)</summary>
        <pre className="mt-1 max-h-48 overflow-auto rounded-lg bg-white/70 p-2 whitespace-pre-wrap dark:bg-slate-900/60" data-testid="coach-ai-payload">
          {JSON.stringify(payload, null, 1)}
        </pre>
        {fb?.verification && fb.verification.removed.length > 0 && <p className="mt-1">Đã bỏ {fb.verification.removed.length} câu AI viết không khớp số liệu.</p>}
      </details>
    </section>
  );
}
