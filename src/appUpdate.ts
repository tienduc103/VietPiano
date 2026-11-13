/**
 * Kiểm tra bản mới nhất trên server: `<base>version.json` sinh lúc build (vite.config.ts), KHÔNG nằm trong
 * precache của service worker → luôn đọc từ mạng. So với phiên bản đang chạy (`__APP_VERSION__`).
 */
export type UpdateCheck =
  | { status: 'latest' }
  | { status: 'available'; version: string }
  | { status: 'offline' }
  | { status: 'error' };

export async function checkForUpdate(
  current: string,
  url: string,
  fetchFn: typeof fetch = fetch,
  online: boolean = typeof navigator === 'undefined' ? true : navigator.onLine,
): Promise<UpdateCheck> {
  if (!online) return { status: 'offline' };
  try {
    const res = await fetchFn(`${url}?t=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) return { status: 'error' };
    const data: unknown = await res.json();
    const version = (data as { version?: unknown } | null)?.version;
    if (typeof version !== 'string' || !version.trim()) return { status: 'error' };
    return version.trim() === current ? { status: 'latest' } : { status: 'available', version: version.trim() };
  } catch {
    return { status: 'error' };
  }
}
