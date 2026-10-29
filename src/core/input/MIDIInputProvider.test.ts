import { describe, expect, it } from 'vitest';
import { MIDIInputProvider, parseNoteMessage, parseNoteOn, parseSustainPedal, type MidiAccessLike, type MidiInputLike, type PedalInputEvent } from './MIDIInputProvider';
import type { NoteInputEvent, NoteOffEvent } from './NoteInputProvider';

function fakeInput(id: string, name = `Piano ${id}`): MidiInputLike {
  return { id, name, manufacturer: 'Yamaha', state: 'connected', onmidimessage: null };
}

function fakeAccess(inputs: MidiInputLike[]): MidiAccessLike & { list: MidiInputLike[]; change(): void } {
  const access = {
    list: inputs,
    inputs: { forEach: (cb: (i: MidiInputLike) => void) => access.list.forEach(cb) },
    onstatechange: null as ((e: unknown) => void) | null,
    change: () => access.onstatechange?.({}),
  };
  return access;
}

const send = (input: MidiInputLike, data: number[], timeStamp = 1000) =>
  input.onmidimessage?.({ data: new Uint8Array(data), timeStamp });

describe('parseNoteOn', () => {
  it('nhận Note On mọi kênh, bỏ Note Off và Note On velocity 0', () => {
    expect(parseNoteOn([0x90, 60, 100])).toEqual({ midi: 60, velocity: 100, channel: 0 });
    expect(parseNoteOn([0x93, 21, 1])).toEqual({ midi: 21, velocity: 1, channel: 3 });
    expect(parseNoteOn([0x90, 60, 0])).toBeNull();
    expect(parseNoteOn([0x80, 60, 64])).toBeNull();
  });

  it('bỏ thông điệp khác (pedal, đồng hồ, thiếu byte)', () => {
    expect(parseNoteOn([0xb0, 64, 127])).toBeNull(); // pedal ngân
    expect(parseNoteOn([0xf8])).toBeNull(); // timing clock
    expect(parseNoteOn([0xfe])).toBeNull(); // active sensing
    expect(parseNoteOn([0x90, 60])).toBeNull();
    expect(parseNoteOn(null)).toBeNull();
  });
});

describe('parseNoteMessage', () => {
  it('phân biệt Note On / Note Off (0x8n hoặc 0x9n velocity 0)', () => {
    expect(parseNoteMessage([0x90, 60, 100])).toEqual({ type: 'on', midi: 60, velocity: 100, channel: 0 });
    expect(parseNoteMessage([0x82, 60, 64])).toEqual({ type: 'off', midi: 60, velocity: 64, channel: 2 });
    expect(parseNoteMessage([0x90, 60, 0])).toMatchObject({ type: 'off', midi: 60 });
    expect(parseNoteMessage([0xb0, 64, 127])).toBeNull();
    expect(parseNoteMessage([0x80, 60])).toBeNull();
  });
});

describe('MIDIInputProvider', () => {
  it('không hỗ trợ khi trình duyệt không có Web MIDI', async () => {
    const p = new MIDIInputProvider(null);
    expect(p.isSupported()).toBe(false);
    expect(p.state.status).toBe('unsupported');
    await p.start();
    expect(p.state.status).toBe('unsupported');
  });

  it('kết nối, liệt kê đàn và phát noteOn với thời điểm của sự kiện MIDI', async () => {
    const input = fakeInput('a', 'Clavinova');
    const p = new MIDIInputProvider(async () => fakeAccess([input]));
    const events: NoteInputEvent[] = [];
    p.onNote((e) => events.push(e));
    await p.start();
    expect(p.state.status).toBe('ready');
    expect(p.state.devices).toEqual([{ id: 'a', name: 'Clavinova', manufacturer: 'Yamaha' }]);
    expect(p.hasDevice()).toBe(true);

    send(input, [0x90, 64, 80], 1234);
    send(input, [0x80, 64, 0], 1300);
    send(input, [0x90, 64, 0], 1300);
    expect(events).toEqual([{ midi: 64, time: 1234, source: 'midi', velocity: 80 }]);
  });

  it('phát Note Off riêng (để chấm trường độ) và velocity trong noteOn', async () => {
    const input = fakeInput('a');
    const p = new MIDIInputProvider(async () => fakeAccess([input]));
    const ons: NoteInputEvent[] = [];
    const offs: NoteOffEvent[] = [];
    p.onNote((e) => ons.push(e));
    p.onNoteOff((e) => offs.push(e));
    await p.start();
    send(input, [0x90, 62, 90], 2000);
    send(input, [0x80, 62, 0], 2500);
    send(input, [0x90, 62, 0], 2600);
    expect(ons).toEqual([{ midi: 62, time: 2000, source: 'midi', velocity: 90 }]);
    expect(offs).toEqual([
      { midi: 62, time: 2500, source: 'midi' },
      { midi: 62, time: 2600, source: 'midi' },
    ]);
  });

  it('pedal vang (CC 64): sự kiện đạp / nhả riêng, không thành nốt; CC khác bỏ qua', async () => {
    expect(parseSustainPedal([0xb0, 64, 127])).toEqual({ down: true, channel: 0 });
    expect(parseSustainPedal([0xb3, 64, 63])).toEqual({ down: false, channel: 3 });
    expect(parseSustainPedal([0xb0, 67, 127])).toBeNull();
    expect(parseSustainPedal([0x90, 64, 127])).toBeNull();
    const input = fakeInput('a');
    const p = new MIDIInputProvider(async () => fakeAccess([input]));
    const pedals: PedalInputEvent[] = [];
    const ons: NoteInputEvent[] = [];
    p.onPedal((e) => pedals.push(e));
    p.onNote((e) => ons.push(e));
    await p.start();
    send(input, [0xb0, 64, 127], 3000);
    send(input, [0xb0, 1, 90], 3100);
    send(input, [0xb0, 64, 0], 3500);
    expect(pedals).toEqual([
      { down: true, time: 3000 },
      { down: false, time: 3500 },
    ]);
    expect(ons).toEqual([]);
  });

  it('mỗi lần gõ chỉ một sự kiện, kể cả gõ lại cùng phím', async () => {
    const input = fakeInput('a');
    const p = new MIDIInputProvider(async () => fakeAccess([input]));
    const events: number[] = [];
    p.onNote((e) => events.push(e.midi));
    await p.start();
    await p.start(); // gọi lại không gắn bộ nghe thứ hai
    for (const t of [0, 300, 600]) {
      send(input, [0x90, 60, 90], 1000 + t);
      send(input, [0x80, 60, 0], 1100 + t);
    }
    expect(events).toEqual([60, 60, 60]);
  });

  it('cắm/rút dây: tự gắn cổng mới, gỡ cổng đã rút', async () => {
    const a = fakeInput('a');
    const access = fakeAccess([a]);
    const p = new MIDIInputProvider(async () => access);
    const events: number[] = [];
    const states: number[] = [];
    p.onNote((e) => events.push(e.midi));
    p.stateChanges.on((s) => states.push(s.devices.length));
    await p.start();

    const b = fakeInput('b');
    access.list = [a, b];
    access.change();
    expect(p.state.devices.map((d) => d.id)).toEqual(['a', 'b']);
    send(b, [0x90, 72, 50]);

    a.state = 'disconnected';
    access.change();
    expect(p.state.devices.map((d) => d.id)).toEqual(['b']);
    expect(a.onmidimessage).toBeNull();
    send(a, [0x90, 48, 50]);
    expect(events).toEqual([72]);

    access.list = [];
    access.change();
    expect(p.hasDevice()).toBe(false);
    expect(p.isActive()).toBe(true);
    expect(states.at(-1)).toBe(0);
  });

  it('báo bị từ chối quyền', async () => {
    const p = new MIDIInputProvider(async () => {
      throw new DOMException('no', 'SecurityError');
    });
    await p.start();
    expect(p.state.status).toBe('denied');
    expect(p.state.error).toMatch(/quyền/);
  });

  it('stop: gỡ bộ nghe, không phát nốt nữa; stop trong lúc đang xin quyền thì bỏ kết quả', async () => {
    const input = fakeInput('a');
    const access = fakeAccess([input]);
    const p = new MIDIInputProvider(async () => access);
    const events: number[] = [];
    p.onNote((e) => events.push(e.midi));
    await p.start();
    await p.stop();
    expect(p.state).toEqual({ status: 'idle', devices: [], error: null });
    expect(input.onmidimessage).toBeNull();
    expect(access.onstatechange).toBeNull();

    let resolve!: (a: MidiAccessLike) => void;
    const slow = new MIDIInputProvider(() => new Promise((r) => (resolve = r)));
    const starting = slow.start();
    expect(slow.state.status).toBe('connecting');
    await slow.stop();
    resolve(access);
    await starting;
    expect(slow.state.status).toBe('idle');
    expect(input.onmidimessage).toBeNull();
  });
});
