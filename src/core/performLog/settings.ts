/**
 * Nhật ký Biểu diễn (TẠM THỜI, docs/perform-log.md) — cài đặt riêng của máy này, localStorage khoá
 * `vietpiano.performLog.v1` (tách khỏi DeviceSettings để gỡ tính năng không đụng cài đặt chung).
 *  - `enabled`: ghi nhật ký (mặc định bật).
 *  - `url`: nơi gửi — "auto" = máy chủ đang phục vụ app (`npm run dev` / `dev:https` / `serve:lan` có sẵn máy ghi
 *    `<base>__vplog`); hoặc máy ghi riêng `npm run perflog` (`http://<IP máy tính>:8790`) cho trang GitHub Pages.
 *  - `deviceId`: mã ngẫu nhiên cố định của trình duyệt trên máy này; `deviceName`: tên dễ nhớ ("iPad của bé An").
 */

export interface PerformLogSettings {
  enabled: boolean;
  url: string;
  deviceId: string;
  deviceName: string;
}

export const AUTO_LOG_URL = 'auto';
export const PERFORM_LOG_SETTINGS_KEY = 'vietpiano.performLog.v1';
/** Đường dẫn máy ghi (cùng ở plugin vite và `npm run perflog`). */
export const LOG_PATH = '__vplog';
/** Cổng mặc định của `npm run perflog`. */
export const DEFAULT_COLLECTOR_PORT = 8790;
export const MAX_DEVICE_NAME = 40;

type KeyValueStorage = Pick<Storage, 'getItem' | 'setItem'>;

/** Mã ngẫu nhiên (không lấy từ phần cứng). */
export function randomId(length = 8): string {
  const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789';
  const bytes = new Uint8Array(length);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) crypto.getRandomValues(bytes);
  else for (let i = 0; i < length; i++) bytes[i] = Math.floor(Math.random() * 256);
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('');
}

/**
 * Chuẩn hoá địa chỉ máy ghi: rỗng / "auto" → auto; thiếu giao thức → http://; bỏ "/" cuối và "/__vplog";
 * chỉ có IP / tên máy (không cổng, không đường dẫn) → thêm cổng mặc định của `npm run perflog`.
 */
export function normalizeLogUrl(raw: string): string {
  const s = raw.trim();
  if (!s || s.toLowerCase() === AUTO_LOG_URL) return AUTO_LOG_URL;
  let u = (/^https?:\/\//i.test(s) ? s : `http://${s}`).replace(/\/+$/, '');
  if (u.endsWith(`/${LOG_PATH}`)) u = u.slice(0, -(LOG_PATH.length + 1));
  try {
    const parsed = new URL(u);
    if (!parsed.port && parsed.pathname === '/' && parsed.protocol === 'http:') parsed.port = String(DEFAULT_COLLECTOR_PORT);
    return parsed.toString().replace(/\/+$/, '');
  } catch {
    return u;
  }
}

export function sanitizeSettings(raw: unknown): PerformLogSettings {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Partial<Record<keyof PerformLogSettings, unknown>>;
  return {
    enabled: typeof o.enabled === 'boolean' ? o.enabled : true,
    url: typeof o.url === 'string' ? normalizeLogUrl(o.url) : AUTO_LOG_URL,
    deviceId: typeof o.deviceId === 'string' && /^[a-z0-9-]{4,40}$/.test(o.deviceId) ? o.deviceId : `d-${randomId()}`,
    deviceName: typeof o.deviceName === 'string' ? o.deviceName.replace(/\s+/g, ' ').trim().slice(0, MAX_DEVICE_NAME) : '',
  };
}

/** Kho cài đặt (đọc một lần, lưu mỗi lần đổi, báo người nghe). `storage` null = chỉ trong bộ nhớ. */
export class PerformLogSettingsStore {
  private value: PerformLogSettings | null = null;
  private readonly listeners = new Set<() => void>();

  constructor(private readonly storage: () => KeyValueStorage | null) {}

  get(): PerformLogSettings {
    if (this.value) return this.value;
    let raw: unknown = null;
    const st = this.safeStorage();
    try {
      raw = JSON.parse(st?.getItem(PERFORM_LOG_SETTINGS_KEY) ?? 'null');
    } catch {
      raw = null;
    }
    this.value = sanitizeSettings(raw);
    // Lưu ngay để mã máy không đổi giữa các lần mở app.
    if (!raw || (raw as { deviceId?: unknown }).deviceId !== this.value.deviceId) this.save();
    return this.value;
  }

  update(patch: Partial<Omit<PerformLogSettings, 'deviceId'>>): PerformLogSettings {
    this.value = sanitizeSettings({ ...this.get(), ...patch });
    this.save();
    this.listeners.forEach((l) => l());
    return this.value;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private safeStorage(): KeyValueStorage | null {
    try {
      return this.storage();
    } catch {
      return null;
    }
  }

  private save(): void {
    try {
      this.safeStorage()?.setItem(PERFORM_LOG_SETTINGS_KEY, JSON.stringify(this.value));
    } catch {
      // Safari riêng tư / hết chỗ: vẫn chạy với cài đặt trong bộ nhớ.
    }
  }
}

export interface PageInfo {
  origin: string;
  hostname: string;
  /** `import.meta.env.BASE_URL` ("/" hoặc "/VietPiano/"). */
  base: string;
}

/**
 * Địa chỉ gửi log; null = không gửi (chỉ lưu trên máy, tải file ở Cài đặt).
 * "auto": server của app — trừ GitHub Pages (trang tĩnh, không có máy ghi) và trình duyệt tự động
 * (Playwright / WebDriver: e2e mở app hàng trăm lần, không ghi vào log thật).
 */
export function logEndpoint(url: string, page: PageInfo, automated: boolean): string | null {
  if (url === AUTO_LOG_URL) {
    if (automated || /\.github\.io$/i.test(page.hostname)) return null;
    return `${page.origin}${page.base.replace(/\/*$/, '/')}${LOG_PATH}`;
  }
  return `${url.replace(/\/+$/, '')}/${LOG_PATH}`;
}
