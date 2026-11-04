/**
 * Thiết bị MIDI mô phỏng — phát triển và kiểm thử khi chưa có đàn thật (unit test, e2e, bảng cài đặt).
 * Gửi đúng byte MIDI như đàn thật (đi qua cùng parser, cấu hình dải phím, transpose… của MidiEngine),
 * nên những gì chạy được với thiết bị mô phỏng cũng là đường đi của đàn thật — trừ phần driver / hệ điều hành.
 */
import type { MidiTransport } from '../deviceProfiles';
import type { MidiBackend, MidiBackendHandlers, MidiBackendSession, MidiPortDescriptor } from './types';

export interface SimulatedDeviceSpec {
  id?: string;
  name: string;
  manufacturer?: string;
  /** Mặc định 'simulated'; test có thể giả lập 'bluetooth' / 'usb'. */
  transport?: MidiTransport;
}

/** Thiết bị mẫu cho bảng cài đặt: một controller câm 25 phím và một đàn điện 88 phím. */
export const SIMULATED_PRESETS: SimulatedDeviceSpec[] = [
  { id: 'sim-controller-25', name: 'Mô phỏng microKEY2-25', manufacturer: 'KORG (mô phỏng)' },
  { id: 'sim-piano-88', name: 'Mô phỏng Digital Piano 88', manufacturer: 'Yamaha (mô phỏng)' },
];

const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

export class SimulatedMidiBackend implements MidiBackend {
  readonly kind = 'simulated' as const;
  readonly label = 'Thiết bị mô phỏng';
  private ports = new Map<string, MidiPortDescriptor>();
  private sessions = new Set<MidiBackendHandlers>();
  private seq = 0;

  async open(handlers: MidiBackendHandlers): Promise<MidiBackendSession> {
    this.sessions.add(handlers);
    handlers.onPorts(this.list());
    return {
      refresh: () => handlers.onPorts(this.list()),
      close: () => {
        this.sessions.delete(handlers);
      },
    };
  }

  /** Cắm thiết bị (hoặc cắm lại thiết bị đã rút cùng id). Trả về id. */
  connect(spec: SimulatedDeviceSpec): string {
    const id = spec.id ?? `sim-${++this.seq}`;
    this.ports.set(id, { id, name: spec.name, manufacturer: spec.manufacturer ?? 'VietPiano', transport: spec.transport ?? 'simulated', state: 'connected' });
    this.announce();
    return id;
  }

  /** Rút thiết bị: vẫn còn trong danh sách với trạng thái disconnected (như Web MIDI). */
  disconnect(id: string): void {
    const p = this.ports.get(id);
    if (!p) return;
    this.ports.set(id, { ...p, state: 'disconnected' });
    this.announce();
  }

  remove(id: string): void {
    if (this.ports.delete(id)) this.announce();
  }

  isConnected(id: string): boolean {
    return this.ports.get(id)?.state === 'connected';
  }

  /** Gửi byte thô (có thể nhiều thông điệp / running status). Thiết bị đã rút thì không gửi được. */
  send(id: string, bytes: ArrayLike<number>, time = now()): void {
    if (!this.isConnected(id)) return;
    for (const h of this.sessions) h.onData(id, bytes, time);
  }

  noteOn(id: string, note: number, velocity = 90, channel = 0, time?: number): void {
    this.send(id, [0x90 | (channel & 0x0f), note & 0x7f, velocity & 0x7f], time);
  }

  noteOff(id: string, note: number, channel = 0, time?: number): void {
    this.send(id, [0x80 | (channel & 0x0f), note & 0x7f, 0], time);
  }

  sustain(id: string, down: boolean, channel = 0, time?: number): void {
    this.send(id, [0xb0 | (channel & 0x0f), 64, down ? 127 : 0], time);
  }

  list(): MidiPortDescriptor[] {
    return [...this.ports.values()];
  }

  private announce(): void {
    const list = this.list();
    for (const h of this.sessions) h.onPorts(list);
  }
}
