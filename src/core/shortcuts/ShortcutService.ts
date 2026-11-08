/**
 * ShortcutService — thao tác thuần trên danh sách lối tắt của MỘT hồ sơ (tạo / sửa / xoá + hoàn tác / sắp xếp /
 * bật tắt hiện trên trang chủ) và lưu bền vững theo hồ sơ.
 *
 * Danh sách luôn xếp theo `order` liên tục 0, 1, 2… Không có hai lối tắt cùng đích (cùng `targetKey`) trong một hồ sơ.
 * Lưu: localStorage, một khoá riêng mỗi hồ sơ (`vietpiano.shortcuts.v1:<profileId|guest>`) — cùng cách các dữ liệu
 * nhỏ theo hồ sơ khác của app (kỷ lục trò chơi…). App không có backend / tài khoản nên không đồng bộ giữa các máy.
 */
import { sanitizeTarget, targetKey } from './registry';
import { MAX_SHORTCUTS, SHORTCUT_COLORS, SHORTCUT_ICON_MAX, SHORTCUT_NAME_MAX, type Shortcut, type ShortcutColor, type ShortcutInput, type ShortcutTarget } from './types';

export const DEFAULT_SHORTCUT_ICON = '⭐';

/** Tên: bỏ khoảng trắng thừa, cắt theo ký tự (không cắt đôi emoji). */
export function cleanName(name: unknown): string {
  if (typeof name !== 'string') return '';
  return [...name.replace(/\s+/g, ' ').trim()].slice(0, SHORTCUT_NAME_MAX).join('').trim();
}

/** Biểu tượng: chuỗi ngắn (emoji) — chỉ hiển thị dạng chữ, không bao giờ là HTML / URL. */
export function cleanIcon(icon: unknown): string {
  if (typeof icon !== 'string') return DEFAULT_SHORTCUT_ICON;
  const t = icon.replace(/\s+/g, '').trim();
  if (!t || t.length > SHORTCUT_ICON_MAX || /[<>"'`\\/]/.test(t)) return DEFAULT_SHORTCUT_ICON;
  return t;
}

export function cleanColor(color: unknown): ShortcutColor {
  return SHORTCUT_COLORS.includes(color as ShortcutColor) ? (color as ShortcutColor) : 'violet';
}

const renumber = (list: readonly Shortcut[]): Shortcut[] => list.map((s, i) => (s.order === i ? s : { ...s, order: i }));

export function newShortcutId(now: number, random: () => number = Math.random): string {
  return `sc${now.toString(36)}${random().toString(36).slice(2, 7)}`;
}

/** Lối tắt cùng đích (cùng nội dung + tham số) — bỏ qua `exceptId` (đang sửa chính nó). */
export function findByTarget(list: readonly Shortcut[], target: ShortcutTarget, exceptId?: string): Shortcut | undefined {
  const key = targetKey(target);
  return list.find((s) => s.id !== exceptId && targetKey(s.target) === key);
}

export type SaveResult =
  { ok: true; list: Shortcut[]; shortcut: Shortcut } | { ok: false; reason: 'duplicate'; existing: Shortcut } | { ok: false; reason: 'invalid' | 'limit' | 'not-found' };

/** Tạo lối tắt mới ở cuối danh sách. Trùng đích → trả lối tắt cũ để đề xuất mở / sửa. */
export function createShortcut(list: readonly Shortcut[], profileId: string, input: ShortcutInput, now: number, random?: () => number): SaveResult {
  const target = sanitizeTarget(input.target);
  if (!target) return { ok: false, reason: 'invalid' };
  const existing = findByTarget(list, target);
  if (existing) return { ok: false, reason: 'duplicate', existing };
  if (list.length >= MAX_SHORTCUTS) return { ok: false, reason: 'limit' };
  const shortcut: Shortcut = {
    id: newShortcutId(now, random),
    profileId,
    name: cleanName(input.name) || 'Lối tắt',
    icon: cleanIcon(input.icon),
    color: cleanColor(input.color),
    target,
    order: list.length,
    showOnHome: input.showOnHome ?? true,
    createdAt: now,
    updatedAt: now,
  };
  return { ok: true, list: renumber([...list, shortcut]), shortcut };
}

/** Sửa tên / biểu tượng / màu / đích / hiện trên trang chủ. Đổi sang đích đã có lối tắt khác → trùng. */
export function updateShortcut(list: readonly Shortcut[], id: string, patch: Partial<ShortcutInput>, now: number): SaveResult {
  const current = list.find((s) => s.id === id);
  if (!current) return { ok: false, reason: 'not-found' };
  let target = current.target;
  if (patch.target !== undefined) {
    const t = sanitizeTarget(patch.target);
    if (!t) return { ok: false, reason: 'invalid' };
    const existing = findByTarget(list, t, id);
    if (existing) return { ok: false, reason: 'duplicate', existing };
    target = t;
  }
  const next: Shortcut = {
    ...current,
    name: patch.name !== undefined ? cleanName(patch.name) || current.name : current.name,
    icon: patch.icon !== undefined ? cleanIcon(patch.icon) : current.icon,
    color: patch.color !== undefined ? cleanColor(patch.color) : current.color,
    showOnHome: patch.showOnHome ?? current.showOnHome,
    target,
    updatedAt: now,
  };
  return { ok: true, list: list.map((s) => (s.id === id ? next : s)), shortcut: next };
}

/** Lối tắt vừa xoá + vị trí cũ — để hoàn tác. */
export interface RemovedShortcut {
  shortcut: Shortcut;
  index: number;
}

export function removeShortcut(list: readonly Shortcut[], id: string): { list: Shortcut[]; removed: RemovedShortcut | null } {
  const index = list.findIndex((s) => s.id === id);
  if (index < 0) return { list: [...list], removed: null };
  return { list: renumber(list.filter((s) => s.id !== id)), removed: { shortcut: list[index], index } };
}

/** Hoàn tác xoá: đặt lại đúng vị trí cũ. Bỏ qua nếu trong lúc đó đã tạo lối tắt khác cùng đích / cùng id. */
export function restoreShortcut(list: readonly Shortcut[], removed: RemovedShortcut): Shortcut[] {
  if (list.some((s) => s.id === removed.shortcut.id) || findByTarget(list, removed.shortcut.target)) return [...list];
  const next = [...list];
  next.splice(Math.min(Math.max(0, removed.index), next.length), 0, removed.shortcut);
  return renumber(next);
}

/** Chuyển lối tắt tới vị trí `toIndex` (kéo thả hoặc nút lên / xuống). */
export function moveShortcut(list: readonly Shortcut[], id: string, toIndex: number): Shortcut[] {
  const from = list.findIndex((s) => s.id === id);
  if (from < 0) return [...list];
  const to = Math.min(Math.max(0, Math.round(toIndex)), list.length - 1);
  if (to === from) return [...list];
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return renumber(next);
}

/** Lối tắt hiện trên thanh trang chủ, theo thứ tự (thanh tự chọn hiện bao nhiêu nút, tối đa `HOME_BAR_MAX`). */
export function homeShortcuts(list: readonly Shortcut[]): Shortcut[] {
  return list.filter((s) => s.showOnHome);
}

/** Tìm trong danh sách lối tắt: theo tên hoặc tên đích (`describe` trả tên / đường dẫn đích). */
export function filterShortcuts(list: readonly Shortcut[], query: string, describe: (s: Shortcut) => string, fold: (s: string) => string): Shortcut[] {
  const q = fold(query);
  if (!q) return [...list];
  const tokens = q.split(' ');
  return list.filter((s) => {
    const hay = fold(`${s.name} ${describe(s)}`);
    return tokens.every((t) => hay.includes(t));
  });
}

// ─── Lưu trữ ────────────────────────────────────────────────────────────────────────────────────

export const SHORTCUTS_STORAGE_VERSION = 1;
export const shortcutsStorageKey = (profileKey: string) => `vietpiano.shortcuts.v${SHORTCUTS_STORAGE_VERSION}:${profileKey}`;

/**
 * Đọc dữ liệu lưu (có thể hỏng / bản cũ / sửa tay): bỏ mục sai dạng, mục của hồ sơ KHÁC, id trùng, đích trùng;
 * GIỮ mục có đích không còn tồn tại (người dùng tự sửa / xoá, có thông báo).
 */
export function sanitizeShortcuts(raw: unknown, profileId: string): Shortcut[] {
  const items = raw && typeof raw === 'object' && Array.isArray((raw as { items?: unknown }).items) ? (raw as { items: unknown[] }).items : Array.isArray(raw) ? raw : [];
  const ids = new Set<string>();
  const keys = new Set<string>();
  const out: Shortcut[] = [];
  for (const item of items) {
    if (!item || typeof item !== 'object') continue;
    const r = item as Record<string, unknown>;
    if (typeof r.id !== 'string' || !r.id || r.id.length > 64 || ids.has(r.id)) continue;
    if (r.profileId !== profileId) continue;
    const target = sanitizeTarget(r.target);
    if (!target) continue;
    const key = targetKey(target);
    if (keys.has(key)) continue;
    ids.add(r.id);
    keys.add(key);
    const num = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
    out.push({
      id: r.id,
      profileId,
      name: cleanName(r.name) || 'Lối tắt',
      icon: cleanIcon(r.icon),
      color: cleanColor(r.color),
      target,
      order: num(r.order, out.length),
      showOnHome: typeof r.showOnHome === 'boolean' ? r.showOnHome : true,
      createdAt: num(r.createdAt, 0),
      updatedAt: num(r.updatedAt, 0),
    });
    if (out.length >= MAX_SHORTCUTS) break;
  }
  // Xếp ổn định theo `order` đã lưu rồi đánh lại liên tục.
  return renumber(
    out
      .map((s, i) => ({ s, i }))
      .sort((a, b) => a.s.order - b.s.order || a.i - b.i)
      .map((x) => x.s),
  );
}

/** Phần localStorage cần dùng (để test truyền bộ nhớ giả). */
export type KeyValueStorage = Pick<Storage, 'getItem' | 'setItem'>;

export function loadShortcuts(storage: KeyValueStorage | null, profileKey: string): Shortcut[] {
  try {
    const raw = storage?.getItem(shortcutsStorageKey(profileKey));
    return raw ? sanitizeShortcuts(JSON.parse(raw), profileKey) : [];
  } catch {
    return [];
  }
}

/** Ghi danh sách; trả false nếu bộ nhớ trình duyệt bị chặn / đầy (UI báo cho người dùng). */
export function saveShortcuts(storage: KeyValueStorage | null, profileKey: string, list: readonly Shortcut[]): boolean {
  try {
    if (!storage) return false;
    storage.setItem(shortcutsStorageKey(profileKey), JSON.stringify({ version: SHORTCUTS_STORAGE_VERSION, items: list }));
    return true;
  } catch {
    return false;
  }
}
