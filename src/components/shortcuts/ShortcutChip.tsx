import type { ButtonHTMLAttributes } from 'react';
import type { Shortcut, ShortcutSuggestion } from '../../core/shortcuts/types';
import { CHIP_COLOR, FOCUS_RING } from './shortcutStyle';

const BASE = 'inline-flex min-h-12 max-w-44 shrink-0 items-center gap-1.5 rounded-full px-3 text-sm font-semibold whitespace-nowrap transition-colors';

/** Mặt nút lối tắt (dùng cả cho bản đo bề rộng — không có hành vi). */
export function ShortcutChipFace({ shortcut, broken }: { shortcut: Pick<Shortcut, 'name' | 'icon' | 'color'>; broken?: boolean }) {
  return (
    <>
      <span className="text-xl leading-none" aria-hidden>
        {shortcut.icon}
      </span>
      <span className="truncate">{shortcut.name}</span>
      {broken && (
        <span className="text-base leading-none" aria-hidden>
          ⚠️
        </span>
      )}
    </>
  );
}

export function shortcutChipClass(shortcut: Pick<Shortcut, 'color'>, broken = false): string {
  return `${BASE} ${broken ? 'opacity-75 ring-2 ring-amber-400 dark:ring-amber-500' : 'ring-1'} ${CHIP_COLOR[shortcut.color]}`;
}

/** Nút lối tắt bo tròn: biểu tượng + tên (tên dài tự rút gọn, tên đầy đủ ở `title`). */
export function ShortcutChip({
  shortcut,
  destinationTitle,
  className = '',
  ...rest
}: { shortcut: Shortcut; destinationTitle: string | null } & ButtonHTMLAttributes<HTMLButtonElement>) {
  const broken = destinationTitle === null;
  return (
    <button
      type="button"
      title={broken ? `${shortcut.name} — nội dung không còn, bấm để sửa hoặc xoá` : `${shortcut.name} — ${destinationTitle}`}
      aria-label={broken ? `${shortcut.name} (lối tắt hỏng)` : `${shortcut.name}: mở ${destinationTitle}`}
      data-testid={`shortcut-chip-${shortcut.id}`}
      data-broken={broken || undefined}
      className={`${shortcutChipClass(shortcut, broken)} ${FOCUS_RING} ${className}`}
      {...rest}
    >
      <ShortcutChipFace shortcut={shortcut} broken={broken} />
    </button>
  );
}

const SUGGESTION =
  'border-2 border-dashed border-fuchsia-300 bg-white/80 text-fuchsia-900 hover:bg-fuchsia-50 dark:border-fuchsia-700 dark:bg-slate-800/80 dark:text-fuchsia-100 dark:hover:bg-slate-700';

export function SuggestionChipFace({ suggestion }: { suggestion: Pick<ShortcutSuggestion, 'name' | 'icon'> }) {
  return (
    <>
      <span className="text-xs leading-none" aria-hidden>
        ✨
      </span>
      <span className="text-xl leading-none" aria-hidden>
        {suggestion.icon}
      </span>
      <span className="truncate">{suggestion.name}</span>
    </>
  );
}

export const suggestionChipClass = `${BASE} ${SUGGESTION}`;

/** Đề xuất (không phải lối tắt đã ghim) — viền đứt + dấu ✨ để phân biệt. */
export function SuggestionChip({ suggestion, className = '', ...rest }: { suggestion: ShortcutSuggestion } & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      title={suggestion.reason ? `${suggestion.name} — ${suggestion.reason}` : suggestion.name}
      aria-label={`Gợi ý: ${suggestion.name}${suggestion.reason ? ` — ${suggestion.reason}` : ''}`}
      data-testid={`shortcut-suggestion-${suggestion.key}`}
      className={`${suggestionChipClass} ${FOCUS_RING} ${className}`}
      {...rest}
    >
      <SuggestionChipFace suggestion={suggestion} />
    </button>
  );
}
