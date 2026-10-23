import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import { App } from './App';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// Service worker: cache toàn bộ app để chạy offline, tự cập nhật khi có bản mới.
// App mở từ Màn hình chính iPad thường chỉ được đánh thức lại chứ không tải lại trang → service worker
// không tự kiểm tra bản mới; nên kiểm tra mỗi khi app quay lại từ nền (bỏ qua nếu đang offline).
if (import.meta.env.PROD) {
  registerSW({
    immediate: true,
    onRegisteredSW(_swUrl, registration) {
      if (!registration) return;
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible' && navigator.onLine) void registration.update().catch(() => undefined);
      });
    },
  });
}
