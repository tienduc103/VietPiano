/**
 * Adapter cầu nối native: VietPiano (giữ nguyên web app) chạy trong một app vỏ mỏng, app vỏ đọc MIDI bằng API
 * của hệ điều hành rồi đẩy byte thô vào trang qua kênh tin nhắn của WebView.
 *
 * - iPadOS: app SwiftUI + WKWebView + Core MIDI (USB qua cổng USB-C / Lightning camera kit, Bluetooth LE MIDI
 *   ghép bằng CABTMIDICentralViewController, MIDI mạng). Kênh: `window.webkit.messageHandlers.vietpianoMidi`.
 * - Windows (khi cần thay Web MIDI, vd driver chỉ có ở Windows MIDI Services / WinRT BLE): app WebView2.
 *   Kênh: `window.chrome.webview`.
 *
 * App vỏ báo có cầu nối bằng cách tiêm `window.__VIETPIANO_NATIVE_MIDI__ = { protocol: 1, platform }` lúc tải trang.
 * Giao thức (JSON, phiên bản 1) — đặc tả đầy đủ ở docs/midi.md:
 *   web → native: { type: 'start', protocol: 1 } | { type: 'stop' } | { type: 'refresh' } | { type: 'pairBluetooth' }
 *   native → web: { type: 'ports', ports: [{ id, name, manufacturer, transport, state }] }
 *                 { type: 'data', port, bytes: number[], age?: ms kể từ lúc nhận } | { type: 'error', message }
 * Native gọi `window.vietpianoMidiBridge.receive(msg)` (WKWebView) hoặc `PostWebMessageAsJson` (WebView2).
 */
import type { MidiTransport } from '../deviceProfiles';
import type { MidiBackend, MidiBackendHandlers, MidiBackendSession, MidiPortDescriptor } from './types';

export const BRIDGE_PROTOCOL = 1;
const HANDSHAKE_TIMEOUT_MS = 3000;

export type BridgeOutgoing = { type: 'start'; protocol: number } | { type: 'stop' } | { type: 'refresh' } | { type: 'pairBluetooth' };

/** Kênh hai chiều với app vỏ; test dùng kênh giả. */
export interface BridgeChannel {
  readonly platform: string;
  send(msg: BridgeOutgoing): void;
  /** Đăng ký nhận tin; trả hàm huỷ. */
  listen(cb: (msg: unknown) => void): () => void;
}

const TRANSPORTS = new Set<MidiTransport>(['usb', 'bluetooth', 'network', 'virtual', 'simulated', 'os']);

/** Kiểm tra tin từ native — dữ liệu từ ngoài trang, không tin tưởng mù quáng. */
export function parseBridgeMessage(raw: unknown):
  | { type: 'ports'; ports: MidiPortDescriptor[] }
  | { type: 'data'; port: string; bytes: number[]; age: number }
  | { type: 'error'; message: string }
  | null {
  const msg = typeof raw === 'string' ? safeJson(raw) : raw;
  if (!msg || typeof msg !== 'object') return null;
  const m = msg as Record<string, unknown>;
  if (m.type === 'ports' && Array.isArray(m.ports)) {
    const ports: MidiPortDescriptor[] = [];
    for (const p of m.ports as unknown[]) {
      if (!p || typeof p !== 'object') continue;
      const r = p as Record<string, unknown>;
      if (typeof r.id !== 'string' || !r.id) continue;
      ports.push({
        id: r.id,
        name: typeof r.name === 'string' && r.name ? r.name.slice(0, 120) : 'Thiết bị MIDI',
        manufacturer: typeof r.manufacturer === 'string' ? r.manufacturer.slice(0, 120) : '',
        transport: TRANSPORTS.has(r.transport as MidiTransport) ? (r.transport as MidiTransport) : undefined,
        state: r.state === 'disconnected' ? 'disconnected' : 'connected',
      });
    }
    return { type: 'ports', ports };
  }
  if (m.type === 'data' && typeof m.port === 'string' && Array.isArray(m.bytes)) {
    const bytes = (m.bytes as unknown[]).filter((b): b is number => typeof b === 'number' && b >= 0 && b <= 255).slice(0, 1024);
    const age = typeof m.age === 'number' && Number.isFinite(m.age) ? Math.min(1000, Math.max(0, m.age)) : 0;
    return { type: 'data', port: m.port, bytes, age };
  }
  if (m.type === 'error') return { type: 'error', message: typeof m.message === 'string' ? m.message.slice(0, 300) : 'Lỗi cầu nối MIDI' };
  return null;
}

function safeJson(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

export class NativeBridgeBackend implements MidiBackend {
  readonly kind = 'native-bridge' as const;
  readonly label: string;

  constructor(
    private readonly channel: BridgeChannel,
    private readonly handshakeMs = HANDSHAKE_TIMEOUT_MS,
  ) {
    this.label = channel.platform === 'ios' ? 'Core MIDI (app VietPiano cho iPad)' : `MIDI native (${channel.platform})`;
  }

  pairBluetooth(): void {
    this.channel.send({ type: 'pairBluetooth' });
  }

  open(handlers: MidiBackendHandlers): Promise<MidiBackendSession> {
    return new Promise((resolve, reject) => {
      let ready = false;
      let closed = false;
      let off: () => void = () => undefined;
      const session: MidiBackendSession = {
        refresh: () => this.channel.send({ type: 'refresh' }),
        close: () => {
          if (closed) return;
          closed = true;
          off();
          this.channel.send({ type: 'stop' });
        },
      };
      const timer = setTimeout(() => {
        if (ready) return;
        session.close();
        reject(new Error('Ứng dụng VietPiano không phản hồi cầu nối MIDI.'));
      }, this.handshakeMs);
      off = this.channel.listen((raw) => {
        if (closed) return;
        const msg = parseBridgeMessage(raw);
        if (!msg) return;
        if (msg.type === 'error') {
          if (!ready) {
            clearTimeout(timer);
            session.close();
            const err = new Error(msg.message);
            if (/quyền|permission|denied/i.test(msg.message)) err.name = 'NotAllowedError';
            reject(err);
          } else handlers.onError?.(new Error(msg.message));
          return;
        }
        if (msg.type === 'ports') {
          handlers.onPorts(msg.ports);
          if (!ready) {
            ready = true;
            clearTimeout(timer);
            resolve(session);
          }
          return;
        }
        if (ready) handlers.onData(msg.port, msg.bytes, now() - msg.age);
      });
      this.channel.send({ type: 'start', protocol: BRIDGE_PROTOCOL });
    });
  }
}

// ——— Phát hiện kênh trong WebView ———

interface NativeFlag {
  protocol?: number;
  platform?: string;
}

type Listener = (msg: unknown) => void;

interface BridgeWindow {
  __VIETPIANO_NATIVE_MIDI__?: NativeFlag;
  vietpianoMidiBridge?: { receive(msg: unknown): void };
  webkit?: { messageHandlers?: Record<string, { postMessage(msg: unknown): void } | undefined> };
  chrome?: { webview?: { postMessage(msg: unknown): void; addEventListener(t: 'message', cb: (e: { data: unknown }) => void): void; removeEventListener(t: 'message', cb: (e: { data: unknown }) => void): void } };
}

/** Kênh tới app vỏ nếu trang đang chạy trong app VietPiano native; trình duyệt thường → null. */
export function detectBridgeChannel(w: BridgeWindow | undefined = typeof window === 'undefined' ? undefined : (window as unknown as BridgeWindow)): BridgeChannel | null {
  const flag = w?.__VIETPIANO_NATIVE_MIDI__;
  if (!w || !flag || (flag.protocol ?? BRIDGE_PROTOCOL) > BRIDGE_PROTOCOL) return null;
  const wk = w.webkit?.messageHandlers?.vietpianoMidi;
  if (wk) {
    const listeners = new Set<Listener>();
    w.vietpianoMidiBridge = { receive: (msg) => listeners.forEach((l) => l(msg)) };
    return {
      platform: flag.platform ?? 'ios',
      send: (msg) => wk.postMessage(msg),
      listen: (cb) => {
        listeners.add(cb);
        return () => listeners.delete(cb);
      },
    };
  }
  const wv = w.chrome?.webview;
  if (wv) {
    return {
      platform: flag.platform ?? 'windows',
      send: (msg) => wv.postMessage(msg),
      listen: (cb) => {
        const h = (e: { data: unknown }) => cb(e.data);
        wv.addEventListener('message', h);
        return () => wv.removeEventListener('message', h);
      },
    };
  }
  return null;
}
