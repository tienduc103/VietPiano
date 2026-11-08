import type { ShortcutColor } from '../../core/shortcuts/types';

/** Nền nhẹ của nút lối tắt theo màu đã chọn (chuỗi lớp đầy đủ để Tailwind quét được). */
export const CHIP_COLOR: Record<ShortcutColor, string> = {
  violet: 'bg-violet-100 text-violet-900 ring-violet-200 hover:bg-violet-200/70 dark:bg-violet-900/50 dark:text-violet-100 dark:ring-violet-700 dark:hover:bg-violet-800/60',
  pink: 'bg-pink-100 text-pink-900 ring-pink-200 hover:bg-pink-200/70 dark:bg-pink-900/40 dark:text-pink-100 dark:ring-pink-800 dark:hover:bg-pink-800/50',
  amber: 'bg-amber-100 text-amber-900 ring-amber-200 hover:bg-amber-200/70 dark:bg-amber-900/40 dark:text-amber-100 dark:ring-amber-800 dark:hover:bg-amber-800/50',
  emerald:
    'bg-emerald-100 text-emerald-900 ring-emerald-200 hover:bg-emerald-200/70 dark:bg-emerald-900/40 dark:text-emerald-100 dark:ring-emerald-800 dark:hover:bg-emerald-800/50',
  sky: 'bg-sky-100 text-sky-900 ring-sky-200 hover:bg-sky-200/70 dark:bg-sky-900/40 dark:text-sky-100 dark:ring-sky-800 dark:hover:bg-sky-800/50',
  rose: 'bg-rose-100 text-rose-900 ring-rose-200 hover:bg-rose-200/70 dark:bg-rose-900/40 dark:text-rose-100 dark:ring-rose-800 dark:hover:bg-rose-800/50',
  orange: 'bg-orange-100 text-orange-900 ring-orange-200 hover:bg-orange-200/70 dark:bg-orange-900/40 dark:text-orange-100 dark:ring-orange-800 dark:hover:bg-orange-800/50',
  slate: 'bg-slate-100 text-slate-800 ring-slate-200 hover:bg-slate-200/70 dark:bg-slate-800 dark:text-slate-100 dark:ring-slate-600 dark:hover:bg-slate-700',
};

/** Ô màu trong bộ chọn màu. */
export const COLOR_SWATCH: Record<ShortcutColor, string> = {
  violet: 'bg-violet-200 dark:bg-violet-700',
  pink: 'bg-pink-200 dark:bg-pink-700',
  amber: 'bg-amber-200 dark:bg-amber-600',
  emerald: 'bg-emerald-200 dark:bg-emerald-700',
  sky: 'bg-sky-200 dark:bg-sky-700',
  rose: 'bg-rose-200 dark:bg-rose-700',
  orange: 'bg-orange-200 dark:bg-orange-600',
  slate: 'bg-slate-200 dark:bg-slate-600',
};

export const COLOR_LABEL: Record<ShortcutColor, string> = {
  violet: 'Tím',
  pink: 'Hồng',
  amber: 'Vàng',
  emerald: 'Xanh lá',
  sky: 'Xanh trời',
  rose: 'Đỏ hồng',
  orange: 'Cam',
  slate: 'Xám',
};

/** Biểu tượng gợi ý (dễ nhận với trẻ em). */
export const ICON_CHOICES = ['⭐', '🎹', '🎵', '🎼', '🎮', '🍅', '🐤', '🎈', '🎯', '🏎️', '📚', '📖', '🏆', '🌟', '🐱', '🐰', '🚀', '❤️'] as const;

/** Vòng focus thấy rõ khi dùng bàn phím. */
export const FOCUS_RING = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fuchsia-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-900';
