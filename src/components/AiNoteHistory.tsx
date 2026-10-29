import { AI_NOTE_MODE_LABEL, type AiNote } from '../core/feedback/aiNotes';

const DATE_FMT = new Intl.DateTimeFormat('vi-VN', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

/** Nhận xét AI các lần trước (mới nhất trước); bản mới nhất mở sẵn. */
export function AiNoteHistory({ notes, className = '' }: { notes: readonly AiNote[]; className?: string }) {
  const list = [...notes].reverse();
  return (
    <section className={`rounded-2xl bg-white/90 p-4 shadow-sm ring-1 ring-violet-100 dark:bg-slate-800/90 dark:ring-violet-900 ${className}`} data-testid="ai-note-history">
      <h3 className="font-semibold">🤖 Nhận xét của AI</h3>
      <div className="mt-2 grid max-h-96 gap-2 overflow-y-auto">
        {list.map((n, i) => (
          <details key={n.at} open={i === 0} className="rounded-xl bg-violet-50 px-3 py-2 dark:bg-slate-700/60">
            <summary className="flex min-h-10 cursor-pointer items-center justify-between gap-2 text-sm">
              <span className="text-slate-500 dark:text-slate-400">
                {DATE_FMT.format(n.at)}
                {n.mode && ` · ${AI_NOTE_MODE_LABEL[n.mode]}`}
              </span>
              <span className="font-bold tabular-nums">{n.score}/100</span>
            </summary>
            <p className="mt-1 whitespace-pre-line text-sm" data-testid="ai-note-text">
              {n.text}
            </p>
          </details>
        ))}
      </div>
    </section>
  );
}
