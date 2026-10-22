import { useCallback, useSyncExternalStore } from 'react';

/** Safari cũ (trước 16.4) chỉ có API toàn màn hình kèm tiền tố webkit. */
type WebkitDocument = Document & {
  webkitFullscreenElement?: Element | null;
  webkitFullscreenEnabled?: boolean;
  webkitExitFullscreen?: () => Promise<void> | void;
};
type WebkitElement = HTMLElement & { webkitRequestFullscreen?: () => Promise<void> | void };

const doc = document as WebkitDocument;

function fullscreenElement(): Element | null {
  return doc.fullscreenElement ?? doc.webkitFullscreenElement ?? null;
}

function subscribe(cb: () => void): () => void {
  document.addEventListener('fullscreenchange', cb);
  document.addEventListener('webkitfullscreenchange', cb);
  return () => {
    document.removeEventListener('fullscreenchange', cb);
    document.removeEventListener('webkitfullscreenchange', cb);
  };
}

/** Gắn class `is-fullscreen` lên <html> để CSS chừa khoảng trống trên header (xem index.css). */
function syncRootClass(): void {
  document.documentElement.classList.toggle('is-fullscreen', fullscreenElement() !== null);
}
subscribe(syncRootClass);

/** Đã mở dạng app (Thêm vào Màn hình chính) → vốn đã toàn màn hình. */
function isStandalone(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    window.matchMedia('(display-mode: fullscreen)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

/**
 * Bật/tắt toàn màn hình cho cả trang (Fullscreen API).
 * Chrome và Safari iPadOS hỗ trợ; Safari iPhone thì không → `supported = false`, ẩn nút.
 */
export function useFullscreen(): { supported: boolean; active: boolean; toggle: () => void } {
  const active = useSyncExternalStore(subscribe, () => fullscreenElement() !== null);
  const supported = !isStandalone() && (doc.fullscreenEnabled === true || doc.webkitFullscreenEnabled === true);

  const toggle = useCallback(() => {
    // Phải gọi trực tiếp trong handler của thao tác người dùng (Safari yêu cầu).
    try {
      if (fullscreenElement()) {
        void Promise.resolve(doc.exitFullscreen ? doc.exitFullscreen() : doc.webkitExitFullscreen?.()).catch(() => undefined);
      } else {
        const el = document.documentElement as WebkitElement;
        void Promise.resolve(el.requestFullscreen ? el.requestFullscreen() : el.webkitRequestFullscreen?.()).catch(() => undefined);
      }
    } catch {
      // Trình duyệt từ chối: bỏ qua, trang vẫn dùng bình thường.
    }
  }, []);

  return { supported, active, toggle };
}
