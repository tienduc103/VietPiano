import { Emitter, type NoteInputEvent, type NoteInputProvider, type NoteOffEvent } from './NoteInputProvider';

/** Nguồn nốt từ bàn phím piano ảo / bàn phím máy tính — dùng cho demo mode trên Windows. */
export class VirtualInputProvider implements NoteInputProvider {
  readonly kind = 'virtual' as const;
  private readonly emitter = new Emitter<NoteInputEvent>();
  private readonly offEmitter = new Emitter<NoteOffEvent>();
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

  onNoteOff(listener: (event: NoteOffEvent) => void) {
    return this.offEmitter.on(listener);
  }

  press(midi: number): void {
    if (!this.active) return;
    this.emitter.emit({ midi, time: performance.now(), source: 'virtual' });
  }

  /** Thả phím (nhấc ngón khỏi phím ảo / nhả phím máy tính) — để chấm trường độ. */
  release(midi: number): void {
    if (!this.active) return;
    this.offEmitter.emit({ midi, time: performance.now(), source: 'virtual' });
  }
}

export const virtualInput = new VirtualInputProvider();
