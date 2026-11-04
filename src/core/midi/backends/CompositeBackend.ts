/**
 * Gộp nhiều adapter thành một (vd Web MIDI thật + thiết bị mô phỏng khi đang phát triển).
 * Id cổng được thêm tiền tố theo adapter (`0:`, `1:`…) để không trùng.
 * Mở song song; sẵn sàng ngay khi một adapter mở được (adapter kia có thể đang chờ người dùng trả lời hộp thoại
 * xin quyền — mở xong sau thì cổng của nó tự xuất hiện). Chỉ khi tất cả đều lỗi mới báo lỗi (lỗi của adapter đầu).
 */
import type { MidiBackend, MidiBackendHandlers, MidiBackendSession, MidiPortDescriptor } from './types';

export class CompositeBackend implements MidiBackend {
  readonly kind = 'composite' as const;
  readonly label: string;

  constructor(private readonly parts: MidiBackend[]) {
    this.label = parts.map((p) => p.label).join(' + ');
  }

  pairBluetooth(): void {
    this.parts.find((p) => p.pairBluetooth)?.pairBluetooth?.();
  }

  open(handlers: MidiBackendHandlers): Promise<MidiBackendSession> {
    const lists: MidiPortDescriptor[][] = this.parts.map(() => []);
    const sessions: MidiBackendSession[] = [];
    let closed = false;
    const session: MidiBackendSession = {
      refresh: () => sessions.forEach((s) => s.refresh?.()),
      close: () => {
        closed = true;
        sessions.forEach((s) => s.close());
      },
    };
    return new Promise((resolve, reject) => {
      const errors: unknown[] = this.parts.map(() => undefined);
      let settled = 0;
      let resolved = false;
      this.parts.forEach((part, i) => {
        const prefix = `${i}:`;
        part
          .open({
            onPorts: (ports) => {
              if (closed) return;
              lists[i] = ports.map((p) => ({ ...p, id: prefix + p.id }));
              handlers.onPorts(lists.flat());
            },
            onData: (port, data, time) => {
              if (!closed) handlers.onData(prefix + port, data, time);
            },
            onError: handlers.onError,
          })
          .then(
            (s) => {
              if (closed) return s.close();
              sessions.push(s);
              if (!resolved) {
                resolved = true;
                resolve(session);
              }
            },
            (e) => {
              errors[i] = e ?? new Error('MIDI');
            },
          )
          .finally(() => {
            if (++settled === this.parts.length && !resolved) reject(errors.find((e) => e !== undefined));
          });
      });
    });
  }
}
