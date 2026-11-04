/**
 * Đọc thông điệp MIDI 1.0 thành sự kiện chuẩn hoá, độc lập với hãng / model / cách kết nối.
 *
 * - Web MIDI luôn giao từng thông điệp đầy đủ, nhưng cầu nối native (Core MIDI trên iPad, WebView2 trên Windows)
 *   có thể gửi nguyên gói byte: nhiều thông điệp nối nhau, running status (bỏ byte trạng thái lặp lại),
 *   byte real-time (0xF8 clock, 0xFE active sensing…) chen giữa, SysEx. `MidiByteParser` xử lý được cả hai.
 * - Kênh trong sự kiện là 0–15 (hiển thị cho người dùng thì +1).
 */

export type MidiMessage =
  | { type: 'noteOn'; channel: number; note: number; velocity: number }
  /** Note Off (0x8n) hoặc Note On velocity 0 — theo chuẩn là thả phím. */
  | { type: 'noteOff'; channel: number; note: number; velocity: number }
  | { type: 'controlChange'; channel: number; controller: number; value: number }
  | { type: 'programChange'; channel: number; program: number }
  | { type: 'pitchBend'; channel: number; /** −8192…8191 */ value: number }
  | { type: 'channelPressure'; channel: number; value: number }
  | { type: 'polyPressure'; channel: number; note: number; value: number };

/** Control Change hay gặp. */
export const CC_SUSTAIN = 64;
export const CC_SOSTENUTO = 66;
export const CC_SOFT = 67;
export const CC_ALL_SOUND_OFF = 120;
export const CC_RESET_ALL_CONTROLLERS = 121;
export const CC_ALL_NOTES_OFF = 123;

/** Giá trị CC 64 ≥ 64 là đạp (đàn có half-pedal gửi 0–127 liên tục). */
export const SUSTAIN_THRESHOLD = 64;

/** Số byte dữ liệu theo nhóm trạng thái kênh (0x8n…0xEn). */
function dataLength(status: number): number {
  const kind = status & 0xf0;
  return kind === 0xc0 || kind === 0xd0 ? 1 : 2;
}

function decode(status: number, d1: number, d2: number): MidiMessage | null {
  const channel = status & 0x0f;
  switch (status & 0xf0) {
    case 0x80:
      return { type: 'noteOff', channel, note: d1, velocity: d2 };
    case 0x90:
      return d2 > 0 ? { type: 'noteOn', channel, note: d1, velocity: d2 } : { type: 'noteOff', channel, note: d1, velocity: 0 };
    case 0xa0:
      return { type: 'polyPressure', channel, note: d1, value: d2 };
    case 0xb0:
      return { type: 'controlChange', channel, controller: d1, value: d2 };
    case 0xc0:
      return { type: 'programChange', channel, program: d1 };
    case 0xd0:
      return { type: 'channelPressure', channel, value: d1 };
    case 0xe0:
      return { type: 'pitchBend', channel, value: ((d2 << 7) | d1) - 8192 };
    default:
      return null;
  }
}

/**
 * Bộ đọc luồng byte có trạng thái (mỗi cổng vào một bộ). Bỏ qua: real-time, SysEx, System Common,
 * byte dữ liệu mồ côi. Thông điệp kênh không trọn vẹn ở cuối gói được nối với gói sau.
 */
export class MidiByteParser {
  private running = 0;
  private data: number[] = [];
  private inSysex = false;

  push(bytes: ArrayLike<number> | null | undefined): MidiMessage[] {
    const out: MidiMessage[] = [];
    if (!bytes) return out;
    for (let i = 0; i < bytes.length; i++) {
      const b = bytes[i] & 0xff;
      if (b >= 0xf8) continue; // real-time: chen được vào giữa thông điệp, không ảnh hưởng running status
      if (b === 0xf0) {
        this.inSysex = true;
        this.running = 0;
        this.data = [];
        continue;
      }
      if (b === 0xf7) {
        this.inSysex = false;
        continue;
      }
      if (b >= 0x80) {
        this.inSysex = false;
        this.data = [];
        // System Common (0xF1–0xF6) xoá running status theo chuẩn.
        this.running = b < 0xf0 ? b : 0;
        continue;
      }
      if (this.inSysex || this.running === 0) continue;
      this.data.push(b);
      if (this.data.length < dataLength(this.running)) continue;
      const msg = decode(this.running, this.data[0], this.data[1] ?? 0);
      this.data = [];
      if (msg) out.push(msg);
    }
    return out;
  }

  reset(): void {
    this.running = 0;
    this.data = [];
    this.inSysex = false;
  }
}

/** Đọc một thông điệp đầy đủ (không dùng running status). */
export function parseMidiMessage(data: ArrayLike<number> | null | undefined): MidiMessage | null {
  return new MidiByteParser().push(data)[0] ?? null;
}

// ——— Hàm cũ (giữ nguyên hành vi, còn được dùng và test) ———

export interface MidiNoteOn {
  midi: number;
  velocity: number;
  channel: number;
}

export interface MidiNoteMessage extends MidiNoteOn {
  type: 'on' | 'off';
}

/** Note On (0x9n, velocity > 0) hoặc Note Off (0x8n, hoặc 0x9n velocity 0); thông điệp khác → null. */
export function parseNoteMessage(data: ArrayLike<number> | null | undefined): MidiNoteMessage | null {
  if (!data || data.length < 3) return null;
  const status = data[0];
  const kind = status & 0xf0;
  if (kind !== 0x90 && kind !== 0x80) return null;
  const midi = data[1] & 0x7f;
  const velocity = data[2] & 0x7f;
  const type = kind === 0x90 && velocity > 0 ? 'on' : 'off';
  return { type, midi, velocity, channel: status & 0x0f };
}

/**
 * Chỉ trả về Note On thật (0x9n, velocity > 0). Note On velocity 0 là Note Off theo chuẩn → bỏ qua.
 */
export function parseNoteOn(data: ArrayLike<number> | null | undefined): MidiNoteOn | null {
  const m = parseNoteMessage(data);
  return m?.type === 'on' ? { midi: m.midi, velocity: m.velocity, channel: m.channel } : null;
}

/** Pedal vang (sustain): Control Change 64 (0xBn 64 giá trị); giá trị ≥ 64 = đạp. Thông điệp khác → null. */
export function parseSustainPedal(data: ArrayLike<number> | null | undefined): { down: boolean; channel: number } | null {
  if (!data || data.length < 3) return null;
  if ((data[0] & 0xf0) !== 0xb0 || (data[1] & 0x7f) !== CC_SUSTAIN) return null;
  return { down: (data[2] & 0x7f) >= SUSTAIN_THRESHOLD, channel: data[0] & 0x0f };
}

/** Mô tả ngắn cho bảng kiểm tra tín hiệu. */
export function describeMessage(m: MidiMessage): string {
  const ch = `kênh ${m.channel + 1}`;
  switch (m.type) {
    case 'noteOn':
      return `Note On ${m.note} · lực ${m.velocity} · ${ch}`;
    case 'noteOff':
      return `Note Off ${m.note} · ${ch}`;
    case 'controlChange':
      if (m.controller === CC_SUSTAIN) return `Pedal vang ${m.value >= SUSTAIN_THRESHOLD ? 'đạp' : 'nhả'} (${m.value}) · ${ch}`;
      if (m.controller === CC_SOFT) return `Pedal mềm ${m.value} · ${ch}`;
      if (m.controller === CC_SOSTENUTO) return `Pedal sostenuto ${m.value} · ${ch}`;
      return `CC ${m.controller} = ${m.value} · ${ch}`;
    case 'programChange':
      return `Đổi tiếng ${m.program + 1} · ${ch}`;
    case 'pitchBend':
      return `Pitch bend ${m.value} · ${ch}`;
    case 'channelPressure':
      return `Aftertouch ${m.value} · ${ch}`;
    case 'polyPressure':
      return `Aftertouch phím ${m.note} = ${m.value} · ${ch}`;
  }
}
