/**
 * Cài đặt Lối tắt thông minh + đề xuất đã ẩn + cache thứ tự — RIÊNG từng hồ sơ (localStorage, khoá có profile ID).
 *
 * Tách hẳn khỏi kho lối tắt thủ công (`vietpiano.shortcuts.v1:<hồ sơ>`): tắt / xoá dữ liệu ở đây không đụng tới lối tắt
 * thủ công, và ẩn một đề xuất KHÔNG xoá bài học hay dữ liệu học tập nào.
 */
import { SMART_TYPES, type SmartType } from './types';

export interface SmartSettings {
  /** Bật Lối tắt thông minh (tắt → thanh chỉ còn lối tắt thủ công). */
  enabled: boolean;
  /** Cho đề xuất ưu tiên cao nhất lên thanh hồ sơ khi còn chỗ (tắt → chỉ trong menu ⋯). */
  showOnBar: boolean;
  types: Record<SmartType, boolean>;
  /** Cho AI cục bộ sắp xếp lại / viết lý do (điểm mở rộng P8 — chưa có trong bản này, luôn chạy theo quy tắc). */
  aiAssist: boolean;
}

export const DEFAULT_SMART_SETTINGS: SmartSettings = {
  enabled: true,
  showOnBar: true,
  types: { continue: true, weakness: true, review: true, practice: true, game: true, frequent: true },
  aiAssist: false,
};

/** Ẩn một đề xuất: không đề xuất lại nội dung đó trong bấy nhiêu ngày. */
export const DISMISS_DAYS = 7;
const DAY_MS = 86_400_000;
/** Giới hạn an toàn cho bộ nhớ trình duyệt. */
const MAX_DISMISSALS = 200;
const MAX_CACHE_KEYS = 20;

/** Khoá đích (`targetKey`) → ẩn tới thời điểm này (epoch ms). */
export type Dismissals = Record<string, number>;

/** Thứ tự đã hiện lần trước — giữ vị trí ổn định khi dữ liệu không đổi (stability.ts). */
export interface SmartCache {
  signature: string;
  calculatedAt: number;
  expiresAt: number;
  /** `candidateKey` theo thứ tự đã hiện. */
  keys: string[];
}

export interface SmartProfileState {
  settings: SmartSettings;
  dismissed: Dismissals;
  cache: SmartCache | null;
}

export const emptySmartState = (): SmartProfileState => ({ settings: cloneSettings(DEFAULT_SMART_SETTINGS), dismissed: {}, cache: null });

function cloneSettings(s: SmartSettings): SmartSettings {
  return { ...s, types: { ...s.types } };
}

export function sanitizeSmartSettings(raw: unknown): SmartSettings {
  const out = cloneSettings(DEFAULT_SMART_SETTINGS);
  if (!raw || typeof raw !== 'object') return out;
  const r = raw as Record<string, unknown>;
  if (typeof r.enabled === 'boolean') out.enabled = r.enabled;
  if (typeof r.showOnBar === 'boolean') out.showOnBar = r.showOnBar;
  if (typeof r.aiAssist === 'boolean') out.aiAssist = r.aiAssist;
  const types = r.types && typeof r.types === 'object' ? (r.types as Record<string, unknown>) : {};
  for (const t of SMART_TYPES) if (typeof types[t] === 'boolean') out.types[t] = types[t] as boolean;
  return out;
}

const isKey = (k: string) => k.length > 0 && k.length <= 300;

/** Bỏ mục hỏng / đã hết hạn; giữ tối đa MAX_DISMISSALS mục hết hạn muộn nhất. */
export function sanitizeDismissals(raw: unknown, now: number): Dismissals {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const entries = Object.entries(raw as Record<string, unknown>).filter(
    (e): e is [string, number] => isKey(e[0]) && typeof e[1] === 'number' && Number.isFinite(e[1]) && e[1] > now,
  );
  entries.sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  return Object.fromEntries(entries.slice(0, MAX_DISMISSALS));
}

export function sanitizeCache(raw: unknown): SmartCache | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
  const calculatedAt = num(r.calculatedAt);
  const expiresAt = num(r.expiresAt);
  if (typeof r.signature !== 'string' || calculatedAt === null || expiresAt === null || !Array.isArray(r.keys)) return null;
  const keys = [...new Set(r.keys.filter((k): k is string => typeof k === 'string' && isKey(k)))].slice(0, MAX_CACHE_KEYS);
  return { signature: r.signature.slice(0, 2000), calculatedAt, expiresAt, keys };
}

export function sanitizeSmartState(raw: unknown, now: number): SmartProfileState {
  const r = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  return { settings: sanitizeSmartSettings(r.settings), dismissed: sanitizeDismissals(r.dismissed, now), cache: sanitizeCache(r.cache) };
}

/** Ẩn đề xuất tới `now + days` (ẩn lại khi đang ẩn → tính lại từ bây giờ). */
export function dismiss(d: Dismissals, targetKey: string, now: number, days = DISMISS_DAYS): Dismissals {
  return { ...d, [targetKey]: now + days * DAY_MS };
}

export function isDismissed(d: Dismissals, targetKey: string, now: number): boolean {
  return (d[targetKey] ?? 0) > now;
}

/** Số đề xuất đang bị ẩn. */
export function dismissedCount(d: Dismissals, now: number): number {
  return Object.values(d).filter((until) => until > now).length;
}

// ─── Lưu theo hồ sơ ─────────────────────────────────────────────────────────────────────────────

export const SMART_STORAGE_VERSION = 1;
export const smartStorageKey = (profileKey: string) => `vietpiano.smart-shortcuts.v${SMART_STORAGE_VERSION}:${profileKey}`;

export type SmartKeyValueStorage = Pick<Storage, 'getItem' | 'setItem'>;

/** Đọc trạng thái của MỘT hồ sơ; bộ nhớ bị chặn / hỏng → mặc định (bật, đủ loại gợi ý). */
export function loadSmartState(storage: SmartKeyValueStorage | null, profileKey: string, now: number): SmartProfileState {
  if (!storage) return emptySmartState();
  try {
    const raw = storage.getItem(smartStorageKey(profileKey));
    return raw ? sanitizeSmartState(JSON.parse(raw), now) : emptySmartState();
  } catch {
    return emptySmartState();
  }
}

export function saveSmartState(storage: SmartKeyValueStorage | null, profileKey: string, state: SmartProfileState): boolean {
  if (!storage) return false;
  try {
    storage.setItem(smartStorageKey(profileKey), JSON.stringify({ v: SMART_STORAGE_VERSION, ...state }));
    return true;
  } catch {
    return false;
  }
}
