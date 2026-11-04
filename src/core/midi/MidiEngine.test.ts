import { describe, expect, it, vi } from 'vitest';
import type { NoteInputEvent, NoteOffEvent } from '../input/NoteInputProvider';
import { MidiEngine, type MidiDetailEvent, type PedalInputEvent, type Timers } from './MidiEngine';
import { SimulatedMidiBackend } from './backends/SimulatedMidiBackend';
import { CompositeBackend } from './backends/CompositeBackend';
import { LocalDeviceConfigStore, MemoryDeviceConfigStore, deviceKey } from './deviceConfigStore';
import type { MidiBackend } from './backends/types';
import { DEFAULT_DEVICE_CONFIG } from './deviceConfig';

function setup(opts: { store?: MemoryDeviceConfigStore; timers?: Timers; retryDelays?: number[] } = {}) {
  const sim = new SimulatedMidiBackend();
  const engine = new MidiEngine(sim, { configStore: opts.store ?? new MemoryDeviceConfigStore(), timers: opts.timers, retryDelays: opts.retryDelays });
  const ons: NoteInputEvent[] = [];
  const offs: NoteOffEvent[] = [];
  const pedals: PedalInputEvent[] = [];
  const details: MidiDetailEvent[] = [];
  engine.onNote((e) => ons.push(e));
  engine.onNoteOff((e) => offs.push(e));
  engine.onPedal((e) => pedals.push(e));
  engine.onDetail((e) => details.push(e));
  return { sim, engine, ons, offs, pedals, details };
}

describe('MidiEngine — thiết bị mô phỏng', () => {
  it('nhiều hãng cùng lúc: mọi thiết bị đi qua cùng một đường, sự kiện chuẩn hoá', async () => {
    const { sim, engine, ons, offs } = setup();
    const korg = sim.connect({ id: 'k', name: 'microKEY2-37', manufacturer: 'KORG INC.', transport: 'usb' });
    const yamaha = sim.connect({ id: 'y', name: 'Digital Piano', manufacturer: 'Yamaha Corporation', transport: 'usb' });
    const roland = sim.connect({ id: 'r', name: 'FP-30X', manufacturer: 'Roland', transport: 'bluetooth' });
    await engine.start();
    expect(engine.state.status).toBe('ready');
    expect(engine.state.devices.map((d) => d.name)).toEqual(['microKEY2-37', 'Digital Piano', 'FP-30X']);
    expect(engine.portList.find((p) => p.id === 'r')).toMatchObject({ transport: 'bluetooth', transportGuessed: false, profile: { brand: 'roland' } });

    sim.noteOn(korg, 60, 100, 0, 10);
    sim.noteOn(yamaha, 64, 50, 3, 20);
    sim.noteOn(roland, 67, 1, 15, 30);
    sim.noteOff(korg, 60, 0, 40);
    expect(ons).toEqual([
      { midi: 60, time: 10, source: 'midi', velocity: 100 },
      { midi: 64, time: 20, source: 'midi', velocity: 50 },
      { midi: 67, time: 30, source: 'midi', velocity: 1 },
    ]);
    expect(offs).toEqual([{ midi: 60, time: 40, source: 'midi' }]);
  });

  it('running status trong một gói (cầu nối native) → đủ từng nốt', async () => {
    const { sim, engine, ons, offs } = setup();
    const id = sim.connect({ name: 'Bridge piano' });
    await engine.start();
    sim.send(id, [0x90, 60, 90, 62, 80, 60, 0], 5);
    expect(ons.map((e) => e.midi)).toEqual([60, 62]);
    expect(offs.map((e) => e.midi)).toEqual([60]);
  });

  it('quãng tám + transpose + lọc kênh + đường cong lực gõ áp vào sự kiện', async () => {
    const { sim, engine, ons } = setup();
    const id = sim.connect({ id: 'a', name: 'microKEY2-25' });
    await engine.start();
    engine.updateConfig('a', { octave: 1, transpose: -1, channel: 2, velocityCurve: 'fixed' });
    sim.noteOn(id, 60, 30, 1); // kênh 2
    sim.noteOn(id, 62, 30, 0); // kênh 1 → bỏ
    expect(ons.map((e) => [e.midi, e.velocity])).toEqual([[71, 100]]);
  });

  it('Note Off khớp nốt đã phát dù đổi transpose giữa chừng; đổi cấu hình thì thả phím đang giữ', async () => {
    const { sim, engine, offs } = setup();
    const id = sim.connect({ id: 'a', name: 'Piano' });
    await engine.start();
    sim.noteOn(id, 60);
    engine.updateConfig('a', { transpose: 5 });
    expect(offs.map((e) => e.midi)).toEqual([60]); // thả khi đổi cấu hình
    sim.noteOn(id, 60);
    sim.noteOff(id, 60);
    expect(offs.map((e) => e.midi)).toEqual([60, 65]);
  });

  it('Note Off không có Note On trước (vd đàn gửi cả 0x80 và 0x90 v0) vẫn phát như cũ', async () => {
    const { sim, engine, offs } = setup();
    const id = sim.connect({ name: 'Piano' });
    await engine.start();
    sim.noteOff(id, 62, 0, 1);
    expect(offs).toEqual([{ midi: 62, time: 1, source: 'midi' }]);
  });

  it('pedal vang: chỉ phát khi đổi trạng thái (đàn half-pedal gửi giá trị liên tục)', async () => {
    const { sim, engine, pedals } = setup();
    const id = sim.connect({ name: 'Piano' });
    await engine.start();
    for (const [v, t] of [[20, 1], [70, 2], [100, 3], [127, 4], [40, 5], [0, 6]]) sim.send(id, [0xb0, 64, v], t);
    expect(pedals).toEqual([
      { down: true, time: 2 },
      { down: false, time: 5 },
    ]);
  });

  it('All Notes Off (CC 123) thả các phím đang giữ của kênh đó', async () => {
    const { sim, engine, offs } = setup();
    const id = sim.connect({ name: 'Piano' });
    await engine.start();
    sim.noteOn(id, 60, 90, 0);
    sim.noteOn(id, 64, 90, 1);
    sim.send(id, [0xb0, 123, 0], 9);
    expect(offs.map((e) => e.midi)).toEqual([60]);
  });

  it('tắt thiết bị: không còn sự kiện nốt, không tính là đàn đang nối (app quay về micro); bảng tín hiệu vẫn thấy', async () => {
    const { sim, engine, ons, details } = setup();
    const id = sim.connect({ id: 'a', name: 'Pad controller' });
    await engine.start();
    engine.updateConfig('a', { enabled: false });
    expect(engine.hasDevice()).toBe(false);
    sim.noteOn(id, 60);
    expect(ons).toEqual([]);
    expect(details.at(-1)).toMatchObject({ type: 'message', accepted: false });
  });

  it('rút đàn khi đang giữ phím + đạp pedal → thả hết (không kẹt nốt); cắm lại → dùng lại được', async () => {
    const { sim, engine, ons, offs, pedals } = setup();
    const id = sim.connect({ id: 'a', name: 'microKEY Air-49', transport: 'bluetooth' });
    await engine.start();
    sim.noteOn(id, 60);
    sim.sustain(id, true);
    sim.disconnect(id);
    expect(offs.map((e) => e.midi)).toEqual([60]);
    expect(pedals.at(-1)?.down).toBe(false);
    expect(engine.hasDevice()).toBe(false);
    expect(engine.portList[0]).toMatchObject({ id: 'a', connected: false });

    sim.connect({ id: 'a', name: 'microKEY Air-49', transport: 'bluetooth' });
    expect(engine.hasDevice()).toBe(true);
    sim.noteOn(id, 62);
    expect(ons.map((e) => e.midi)).toEqual([60, 62]);
  });

  it('cắm lại với id mới (Windows) → bỏ bản ghi cũ, giữ cấu hình theo tên', async () => {
    const store = new MemoryDeviceConfigStore();
    const { sim, engine } = setup({ store });
    sim.connect({ id: 'input-0', name: 'microKEY2-37', manufacturer: 'KORG INC.' });
    await engine.start();
    engine.updateConfig('input-0', { octave: -1 });
    sim.disconnect('input-0');
    sim.remove('input-0');
    sim.connect({ id: 'input-3', name: '2- microKEY2-37', manufacturer: 'KORG INC.' });
    expect(engine.portList.map((p) => p.id)).toEqual(['input-3']);
    expect(engine.portList[0].config.octave).toBe(-1);
    expect(store.load(deviceKey('microKEY2-37', 'KORG INC.'))?.octave).toBe(-1);
  });

  it('cấu hình lưu localStorage, mở lại app vẫn nhớ; dữ liệu hỏng không làm lỗi', () => {
    const data = new Map<string, string>();
    const kv = { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v) };
    new LocalDeviceConfigStore(kv).save('a|', { ...DEFAULT_DEVICE_CONFIG, keyCount: 25, transpose: 2, sound: 'on' });
    expect(new LocalDeviceConfigStore(kv).load('a|')).toMatchObject({ keyCount: 25, transpose: 2, sound: 'on' });
    data.set('vietpiano.midiDevices.v1', '{oops');
    expect(new LocalDeviceConfigStore(kv).load('a|')).toBeUndefined();
  });

  it('stop: thả phím đang giữ, không nhận nốt nữa; quên thiết bị đã rút', async () => {
    const { sim, engine, ons, offs } = setup();
    const id = sim.connect({ id: 'a', name: 'Piano' });
    await engine.start();
    sim.noteOn(id, 60);
    await engine.stop();
    expect(offs.map((e) => e.midi)).toEqual([60]);
    sim.noteOn(id, 61);
    expect(ons.map((e) => e.midi)).toEqual([60]);
    expect(engine.state).toEqual({ status: 'idle', devices: [], error: null });
    engine.forget('a');
    expect(engine.portList).toEqual([]);
  });

  it('reconnect: ngắt rồi nối lại, giữ thiết bị', async () => {
    const { sim, engine, ons } = setup();
    const id = sim.connect({ name: 'Piano' });
    await engine.start();
    await engine.reconnect();
    expect(engine.hasDevice()).toBe(true);
    sim.noteOn(id, 70);
    expect(ons.map((e) => e.midi)).toEqual([70]); // không gắn bộ nghe hai lần
  });
});

describe('MidiEngine — kết nối lại khi lỗi', () => {
  function fakeTimers() {
    const queue: { cb: () => void; ms: number }[] = [];
    const timers: Timers = { set: (cb, ms) => queue.push({ cb, ms }), clear: () => undefined };
    return { queue, timers };
  }

  it('lỗi mở → tự thử lại theo lịch rồi dừng; Thử lại tay thì được thử lại đủ lượt', async () => {
    let fail = true;
    const sim = new SimulatedMidiBackend();
    const flaky: MidiBackend = { kind: 'web-midi', label: 'flaky', open: (h) => (fail ? Promise.reject(new Error('busy')) : sim.open(h)) };
    const { queue, timers } = fakeTimers();
    const engine = new MidiEngine(flaky, { configStore: new MemoryDeviceConfigStore(), timers, retryDelays: [100, 200] });
    await engine.start();
    expect(engine.state).toMatchObject({ status: 'error' });
    expect(engine.state.error).toMatch(/busy/);
    expect(queue.map((q) => q.ms)).toEqual([100]);
    queue.shift()!.cb();
    await Promise.resolve();
    await Promise.resolve();
    expect(queue.map((q) => q.ms)).toEqual([200]);
    queue.shift()!.cb();
    await Promise.resolve();
    await Promise.resolve();
    expect(queue).toEqual([]); // hết lượt

    fail = false;
    await engine.start();
    expect(engine.state.status).toBe('ready');
  });

  it('bị từ chối quyền → không tự thử lại', async () => {
    const { queue, timers } = fakeTimers();
    const denied: MidiBackend = { kind: 'web-midi', label: 'x', open: () => Promise.reject(new DOMException('no', 'NotAllowedError')) };
    const engine = new MidiEngine(denied, { configStore: new MemoryDeviceConfigStore(), timers });
    await engine.start();
    expect(engine.state.status).toBe('denied');
    expect(queue).toEqual([]);
  });

  it('mất kết nối giữa chừng (cầu nối native báo lỗi) → lỗi + lên lịch kết nối lại; stop huỷ lịch', async () => {
    const { queue, timers } = fakeTimers();
    let onError: ((e: Error) => void) | undefined;
    const backend: MidiBackend = {
      kind: 'native-bridge',
      label: 'bridge',
      open: async (h) => {
        onError = h.onError;
        h.onPorts([{ id: 'a', name: 'Piano', manufacturer: '', state: 'connected' }]);
        return { close: () => undefined };
      },
    };
    const engine = new MidiEngine(backend, { configStore: new MemoryDeviceConfigStore(), timers, retryDelays: [50] });
    await engine.start();
    expect(engine.hasDevice()).toBe(true);
    onError!(new Error('bridge lost'));
    expect(engine.state.status).toBe('error');
    expect(engine.state.error).toMatch(/Mất kết nối/);
    expect(queue).toHaveLength(1);
    await engine.stop();
    queue[0].cb();
    expect(engine.state.status).toBe('idle');
  });
});

describe('MidiEngine — đổi adapter', () => {
  it('bật mô phỏng khi đang chạy → kết nối lại bằng adapter gộp; id cổng có tiền tố', async () => {
    const real = new SimulatedMidiBackend();
    real.connect({ id: 'p', name: 'Real piano' });
    const sim = new SimulatedMidiBackend();
    sim.connect({ id: 's', name: 'Sim' });
    const engine = new MidiEngine(real, { configStore: new MemoryDeviceConfigStore() });
    const ons: number[] = [];
    engine.onNote((e) => ons.push(e.midi));
    await engine.start();
    await engine.setBackend(new CompositeBackend([real, sim]));
    expect(engine.state.status).toBe('ready');
    expect(engine.portList.map((p) => p.id).sort()).toEqual(['0:p', '1:s']);
    real.noteOn('p', 60);
    sim.noteOn('s', 61);
    expect(ons).toEqual([60, 61]);
  });

  it('adapter gộp: một phần bị từ chối quyền vẫn dùng phần còn lại', async () => {
    const sim = new SimulatedMidiBackend();
    sim.connect({ id: 's', name: 'Sim' });
    const denied: MidiBackend = { kind: 'web-midi', label: 'x', open: () => Promise.reject(new DOMException('no', 'SecurityError')) };
    const engine = new MidiEngine(new CompositeBackend([denied, sim]), { configStore: new MemoryDeviceConfigStore() });
    await engine.start();
    expect(engine.hasDevice()).toBe(true);
  });

  it('adapter gộp: một phần đang chờ hộp thoại xin quyền → phần kia vẫn dùng được ngay; mở xong sau thì cổng tự thêm', async () => {
    const sim = new SimulatedMidiBackend();
    sim.connect({ id: 's', name: 'Sim' });
    const late = new SimulatedMidiBackend();
    late.connect({ id: 'w', name: 'Web piano' });
    let release!: () => void;
    const pending: MidiBackend = { kind: 'web-midi', label: 'web', open: (h) => new Promise((r) => (release = () => r(late.open(h)))) };
    const engine = new MidiEngine(new CompositeBackend([pending, sim]), { configStore: new MemoryDeviceConfigStore() });
    await engine.start();
    expect(engine.state.devices.map((d) => d.name)).toEqual(['Sim']);
    release();
    await new Promise((r) => setTimeout(r, 0));
    expect(engine.state.devices.map((d) => d.name).sort()).toEqual(['Sim', 'Web piano']);
    await engine.stop();
    late.noteOn('w', 60);
  });

  it('không có adapter → không hỗ trợ', async () => {
    const engine = new MidiEngine(null, { configStore: new MemoryDeviceConfigStore() });
    await engine.start();
    expect(engine.state.status).toBe('unsupported');
    expect(engine.isSupported()).toBe(false);
  });

  it('start trong lúc đang đổi adapter dùng adapter mới', async () => {
    const a = new SimulatedMidiBackend();
    const b = new SimulatedMidiBackend();
    b.connect({ id: 'b', name: 'B' });
    const openA = vi.spyOn(a, 'open');
    const engine = new MidiEngine(a, { configStore: new MemoryDeviceConfigStore() });
    const switching = engine.setBackend(b);
    await engine.start();
    await switching;
    expect(openA).not.toHaveBeenCalled();
    expect(engine.portList.map((p) => p.id)).toEqual(['b']);
  });
});
