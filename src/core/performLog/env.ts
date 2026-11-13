/**
 * Nhật ký Biểu diễn (TẠM THỜI, docs/perform-log.md) — thông tin máy / trình duyệt và người chơi cho mỗi dòng log.
 * Chỉ đọc thông tin trình duyệt tự báo (không vân tay thiết bị); thiếu API nào thì ghi giá trị trống.
 */
import type { LogEnv, LogPlayer } from './types';

interface NavigatorLike {
  userAgent?: string;
  platform?: string;
  language?: string;
  maxTouchPoints?: number;
  hardwareConcurrency?: number;
  deviceMemory?: number;
  webdriver?: boolean;
  requestMIDIAccess?: unknown;
  standalone?: boolean;
}

export interface EnvSources {
  navigator?: NavigatorLike;
  screen?: { width: number; height: number };
  window?: { innerWidth: number; innerHeight: number; devicePixelRatio?: number; matchMedia?: (q: string) => { matches: boolean } };
  location?: { origin: string; pathname: string };
}

/** Lấy từ biến toàn cục của trình duyệt (node / test: trống). */
export function browserSources(): EnvSources {
  const g = globalThis as unknown as Partial<{ navigator: NavigatorLike; screen: EnvSources['screen']; window: EnvSources['window']; location: EnvSources['location'] }>;
  return { navigator: g.navigator, screen: g.screen, window: g.window, location: g.location };
}

export function deviceEnv(src: EnvSources = browserSources()): LogEnv {
  const nav = src.navigator ?? {};
  const win = src.window;
  let standalone = nav.standalone === true;
  try {
    standalone ||= !!win?.matchMedia?.('(display-mode: standalone)').matches;
  } catch {
    // matchMedia không có / lỗi.
  }
  let timeZone = '';
  try {
    timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone ?? '';
  } catch {
    timeZone = '';
  }
  const dpr = win?.devicePixelRatio ?? 1;
  return {
    ua: nav.userAgent ?? '',
    platform: nav.platform ?? '',
    language: nav.language ?? '',
    timeZone,
    screen: src.screen ? `${src.screen.width}x${src.screen.height}@${Math.round(dpr * 100) / 100}` : '',
    viewport: win ? `${win.innerWidth}x${win.innerHeight}` : '',
    standalone,
    touchPoints: nav.maxTouchPoints ?? 0,
    cores: nav.hardwareConcurrency ?? null,
    memoryGb: nav.deviceMemory ?? null,
    webMidi: typeof nav.requestMIDIAccess === 'function',
    page: src.location ? `${src.location.origin}${src.location.pathname}` : '',
  };
}

/** Trình duyệt do máy điều khiển (Playwright / WebDriver) — e2e: "auto" không gửi log. */
export function isAutomated(src: EnvSources = browserSources()): boolean {
  return src.navigator?.webdriver === true;
}

export function playerOf(profile: { id: string; name: string; age: number; experience: string } | null): LogPlayer {
  return profile ? { id: profile.id, name: profile.name, age: profile.age, experience: profile.experience } : { id: null, name: null, age: null, experience: null };
}
