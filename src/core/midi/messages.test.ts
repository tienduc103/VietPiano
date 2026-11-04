import { describe, expect, it } from 'vitest';
import { describeMessage, MidiByteParser, parseMidiMessage } from './messages';

describe('MidiByteParser', () => {
  it('đọc mọi loại thông điệp kênh, kênh 0–15', () => {
    const p = new MidiByteParser();
    expect(p.push([0x90, 60, 100, 0x83, 60, 40, 0xb2, 64, 127, 0xc0, 5, 0xe0, 0, 64, 0xd1, 50, 0xa0, 60, 30])).toEqual([
      { type: 'noteOn', channel: 0, note: 60, velocity: 100 },
      { type: 'noteOff', channel: 3, note: 60, velocity: 40 },
      { type: 'controlChange', channel: 2, controller: 64, value: 127 },
      { type: 'programChange', channel: 0, program: 5 },
      { type: 'pitchBend', channel: 0, value: 0 },
      { type: 'channelPressure', channel: 1, value: 50 },
      { type: 'polyPressure', channel: 0, note: 60, value: 30 },
    ]);
  });

  it('Note On velocity 0 là Note Off', () => {
    expect(parseMidiMessage([0x95, 64, 0])).toEqual({ type: 'noteOff', channel: 5, note: 64, velocity: 0 });
  });

  it('running status: nhiều nốt sau một byte trạng thái (gói Core MIDI / BLE)', () => {
    const p = new MidiByteParser();
    expect(p.push([0x90, 60, 90, 64, 80, 67, 0]).map((m) => [m.type, 'note' in m ? m.note : -1])).toEqual([
      ['noteOn', 60],
      ['noteOn', 64],
      ['noteOff', 67],
    ]);
  });

  it('thông điệp bị cắt giữa hai gói được nối lại', () => {
    const p = new MidiByteParser();
    expect(p.push([0x90, 60])).toEqual([]);
    expect(p.push([100])).toEqual([{ type: 'noteOn', channel: 0, note: 60, velocity: 100 }]);
  });

  it('bỏ real-time chen giữa thông điệp, SysEx, System Common; byte dữ liệu mồ côi', () => {
    const p = new MidiByteParser();
    expect(p.push([0xf8, 0xfe])).toEqual([]);
    expect(p.push([0x90, 0xf8, 60, 0xfe, 100])).toEqual([{ type: 'noteOn', channel: 0, note: 60, velocity: 100 }]);
    expect(p.push([0xf0, 0x43, 0x10, 0x4c, 0xf7])).toEqual([]);
    // Sau SysEx không còn running status → byte dữ liệu bị bỏ.
    expect(p.push([60, 100])).toEqual([]);
    expect(p.push([0xf2, 0, 0, 60, 100])).toEqual([]);
    expect(new MidiByteParser().push([60, 100, 0x90])).toEqual([]);
    expect(p.push(null)).toEqual([]);
  });

  it('pitch bend 14 bit có dấu', () => {
    expect(parseMidiMessage([0xe0, 0, 0])).toMatchObject({ value: -8192 });
    expect(parseMidiMessage([0xe0, 0x7f, 0x7f])).toMatchObject({ value: 8191 });
  });

  it('mô tả tiếng Việt cho bảng kiểm tra tín hiệu (kênh hiển thị 1–16)', () => {
    expect(describeMessage({ type: 'noteOn', channel: 0, note: 60, velocity: 90 })).toBe('Note On 60 · lực 90 · kênh 1');
    expect(describeMessage({ type: 'controlChange', channel: 15, controller: 64, value: 127 })).toBe('Pedal vang đạp (127) · kênh 16');
    expect(describeMessage({ type: 'controlChange', channel: 0, controller: 1, value: 3 })).toBe('CC 1 = 3 · kênh 1');
  });
});
