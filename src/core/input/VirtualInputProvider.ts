import { Emitter, type NoteInputEvent, type NoteInputProvider } from './NoteInputProvider';

/** Nguồn nốt từ bàn phím piano ảo / bàn phím máy tính — dùng cho demo mode trên Windows. */
export class VirtualInputProvider implements NoteInputProvider {
  readonly kind = 'virtual' as const;
  private readonly emitter = new Emitter<NoteInputEvent>();
  private active = true;

  async start(): Promise<void> {
    this.active = true;
  }

  async stop(): Promise<void> {
    this.active = false;
  }

  isActive(): boolean {
    return this.active;
  }

  onNote(listener: (event: NoteInputEvent) => void) {
    return this.emitter.on(listener);
  }

  press(midi: number): void {
    if (!this.active) return;
    this.emitter.emit({ midi, time: performance.now(), source: 'virtual' });
  }
}

export const virtualInput = new VirtualInputProvider();
