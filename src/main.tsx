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
if (import.meta.env.PROD) registerSW({ immediate: true });
