/**
 * Tải lại cứng (giống Ctrl+F5): gỡ service worker + xoá Cache Storage rồi tải lại trang từ mạng,
 * để chắc chắn chạy bản mới nhất. KHÔNG đụng tới IndexedDB/localStorage (tiến độ, cài đặt, hồ sơ).
 * Offline thì không xoá cache (xoá rồi sẽ không mở lại được app) — chỉ tải lại thường.
 */
export async function hardReload(): Promise<void> {
  if (navigator.onLine) {
    try {
      if ('serviceWorker' in navigator) {
        const registrations = await navigator.serviceWorker.getRegistrations();
        await Promise.all(registrations.map((r) => r.unregister()));
      }
      if ('caches' in window) {
        const keys = await caches.keys();
        await Promise.all(keys.map((k) => caches.delete(k)));
      }
      // Làm mới cả HTTP cache của trang HTML (asset có hash trong tên nên không cần).
      await fetch(location.href, { cache: 'reload' }).catch(() => undefined);
    } catch {
      // Lỗi dọn dẹp vẫn tải lại trang.
    }
  }
  location.reload();
}
