import { afterEach, describe, expect, it, vi } from 'vitest';
import { detectBridgeChannel, NativeBridgeBackend, parseBridgeMessage, type BridgeChannel, type BridgeOutgoing } from './NativeBridgeBackend';
import { MidiEngine } from '../MidiEngine';
import { MemoryDeviceConfigStore } from '../deviceConfigStore';

/** App vỏ giả (vai trò của app iPad Core MIDI). */
function fakeNative(platform = 'ios') {
  const sent: BridgeOutgoing[] = [];
  const listeners = new Set<(m: unknown) => void>();
  const channel: BridgeChannel = {
    platform,
    send: (m) => sent.push(m),
    listen: (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
  };
  const push = (m: unknown) => listeners.forEach((l) => l(m));
  return { channel, sent, push, listeners };
}

afterEach(() => vi.useRealTimers());

describe('parseBridgeMessage', () => {
  it('kiểm tra dữ liệu từ native, chấp nhận chuỗi JSON', () => {
    expect(parseBridgeMessage('{"type":"ports","ports":[{"id":"1","name":"microKEY Air-37","transport":"bluetooth"},{"name":"thiếu id"}]}')).toEqual({
      type: 'ports',
      ports: [{ id: '1', name: 'microKEY Air-37', manufacturer: '', transport: 'bluetooth', state: 'connected' }],
    });
    expect(parseBridgeMessage({ type: 'data', port: '1', bytes: [0x90, 60, 300, 'x', 100], age: 5000 })).toEqual({ type: 'data', port: '1', bytes: [0x90, 60, 100], age: 1000 });
    expect(parseBridgeMessage({ type: 'ports', ports: [{ id: 'a', transport: 'carrier-pigeon' }] })).toMatchObject({ ports: [{ transport: undefined }] });
    expect(parseBridgeMessage('{bad')).toBeNull();
    expect(parseBridgeMessage({ type: 'hello' })).toBeNull();
  });
});

describe('NativeBridgeBackend (Core MIDI Bridge)', () => {
  it('bắt tay: gửi start, chờ danh sách cổng; nốt đi qua MidiEngine như Web MIDI', async () => {
    const native = fakeNative();
    const engine = new MidiEngine(new NativeBridgeBackend(native.channel), { configStore: new MemoryDeviceConfigStore() });
    const ons: number[] = [];
    engine.onNote((e) => ons.push(e.midi));
    const starting = engine.start();
    expect(native.sent).toEqual([{ type: 'start', protocol: 1 }]);
    native.push({ type: 'ports', ports: [{ id: 'usb-1', name: 'Digital Piano', manufacturer: 'Yamaha', transport: 'usb', state: 'connected' }] });
    await starting;
    expect(engine.state.status).toBe('ready');
    expect(engine.portList[0]).toMatchObject({ transport: 'usb', transportGuessed: false });
    // Gói Core MIDI có running status.
    native.push({ type: 'data', port: 'usb-1', bytes: [0x90, 60, 80, 64, 80] });
    expect(ons).toEqual([60, 64]);

    native.push({ type: 'ports', ports: [] });
    expect(engine.hasDevice()).toBe(false);

    await engine.stop();
    expect(native.sent.at(-1)).toEqual({ type: 'stop' });
    expect(native.listeners.size).toBe(0);
  });

  it('app vỏ không trả lời → lỗi sau thời gian chờ', async () => {
    vi.useFakeTimers();
    const native = fakeNative();
    const engine = new MidiEngine(new NativeBridgeBackend(native.channel, 100), { configStore: new MemoryDeviceConfigStore(), retryDelays: [] });
    const starting = engine.start();
    await vi.advanceTimersByTimeAsync(150);
    await starting;
    expect(engine.state.status).toBe('error');
    expect(engine.state.error).toMatch(/không phản hồi/);
  });

  it('native báo lỗi quyền lúc bắt tay → denied; lỗi sau khi chạy → engine mất kết nối', async () => {
    const native = fakeNative();
    const engine = new MidiEngine(new NativeBridgeBackend(native.channel), { configStore: new MemoryDeviceConfigStore(), retryDelays: [] });
    const starting = engine.start();
    native.push({ type: 'error', message: 'Bluetooth permission denied' });
    await starting;
    expect(engine.state.status).toBe('denied');

    const native2 = fakeNative();
    const engine2 = new MidiEngine(new NativeBridgeBackend(native2.channel), { configStore: new MemoryDeviceConfigStore(), retryDelays: [] });
    const s2 = engine2.start();
    native2.push({ type: 'ports', ports: [] });
    await s2;
    native2.push({ type: 'error', message: 'MIDI server crashed' });
    expect(engine2.state).toMatchObject({ status: 'error' });
  });

  it('ghép Bluetooth và quét lại gửi lệnh tới app vỏ', async () => {
    const native = fakeNative();
    const backend = new NativeBridgeBackend(native.channel);
    const engine = new MidiEngine(backend, { configStore: new MemoryDeviceConfigStore() });
    const s = engine.start();
    native.push({ type: 'ports', ports: [] });
    await s;
    expect(engine.canPairBluetooth()).toBe(true);
    engine.pairBluetooth();
    engine.refresh();
    expect(native.sent.slice(1)).toEqual([{ type: 'pairBluetooth' }, { type: 'refresh' }]);
    expect(backend.label).toMatch(/Core MIDI/);
  });
});

describe('detectBridgeChannel', () => {
  it('trình duyệt thường (không có cờ của app vỏ) → null', () => {
    expect(detectBridgeChannel({})).toBeNull();
    expect(detectBridgeChannel({ webkit: { messageHandlers: { vietpianoMidi: { postMessage: () => undefined } } } })).toBeNull();
    expect(detectBridgeChannel(undefined)).toBeNull();
  });

  it('WKWebView: gửi qua messageHandlers, nhận qua window.vietpianoMidiBridge.receive', () => {
    const posted: unknown[] = [];
    const w: Parameters<typeof detectBridgeChannel>[0] = {
      __VIETPIANO_NATIVE_MIDI__: { protocol: 1, platform: 'ios' },
      webkit: { messageHandlers: { vietpianoMidi: { postMessage: (m) => posted.push(m) } } },
    };
    const ch = detectBridgeChannel(w)!;
    expect(ch.platform).toBe('ios');
    const got: unknown[] = [];
    ch.listen((m) => got.push(m));
    ch.send({ type: 'refresh' });
    w!.vietpianoMidiBridge!.receive({ type: 'ports', ports: [] });
    expect(posted).toEqual([{ type: 'refresh' }]);
    expect(got).toEqual([{ type: 'ports', ports: [] }]);
  });

  it('WebView2 (Windows native): chrome.webview', () => {
    const handlers = new Set<(e: { data: unknown }) => void>();
    const posted: unknown[] = [];
    const ch = detectBridgeChannel({
      __VIETPIANO_NATIVE_MIDI__: { protocol: 1 },
      chrome: {
        webview: {
          postMessage: (m) => posted.push(m),
          addEventListener: (_t, cb) => handlers.add(cb),
          removeEventListener: (_t, cb) => handlers.delete(cb),
        },
      },
    })!;
    expect(ch.platform).toBe('windows');
    const got: unknown[] = [];
    const off = ch.listen((m) => got.push(m));
    handlers.forEach((h) => h({ data: 'x' }));
    off();
    expect(handlers.size).toBe(0);
    expect(got).toEqual(['x']);
  });

  it('giao thức mới hơn bản app hiểu → không dùng', () => {
    expect(detectBridgeChannel({ __VIETPIANO_NATIVE_MIDI__: { protocol: 2 }, webkit: { messageHandlers: { vietpianoMidi: { postMessage: () => undefined } } } })).toBeNull();
  });
});
