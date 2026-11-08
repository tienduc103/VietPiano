/**
 * Lối tắt thông minh của hồ sơ đang chọn (Zustand). Lõi thuần ở `core/shortcuts/smart` (engine, cài đặt, chống nhảy chỗ);
 * ở đây: trạng thái theo hồ sơ (cài đặt, đề xuất đã ẩn, cache thứ tự — localStorage) + danh sách đang hiện.
 *
 * - KHÔNG ghi gì vào kho lối tắt thủ công (`shortcutStore`): chỉ nhận tập khoá đích của chúng để bỏ đề xuất trùng.
 * - Chỉ tính lại khi được gọi `refresh` (thời điểm an toàn: mở trang chủ, đổi hồ sơ, người dùng ghim / ẩn / đổi cài đặt)
 *   — không theo từng nốt MIDI, không có đồng hồ tự làm mới.
 * - `keepOrder`: thay đổi do chính thao tác trên danh sách (ghim, ẩn, đổi cài đặt) → đề xuất còn lại GIỮ chỗ, đề xuất
 *   thay thế xếp sau cùng. Lần tính đầu sau khi mở app dùng thứ tự đã lưu nếu dữ liệu không đổi và chưa hết hạn.
 */
import { create } from 'zustand';
import { GUEST_PROFILE } from '../core/curriculum/progress';
import type { SmartInput } from '../core/shortcuts/smart/context';
import { computeSmartShortcuts } from '../core/shortcuts/smart/engine';
import {
  dismiss as dismissTarget,
  loadSmartState,
  saveSmartState,
  type SmartKeyValueStorage,
  type SmartProfileState,
  type SmartSettings,
} from '../core/shortcuts/smart/settings';
import { cacheValid, smartSignature, stableOrder, toCache } from '../core/shortcuts/smart/stability';
import type { SmartCandidate, SmartResult, SmartType } from '../core/shortcuts/smart/types';
import { useProfiles } from './profileStore';

export type SmartSettingsPatch = Partial<Omit<SmartSettings, 'types'>> & { types?: Partial<Record<SmartType, boolean>> };

interface RefreshOptions {
  /** Giữ thứ tự đang hiện (thay đổi do thao tác của người dùng trên chính danh sách). */
  keepOrder?: boolean;
}

interface SmartShortcutStore {
  /** Hồ sơ của trạng thái + danh sách đang giữ (id hồ sơ hoặc "guest"). */
  profileKey: string;
  state: SmartProfileState;
  /** Đề xuất đang hiện (đã lọc, đã khoá thứ tự). */
  list: SmartCandidate[];
  /** Đề xuất bị lọc ở lần tính gần nhất (gỡ lỗi / test — không hiện cho người học). */
  excluded: SmartResult['excluded'];
  /** Chữ ký dữ liệu của danh sách đang hiện; null = chưa tính cho hồ sơ này. */
  signature: string | null;
  /** `targetKey` đã mở từ đề xuất trong phiên app này (hạ ưu tiên ở lần tính sau). */
  used: Record<string, true>;

  selectProfile: (profileKey: string) => void;
  refresh: (input: SmartInput, manualKeys: ReadonlySet<string>, options?: RefreshOptions) => void;
  dismiss: (candidateKey: string) => void;
  markOpened: (candidateKey: string) => void;
  updateSettings: (patch: SmartSettingsPatch) => void;
  /** Bỏ ẩn mọi đề xuất (không đụng dữ liệu học tập). */
  restoreDismissed: () => void;
}

const browserStorage = (): SmartKeyValueStorage | null => {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
};

const keyOf = (activeId: string | null) => activeId ?? GUEST_PROFILE;

/** Lần tính gần nhất — để tính lại ngay sau khi ẩn / đổi cài đặt mà không cần gom dữ liệu lại. */
let lastArgs: { input: SmartInput; manualKeys: ReadonlySet<string> } | null = null;

export const useSmartShortcuts = create<SmartShortcutStore>((set, get) => {
  const initialKey = keyOf(useProfiles.getState().activeId);
  const persist = (state: SmartProfileState) => {
    saveSmartState(browserStorage(), get().profileKey, state);
    set({ state });
  };
  /** Tính lại với dữ liệu lần trước, giữ thứ tự đang hiện. */
  const rerun = () => {
    if (lastArgs && lastArgs.input.profileId === get().profileKey) get().refresh({ ...lastArgs.input, now: Date.now() }, lastArgs.manualKeys, { keepOrder: true });
  };

  return {
    profileKey: initialKey,
    state: loadSmartState(browserStorage(), initialKey, Date.now()),
    list: [],
    excluded: [],
    signature: null,
    used: {},

    selectProfile: (profileKey) => {
      if (profileKey === get().profileKey && get().signature !== null) return;
      lastArgs = null;
      // Xoá danh sách của hồ sơ cũ NGAY — không bao giờ hiện đề xuất của hồ sơ khác.
      set({ profileKey, state: loadSmartState(browserStorage(), profileKey, Date.now()), list: [], excluded: [], signature: null, used: {} });
    },

    refresh: (input, manualKeys, options = {}) => {
      const s = get();
      if (input.profileId !== s.profileKey) return;
      lastArgs = { input, manualKeys };
      const result = computeSmartShortcuts(input, {
        settings: s.state.settings,
        dismissed: s.state.dismissed,
        manualKeys,
        usedThisSession: new Set(Object.keys(s.used)),
      });
      const signature = smartSignature(input);
      let previous: string[] | null = null;
      let times = { calculatedAt: input.now, expiresAt: result.expiresAt };
      if (options.keepOrder && s.signature !== null) {
        previous = s.list.map((c) => c.candidateKey);
        if (s.state.cache) times = { calculatedAt: s.state.cache.calculatedAt, expiresAt: s.state.cache.expiresAt };
      } else if (s.signature === null && cacheValid(s.state.cache, signature, input.now)) {
        // Mở lại app, dữ liệu không đổi, cache chưa hết hạn → giữ thứ tự đã hiện lần trước.
        previous = s.state.cache.keys;
        times = { calculatedAt: s.state.cache.calculatedAt, expiresAt: s.state.cache.expiresAt };
      }
      const list = stableOrder(result.candidates, previous);
      const state: SmartProfileState = { ...s.state, cache: toCache(signature, list, times.calculatedAt, times.expiresAt) };
      saveSmartState(browserStorage(), s.profileKey, state);
      set({ list, excluded: result.excluded, signature, state });
    },

    dismiss: (candidateKey) => {
      const s = get();
      const c = s.list.find((x) => x.candidateKey === candidateKey);
      if (!c) return;
      set({ list: s.list.filter((x) => x !== c) });
      persist({ ...s.state, dismissed: dismissTarget(s.state.dismissed, c.targetKey, Date.now()) });
      rerun();
    },

    markOpened: (candidateKey) => {
      const c = get().list.find((x) => x.candidateKey === candidateKey);
      if (c) set({ used: { ...get().used, [c.targetKey]: true } });
    },

    updateSettings: (patch) => {
      const s = get().state;
      const settings: SmartSettings = { ...s.settings, ...patch, types: { ...s.settings.types, ...(patch.types ?? {}) } };
      persist({ ...s, settings });
      rerun();
    },

    restoreDismissed: () => {
      persist({ ...get().state, dismissed: {} });
      rerun();
    },
  };
});

// Đổi hồ sơ → trạng thái của hồ sơ đó, danh sách cũ bị xoá ngay (kể cả khi trang chủ không mở).
useProfiles.subscribe((s, prev) => {
  if (s.activeId !== prev.activeId) useSmartShortcuts.getState().selectProfile(keyOf(s.activeId));
});
