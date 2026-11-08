/**
 * Lối tắt của hồ sơ đang chọn (Zustand). Đổi hồ sơ → nạp ngay danh sách của hồ sơ đó (không trộn dữ liệu).
 * Logic thuần ở `core/shortcuts/ShortcutService`; ở đây chỉ giữ trạng thái + lưu localStorage + trạng thái UI dùng chung
 * (hộp thoại tạo / sửa / ghim, thanh hoàn tác, thông báo lối tắt hỏng) để mọi màn dùng chung một bản.
 */
import { create } from 'zustand';
import { GUEST_PROFILE } from '../core/curriculum/progress';
import {
  createShortcut,
  findByTarget,
  loadShortcuts,
  moveShortcut,
  removeShortcut,
  restoreShortcut,
  saveShortcuts,
  shortcutsStorageKey,
  updateShortcut,
  type KeyValueStorage,
  type RemovedShortcut,
  type SaveResult,
} from '../core/shortcuts/ShortcutService';
import type { Shortcut, ShortcutInput, ShortcutTarget } from '../core/shortcuts/types';
import { useProfiles } from './profileStore';
import { openTarget } from './shortcutRoutes';

/** Hộp thoại lối tắt đang mở. `pin`: ghim đích có sẵn (màn đang xem / đề xuất), có thể kèm tên + biểu tượng gợi ý. */
export type ShortcutEditorRequest = { mode: 'create' } | { mode: 'edit'; id: string } | { mode: 'pin'; target: ShortcutTarget; name?: string; icon?: string };

export interface ShortcutUndo extends RemovedShortcut {
  profileKey: string;
  /** Tăng mỗi lần xoá — thanh hoàn tác đếm lại thời gian. */
  seq: number;
}

interface ShortcutStore {
  /** Hồ sơ đang chọn (id hồ sơ, hoặc "guest"). */
  profileKey: string;
  /** Lối tắt của hồ sơ đang chọn, theo thứ tự. */
  items: Shortcut[];
  /** Lỗi lưu gần nhất (bộ nhớ trình duyệt bị chặn / đầy). */
  saveError: string | null;
  undo: ShortcutUndo | null;
  editor: ShortcutEditorRequest | null;
  /** Lối tắt vừa bấm mà đích không còn tồn tại. */
  broken: Shortcut | null;

  load: (profileKey: string) => void;
  create: (input: ShortcutInput) => SaveResult;
  update: (id: string, patch: Partial<ShortcutInput>) => SaveResult;
  remove: (id: string) => void;
  undoRemove: () => void;
  dismissUndo: () => void;
  move: (id: string, toIndex: number) => void;
  setShowOnHome: (id: string, show: boolean) => void;
  /** Lối tắt cùng đích (đã ghim?). */
  pinnedFor: (target: ShortcutTarget) => Shortcut | undefined;
  /** Mở lối tắt; đích không còn → hiện thông báo sửa / xoá. */
  open: (shortcut: Shortcut) => boolean;
  openEditor: (request: ShortcutEditorRequest) => void;
  closeEditor: () => void;
  closeBroken: () => void;
}

const browserStorage = (): KeyValueStorage | null => {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
};

const keyOf = (activeId: string | null) => activeId ?? GUEST_PROFILE;
const SAVE_ERROR = 'Không lưu được lối tắt trên máy này (bộ nhớ trình duyệt bị chặn hoặc đầy?) — lối tắt chỉ giữ tới khi đóng app.';
let undoSeq = 0;

export const useShortcuts = create<ShortcutStore>((set, get) => {
  /** Ghi danh sách mới của hồ sơ đang chọn. */
  const commit = (items: Shortcut[], extra: Partial<ShortcutStore> = {}) => {
    const ok = saveShortcuts(browserStorage(), get().profileKey, items);
    set({ items, saveError: ok ? null : SAVE_ERROR, ...extra });
  };
  const initialKey = keyOf(useProfiles.getState().activeId);

  return {
    profileKey: initialKey,
    items: loadShortcuts(browserStorage(), initialKey),
    saveError: null,
    undo: null,
    editor: null,
    broken: null,

    load: (profileKey) => set({ profileKey, items: loadShortcuts(browserStorage(), profileKey), undo: null, editor: null, broken: null, saveError: null }),
    create: (input) => {
      const r = createShortcut(get().items, get().profileKey, input, Date.now());
      if (r.ok) commit(r.list);
      return r;
    },
    update: (id, patch) => {
      const r = updateShortcut(get().items, id, patch, Date.now());
      if (r.ok) commit(r.list);
      return r;
    },
    remove: (id) => {
      const { list, removed } = removeShortcut(get().items, id);
      if (!removed) return;
      commit(list, { undo: { ...removed, profileKey: get().profileKey, seq: ++undoSeq }, broken: get().broken?.id === id ? null : get().broken });
    },
    undoRemove: () => {
      const undo = get().undo;
      if (!undo || undo.profileKey !== get().profileKey) return set({ undo: null });
      commit(restoreShortcut(get().items, undo), { undo: null });
    },
    dismissUndo: () => set({ undo: null }),
    move: (id, toIndex) => commit(moveShortcut(get().items, id, toIndex)),
    setShowOnHome: (id, show) => {
      get().update(id, { showOnHome: show });
    },
    pinnedFor: (target) => findByTarget(get().items, target),
    open: (shortcut) => {
      if (openTarget(shortcut.target)) return true;
      set({ broken: shortcut });
      return false;
    },
    openEditor: (editor) => set({ editor, broken: null }),
    closeEditor: () => set({ editor: null }),
    closeBroken: () => set({ broken: null }),
  };
});

// Đổi hồ sơ → danh sách lối tắt của hồ sơ đó.
useProfiles.subscribe((s, prev) => {
  if (s.activeId !== prev.activeId) useShortcuts.getState().load(keyOf(s.activeId));
});

// Tab / cửa sổ khác của app sửa lối tắt của cùng hồ sơ → nạp lại.
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    const { profileKey } = useShortcuts.getState();
    if (e.key === shortcutsStorageKey(profileKey)) useShortcuts.setState({ items: loadShortcuts(browserStorage(), profileKey) });
  });
}
