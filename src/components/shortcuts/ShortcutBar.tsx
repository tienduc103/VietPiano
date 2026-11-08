import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { resolveTarget, targetKey } from '../../core/shortcuts/registry';
import { HOME_BAR_MAX, type Shortcut, type ShortcutSuggestion } from '../../core/shortcuts/types';
import { useUiMode } from '../../hooks/useUiMode';
import { useApp } from '../../store/appStore';
import { activeProfile, useProfiles } from '../../store/profileStore';
import { openTarget } from '../../store/shortcutRoutes';
import { useShortcuts } from '../../store/shortcutStore';
import { Icon } from '../ui';
import { shortcutChipClass, ShortcutChip, ShortcutChipFace, suggestionChipClass, SuggestionChip, SuggestionChipFace } from './ShortcutChip';
import { FOCUS_RING } from './shortcutStyle';

export interface ShortcutBarProps {
  className?: string;
  /** Đề xuất (vd Lối tắt thông minh): hiện SAU lối tắt thủ công khi còn chỗ + nhóm "Gợi ý" trong menu ⋯. Giữ nguyên thứ tự truyền vào. */
  suggestions?: readonly ShortcutSuggestion[];
  /** Số đề xuất tối đa thành nút trên thanh (mặc định 1; 0 = chỉ trong menu). */
  maxSuggestionsOnBar?: number;
  /** Có → mỗi đề xuất trong menu có nút "Ẩn". */
  onDismissSuggestion?: (key: string) => void;
  /** Gọi ngay trước khi mở một đề xuất. */
  onOpenSuggestion?: (key: string) => void;
  /**
   * Đang bật đề xuất (có thể tới sau vài trăm ms): bỏ trạng thái trống "+ Lối tắt", luôn hiện nút ⋯ ngay từ khung đầu
   * (menu có "+ Thêm lối tắt") — nút không tự đổi dưới tay người dùng khi đề xuất về.
   */
  suggestionsEnabled?: boolean;
}

type BarItem = { key: string; kind: 'manual'; shortcut: Shortcut } | { key: string; kind: 'suggestion'; suggestion: ShortcutSuggestion };

const GAP = 8; // gap-2
const MENU_BUTTON = `inline-flex min-h-12 min-w-12 shrink-0 items-center justify-center gap-1.5 rounded-full px-3 text-sm font-semibold whitespace-nowrap text-violet-800 ring-1 ring-violet-200 bg-white/80 hover:bg-violet-50 dark:bg-slate-800/80 dark:text-violet-100 dark:ring-violet-800 dark:hover:bg-slate-700`;

/**
 * Thanh lối tắt trên trang chủ, cạnh thanh hồ sơ. Hiện tối đa `HOME_BAR_MAX` nút — đo bề rộng thật còn trống nên
 * KHÔNG làm thanh hồ sơ cao thêm hay tràn; không đủ chỗ thì dồn vào menu ⋯ (màn hẹp: chỉ còn nút "Lối tắt ⋯").
 * Menu ⋯ luôn có khi đã có lối tắt: danh sách đầy đủ, nhóm "Gợi ý", Thêm lối tắt, Quản lý (người lớn).
 */
export function ShortcutBar({ className = '', suggestions, maxSuggestionsOnBar = 1, onDismissSuggestion, onOpenSuggestion, suggestionsEnabled = false }: ShortcutBarProps) {
  const items = useShortcuts((s) => s.items);
  const openShortcut = useShortcuts((s) => s.open);
  const openEditor = useShortcuts((s) => s.openEditor);
  const profile = useProfiles(activeProfile);
  const navigate = useApp((s) => s.navigate);
  const kids = useUiMode() === 'kids';

  /** Đề xuất trùng đích với lối tắt đã ghim (hoặc trùng nhau) bị bỏ. */
  const extra = useMemo(() => {
    const seen = new Set(items.map((s) => targetKey(s.target)));
    return (suggestions ?? []).filter((x) => {
      const k = targetKey(x.target);
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  }, [items, suggestions]);

  const barItems = useMemo<BarItem[]>(() => {
    const manual: BarItem[] = items
      .filter((s) => s.showOnHome)
      .slice(0, HOME_BAR_MAX)
      .map((s) => ({ key: s.id, kind: 'manual', shortcut: s }));
    const room = Math.max(0, Math.min(HOME_BAR_MAX - manual.length, maxSuggestionsOnBar));
    return [...manual, ...extra.slice(0, room).map((x): BarItem => ({ key: `sg:${x.key}`, kind: 'suggestion', suggestion: x }))];
  }, [items, extra, maxSuggestionsOnBar]);

  /** Số mục trong menu ⋯ (mọi lối tắt + mọi đề xuất). */
  const total = items.length + extra.length;
  /** Trạng thái trống: chưa có lối tắt, không có (và không chờ) đề xuất → nút "+ Lối tắt" thay cho ⋯. */
  const empty = total === 0 && !suggestionsEnabled;
  const titles = useMemo(() => new Map(items.map((s) => [s.id, resolveTarget(s.target)?.title ?? null])), [items]);

  const navRef = useRef<HTMLElement>(null);
  const measureRef = useRef<HTMLDivElement>(null);
  const [fit, setFit] = useState(barItems.length);
  const [labeledMenu, setLabeledMenu] = useState(false);
  useLayoutEffect(() => {
    const nav = navRef.current;
    const measure = measureRef.current;
    if (!nav || !measure) return;
    const compute = () => {
      const avail = nav.clientWidth;
      const nodes = [...measure.children] as HTMLElement[];
      const chipW = nodes.slice(0, barItems.length).map((n) => n.offsetWidth);
      const menuCompact = nodes[barItems.length]?.offsetWidth ?? 48;
      const menuLabeled = nodes[barItems.length + 1]?.offsetWidth ?? 120;
      let best = 0;
      for (let c = barItems.length; c > 0; c--) {
        const chips = chipW.slice(0, c).reduce((a, w) => a + w, 0) + (c - 1) * GAP;
        // Nút ⋯ luôn có khi đã có lối tắt: chứa danh sách đầy đủ + "Thêm lối tắt" / "Quản lý".
        const menu = GAP + menuCompact;
        if (chips + menu <= avail + 0.5) {
          best = c;
          break;
        }
      }
      setFit(best);
      setLabeledMenu(best === 0 && avail >= menuLabeled);
    };
    compute();
    const ro = new ResizeObserver(compute);
    ro.observe(nav);
    ro.observe(measure);
    return () => ro.disconnect();
  }, [barItems, total]);

  const [menuOpen, setMenuOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: PointerEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setMenuOpen(false);
    document.addEventListener('pointerdown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [menuOpen]);

  const openSuggestion = (x: ShortcutSuggestion) => {
    setMenuOpen(false);
    onOpenSuggestion?.(x.key);
    openTarget(x.target);
  };
  // Ghim đề xuất → tên / biểu tượng MẶC ĐỊNH của đích (nhãn đề xuất như "Tiếp tục…" sẽ sai nghĩa về sau); vẫn sửa được.
  const pinSuggestion = (x: ShortcutSuggestion) => {
    setMenuOpen(false);
    openEditor({ mode: 'pin', target: x.target });
  };

  return (
    <nav ref={navRef} aria-label="Lối tắt" data-testid="shortcut-bar" data-fit={fit} className={`relative flex min-w-12 flex-1 items-center justify-end gap-2 ${className}`}>
      {/* Bản sao vô hình để đo bề rộng từng nút — không chiếm chỗ, không bấm / đọc được. */}
      <div aria-hidden inert className="pointer-events-none invisible absolute top-0 left-0 h-0 w-0 overflow-hidden">
        <div ref={measureRef} className="flex w-max gap-2">
          {barItems.map((b) =>
            b.kind === 'manual' ? (
              <span key={b.key} className={shortcutChipClass(b.shortcut, titles.get(b.shortcut.id) === null)}>
                <ShortcutChipFace shortcut={b.shortcut} broken={titles.get(b.shortcut.id) === null} />
              </span>
            ) : (
              <span key={b.key} className={suggestionChipClass}>
                <SuggestionChipFace suggestion={b.suggestion} />
              </span>
            ),
          )}
          <span className={MENU_BUTTON}>⋯</span>
          <span className={MENU_BUTTON}>
            <Icon name="pin" className="h-5 w-5" /> Lối tắt ⋯
          </span>
        </div>
      </div>

      {barItems
        .slice(0, fit)
        .map((b) =>
          b.kind === 'manual' ? (
            <ShortcutChip key={b.key} shortcut={b.shortcut} destinationTitle={titles.get(b.shortcut.id) ?? null} onClick={() => openShortcut(b.shortcut)} />
          ) : (
            <SuggestionChip key={b.key} suggestion={b.suggestion} onClick={() => openSuggestion(b.suggestion)} />
          ),
        )}

      {empty ? (
        <button type="button" onClick={() => openEditor({ mode: 'create' })} className={`${MENU_BUTTON} ${FOCUS_RING}`} data-testid="shortcut-add">
          <span className="text-lg leading-none" aria-hidden>
            +
          </span>
          Lối tắt
        </button>
      ) : (
        <div ref={wrapRef} className="relative shrink-0">
          <button
            type="button"
            onClick={() => setMenuOpen((o) => !o)}
            aria-expanded={menuOpen}
            aria-haspopup="dialog"
            aria-label={`Tất cả lối tắt (${total})`}
            title="Tất cả lối tắt"
            className={`${MENU_BUTTON} ${FOCUS_RING}`}
            data-testid="shortcut-more"
          >
            {labeledMenu ? (
              <>
                <Icon name="pin" className="h-5 w-5" /> Lối tắt ⋯
              </>
            ) : (
              '⋯'
            )}
          </button>
          {menuOpen && (
            <div
              role="dialog"
              aria-label="Tất cả lối tắt"
              className="absolute top-full right-0 z-40 mt-2 w-[min(22rem,calc(100vw-2rem))] rounded-2xl bg-white p-2 text-left shadow-2xl ring-1 ring-violet-100 dark:bg-slate-800 dark:ring-violet-900"
              data-testid="shortcut-menu"
            >
              <div className="max-h-[min(60vh,28rem)] overflow-y-auto overscroll-contain">
                {items.length > 0 && (
                  <>
                    <p className="px-2 pt-1 pb-1 text-xs font-semibold text-slate-500 dark:text-slate-400">Lối tắt{profile ? ` của ${profile.name}` : ''}</p>
                    <ul>
                      {items.map((s) => {
                        const title = titles.get(s.id) ?? null;
                        return (
                          <li key={s.id}>
                            <button
                              type="button"
                              onClick={() => {
                                setMenuOpen(false);
                                openShortcut(s);
                              }}
                              className={`flex min-h-12 w-full items-center gap-3 rounded-xl px-2 py-1 text-left hover:bg-violet-50 dark:hover:bg-slate-700 ${FOCUS_RING}`}
                              data-testid={`shortcut-menu-item-${s.id}`}
                            >
                              <span className={`${kids ? 'text-3xl' : 'text-2xl'} leading-none`} aria-hidden>
                                {s.icon}
                              </span>
                              <span className="min-w-0 flex-1">
                                <span className={`block truncate font-semibold ${kids ? 'text-lg' : ''}`}>{s.name}</span>
                                <span className={`block truncate text-xs ${title === null ? 'text-amber-700 dark:text-amber-300' : 'text-slate-500 dark:text-slate-400'}`}>
                                  {title === null ? '⚠️ Nội dung không còn' : title}
                                </span>
                              </span>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  </>
                )}
                {extra.length > 0 && (
                  <>
                    <p className="px-2 pt-2 pb-1 text-xs font-semibold text-fuchsia-700 dark:text-fuchsia-300">✨ Gợi ý</p>
                    <ul data-testid="shortcut-menu-suggestions">
                      {extra.map((x) => (
                        <li key={x.key} className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => openSuggestion(x)}
                            className={`flex min-h-12 min-w-0 flex-1 items-center gap-3 rounded-xl px-2 py-1 text-left hover:bg-fuchsia-50 dark:hover:bg-slate-700 ${FOCUS_RING}`}
                          >
                            <span className="text-2xl leading-none" aria-hidden>
                              {x.icon}
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block truncate font-semibold">{x.name}</span>
                              {x.reason && <span className="block truncate text-xs text-slate-500 dark:text-slate-400">{x.reason}</span>}
                            </span>
                          </button>
                          <button
                            type="button"
                            onClick={() => pinSuggestion(x)}
                            aria-label={`Ghim lối tắt: ${x.name}`}
                            title="Ghim thành lối tắt"
                            className={`grid min-h-12 min-w-12 place-items-center rounded-xl text-violet-700 hover:bg-violet-50 dark:text-violet-200 dark:hover:bg-slate-700 ${FOCUS_RING}`}
                          >
                            <Icon name="pin" className="h-5 w-5" />
                          </button>
                          {onDismissSuggestion && (
                            <button
                              type="button"
                              onClick={() => onDismissSuggestion(x.key)}
                              aria-label={`Ẩn gợi ý: ${x.name}`}
                              className={`min-h-12 rounded-xl px-2 text-sm text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-700 ${FOCUS_RING}`}
                            >
                              Ẩn
                            </button>
                          )}
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </div>
              <div className="mt-1 flex flex-wrap gap-1 border-t border-violet-100 pt-1 dark:border-violet-900">
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    openEditor({ mode: 'create' });
                  }}
                  className={`min-h-12 flex-1 rounded-xl px-3 font-semibold text-violet-800 hover:bg-violet-50 dark:text-violet-100 dark:hover:bg-slate-700 ${FOCUS_RING}`}
                >
                  + Thêm lối tắt
                </button>
                {/* Trẻ em: chỉ mở / thêm — sửa, xoá, sắp xếp nằm ở Cài đặt. */}
                {!kids && (
                  <button
                    type="button"
                    onClick={() => {
                      setMenuOpen(false);
                      navigate({ name: 'settings', section: 'shortcuts' });
                    }}
                    className={`inline-flex min-h-12 flex-1 items-center justify-center gap-1.5 rounded-xl px-3 font-semibold text-violet-800 hover:bg-violet-50 dark:text-violet-100 dark:hover:bg-slate-700 ${FOCUS_RING}`}
                    data-testid="shortcut-manage"
                  >
                    <Icon name="settings" className="h-5 w-5" /> Quản lý
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </nav>
  );
}
