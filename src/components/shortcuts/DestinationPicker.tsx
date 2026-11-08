import { useMemo, useState } from 'react';
import { browseTree, searchDestinations, type BrowseNode, type Destination } from '../../core/shortcuts/registry';
import { Icon } from '../ui';
import { FOCUS_RING } from './shortcutStyle';

const ROW = `flex min-h-12 w-full items-center gap-3 rounded-xl px-3 py-1.5 text-left hover:bg-violet-50 dark:hover:bg-slate-700 ${FOCUS_RING}`;

/**
 * Bước 1 — chọn đích đến: duyệt theo cấu trúc app (Giáo trình → Cấp → Buổi, Trò chơi → trò → mức / buổi,
 * Thư viện → nhóm → bài…) hoặc tìm theo tên (không cần gõ dấu). Danh sách lấy từ `core/shortcuts/registry`.
 */
export function DestinationPicker({ onPick, autoFocus = false }: { onPick: (d: Destination) => void; autoFocus?: boolean }) {
  const tree = useMemo(() => browseTree(), []);
  const [query, setQuery] = useState('');
  const [trail, setTrail] = useState<BrowseNode[]>([]);
  const current = trail[trail.length - 1];
  const nodes = current?.children ?? tree;
  const results = useMemo(() => (query.trim() ? searchDestinations(query, 60) : null), [query]);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3" data-testid="destination-picker">
      <label className="block">
        <span className="sr-only">Tìm bài học, trò chơi, trang</span>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          autoFocus={autoFocus}
          placeholder="Tìm bài học, trò chơi, bài nhạc, trang… (gõ không dấu cũng được)"
          className="block min-h-12 w-full rounded-xl bg-white px-4 text-base ring-1 ring-slate-300 outline-none focus:ring-2 focus:ring-fuchsia-400 dark:bg-slate-900 dark:ring-slate-600"
          data-testid="destination-search"
        />
      </label>

      {results ? (
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain" aria-live="polite">
          {results.length === 0 ? (
            <p className="px-3 py-6 text-center text-slate-500 dark:text-slate-400">Không tìm thấy “{query.trim()}”. Thử tên khác, hoặc duyệt theo mục.</p>
          ) : (
            <ul data-testid="destination-results">
              {results.map((d) => (
                <li key={`${d.target.type}|${d.target.id}`}>
                  <button type="button" onClick={() => onPick(d)} className={ROW} data-testid={`destination-${d.target.type}-${d.target.id}`}>
                    <span className="w-8 shrink-0 text-center text-2xl leading-none" aria-hidden>
                      {d.icon}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold">{d.title}</span>
                      <span className="block truncate text-xs text-slate-500 dark:text-slate-400">{d.path.join(' › ')}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : (
        <>
          <nav className="flex flex-wrap items-center gap-1 text-sm" aria-label="Đang xem">
            <button
              type="button"
              onClick={() => setTrail([])}
              className={`min-h-10 rounded-lg px-2 font-semibold text-violet-700 hover:bg-violet-50 dark:text-violet-200 dark:hover:bg-slate-700 ${FOCUS_RING}`}
              data-testid="destination-root"
            >
              Tất cả
            </button>
            {trail.map((n, i) => (
              <span key={n.key} className="flex items-center gap-1">
                <span aria-hidden className="text-slate-400">
                  ›
                </span>
                <button
                  type="button"
                  onClick={() => setTrail(trail.slice(0, i + 1))}
                  aria-current={i === trail.length - 1 ? 'page' : undefined}
                  className={`min-h-10 max-w-48 truncate rounded-lg px-2 font-semibold text-violet-700 hover:bg-violet-50 aria-[current=page]:text-slate-700 dark:text-violet-200 dark:hover:bg-slate-700 dark:aria-[current=page]:text-slate-200 ${FOCUS_RING}`}
                >
                  {n.label}
                </button>
              </span>
            ))}
          </nav>

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
            <ul data-testid="destination-list">
              {current?.destination && (
                <li>
                  <button
                    type="button"
                    onClick={() => onPick(current.destination!)}
                    className={`${ROW} bg-fuchsia-50 ring-1 ring-fuchsia-200 dark:bg-fuchsia-950/40 dark:ring-fuchsia-900`}
                    data-testid="destination-pick-current"
                  >
                    <Icon name="pin" className="h-6 w-8 shrink-0 text-fuchsia-600 dark:text-fuchsia-300" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold">Chọn cả mục “{current.destination.title}”</span>
                      <span className="block truncate text-xs text-slate-500 dark:text-slate-400">Mở trang {current.label}</span>
                    </span>
                  </button>
                </li>
              )}
              {nodes.map((n) => (
                <li key={n.key}>
                  <button
                    type="button"
                    onClick={() => (n.children ? setTrail([...trail, n]) : n.destination && onPick(n.destination))}
                    className={ROW}
                    aria-label={n.children ? `${n.label} — xem mục con` : `Chọn ${n.label}`}
                    data-testid={`browse-${n.key}`}
                  >
                    <span className="w-8 shrink-0 text-center text-2xl leading-none" aria-hidden>
                      {n.icon ?? ''}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold">{n.label}</span>
                      {n.hint && <span className="block truncate text-xs text-slate-500 dark:text-slate-400">{n.hint}</span>}
                    </span>
                    {n.children && (
                      <span className="shrink-0 text-xl text-slate-400" aria-hidden>
                        ›
                      </span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </>
      )}
    </div>
  );
}
