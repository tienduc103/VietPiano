/**
 * Adapter Web MIDI API: Chrome / Edge trên Windows, macOS, Linux, Android (và Firefox có quyền).
 * Nhận mọi thiết bị hệ điều hành đã mở thành cổng MIDI: USB class-compliant hoặc có driver hãng,
 * Bluetooth LE MIDI đã ghép qua hệ điều hành (Windows: Windows MIDI Services / driver BLE của hãng), cổng ảo.
 * Safari và mọi trình duyệt trên iPad (WebKit) KHÔNG có API này → dùng NativeBridgeBackend.
 */
import type { MidiBackend, MidiBackendHandlers, MidiBackendSession, MidiPortDescriptor } from './types';

export interface MidiInputLike {
  id: string;
  name: string | null;
  manufacturer: string | null;
  state: 'connected' | 'disconnected';
  onmidimessage: ((e: { data: Uint8Array | null; timeStamp: number }) => void) | null;
}

export interface MidiAccessLike {
  inputs: { forEach(cb: (input: MidiInputLike) => void): void };
  onstatechange: ((e: unknown) => void) | null;
}

export type RequestMidiAccess = () => Promise<MidiAccessLike>;

export function browserRequestMidiAccess(): RequestMidiAccess | null {
  if (typeof navigator === 'undefined' || typeof navigator.requestMIDIAccess !== 'function') return null;
  return () => navigator.requestMIDIAccess({ sysex: false }) as unknown as Promise<MidiAccessLike>;
}

const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

export class WebMidiBackend implements MidiBackend {
  readonly kind = 'web-midi' as const;
  readonly label = 'Web MIDI (Chrome / Edge)';

  constructor(private readonly request: RequestMidiAccess) {}

  async open(handlers: MidiBackendHandlers): Promise<MidiBackendSession> {
    const access = await this.request();
    let attached = new Set<MidiInputLike>();
    let closed = false;

    const refresh = () => {
      if (closed) return;
      const all: MidiInputLike[] = [];
      access.inputs.forEach((input) => all.push(input));
      const live = new Set(all.filter((i) => i.state === 'connected'));
      for (const input of attached) if (!live.has(input)) input.onmidimessage = null;
      for (const input of live) {
        if (attached.has(input)) continue;
        // timeStamp của Web MIDI cùng gốc với performance.now(); một số bản cũ trả 0.
        input.onmidimessage = (e) => handlers.onData(input.id, e.data ?? [], e.timeStamp > 0 ? e.timeStamp : now());
      }
      attached = live;
      const ports: MidiPortDescriptor[] = all.map((i) => ({
        id: i.id,
        name: i.name || 'Thiết bị MIDI',
        manufacturer: i.manufacturer ?? '',
        state: i.state,
      }));
      handlers.onPorts(ports);
    };

    access.onstatechange = () => refresh();
    refresh();
    return {
      refresh,
      close: () => {
        closed = true;
        for (const input of attached) input.onmidimessage = null;
        attached.clear();
        access.onstatechange = null;
      },
    };
  }
}
