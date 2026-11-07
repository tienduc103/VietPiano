import { AI_LINK_PRIVACY, aiLinkView, type AiLinkMonitor, type AiLinkTone } from '../../core/coach/ai/link';
import { useAiLink } from '../../hooks/useCoachAiLink';

/** Màu theo trạng thái — luôn đi kèm ký hiệu + chữ, không dùng riêng màu. */
export const AI_LINK_TONE: Record<AiLinkTone, string> = {
  ok: 'bg-emerald-50 text-emerald-800 ring-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-200 dark:ring-emerald-800',
  warn: 'bg-amber-50 text-amber-800 ring-amber-200 dark:bg-amber-900/30 dark:text-amber-200 dark:ring-amber-800',
  error: 'bg-rose-50 text-rose-800 ring-rose-200 dark:bg-rose-900/30 dark:text-rose-200 dark:ring-rose-800',
  muted: 'bg-slate-100 text-slate-600 ring-slate-200 dark:bg-slate-700/50 dark:text-slate-300 dark:ring-slate-600',
  busy: 'bg-violet-50 text-violet-800 ring-violet-200 dark:bg-violet-900/30 dark:text-violet-200 dark:ring-violet-800',
};

/**
 * Chip trạng thái AI cục bộ: màn đang ghi (thanh trạng thái) + cạnh nút "Bắt đầu ghi". Bấm = kiểm tra lại ngay
 * (chỉ GET /api/tags). Chi tiết (địa chỉ, thời gian phản hồi, lỗi) ở tooltip và thẻ AI của màn chuẩn bị.
 */
export function AiLinkChip({ monitor, className = '' }: { monitor: AiLinkMonitor; className?: string }) {
  const s = useAiLink(monitor);
  const v = aiLinkView(s);
  const busy = s.state === 'checking' || s.refreshing;
  const cls = `inline-flex min-h-12 max-w-full items-center gap-1.5 rounded-full px-3 text-sm ring-1 ${AI_LINK_TONE[v.tone]} ${className}`;
  const body = (
    <>
      <span aria-hidden className={`font-bold ${busy ? 'animate-pulse' : ''}`}>
        {v.icon}
      </span>
      <span className="font-semibold whitespace-nowrap">{v.label}</span>
      {v.sub && <span className="max-w-56 min-w-0 truncate text-xs opacity-80">· {v.sub}</span>}
    </>
  );
  return (
    <>
      {s.state === 'off' ? (
        <span className={cls} title={v.detail} data-testid="coach-ai-link" data-state={s.state}>
          {body}
        </span>
      ) : (
        <button
          type="button"
          className={`${cls} cursor-pointer`}
          title={`${v.detail}\n${AI_LINK_PRIVACY}\nBấm để kiểm tra lại.`}
          aria-label={`${v.label}${v.sub ? ` — ${v.sub}` : ''}. Bấm để kiểm tra lại.`}
          aria-busy={busy}
          onClick={() => monitor.refresh()}
          data-testid="coach-ai-link"
          data-state={s.state}
        >
          {body}
        </button>
      )}
      <span className="sr-only" role="status" aria-live="polite">
        {v.label}
      </span>
    </>
  );
}

/** Dòng trạng thái đầy đủ trong thẻ AI của màn chuẩn bị. */
export function AiLinkDetail({ monitor }: { monitor: AiLinkMonitor }) {
  const s = useAiLink(monitor);
  if (s.state === 'off') return null;
  const v = aiLinkView(s);
  return (
    <p className={`mt-2 rounded-xl px-3 py-2 text-sm ring-1 ${AI_LINK_TONE[v.tone]}`} data-testid="coach-ai-status" data-state={s.state}>
      <span aria-hidden className={`mr-1 font-bold ${s.refreshing ? 'animate-pulse' : ''}`}>
        {v.icon}
      </span>
      {v.detail}
    </p>
  );
}
