/**
 * Nhật ký Biểu diễn — TẠM THỜI (docs/perform-log.md). Một kho cài đặt + một bộ gửi dùng chung cả app.
 * Gỡ tính năng: xoá thư mục này + các chỗ gọi liệt kê trong docs/perform-log.md.
 */
import { PerformLogClient } from './client';
import { isAutomated } from './env';
import { FallbackLogQueue, IndexedDbLogQueue, type LogQueue } from './queue';
import { logEndpoint, PerformLogSettingsStore, type PageInfo } from './settings';

export const performLogSettings = new PerformLogSettingsStore(() => (typeof localStorage !== 'undefined' ? localStorage : null));

function pageInfo(): PageInfo {
  const loc = typeof location !== 'undefined' ? location : null;
  return { origin: loc?.origin ?? '', hostname: loc?.hostname ?? '', base: import.meta.env.BASE_URL };
}

let queue: LogQueue | null = null;

export const performLog = new PerformLogClient({
  queue: () => (queue ??= new FallbackLogQueue(typeof indexedDB !== 'undefined' ? new IndexedDbLogQueue(indexedDB) : null)),
  fetch: () => (typeof fetch === 'function' ? fetch.bind(globalThis) : undefined),
  settings: () => performLogSettings.get(),
  endpoint: (s) => (pageInfo().origin ? logEndpoint(s.url, pageInfo(), isAutomated()) : null),
});

/** Địa chỉ gửi theo cài đặt hiện tại (Cài đặt hiển thị). */
export function currentLogEndpoint(url = performLogSettings.get().url): string | null {
  return pageInfo().origin ? logEndpoint(url, pageInfo(), isAutomated()) : null;
}
