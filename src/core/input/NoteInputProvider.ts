/**
 * Nguồn nốt nhạc trừu tượng. PracticeEngine chỉ làm việc với interface này nên
 * có thể thay MicrophoneInputProvider bằng MIDIInputProvider (khi nền tảng hỗ trợ
 * MIDI thật, vd app native Swift/Core MIDI) mà không đổi logic Wait Mode.
 */

export type InputSource = 'microphone' | 'virtual' | 'midi';

export interface NoteInputEvent {
  midi: number;
  /** Thời điểm (ms, cùng gốc với performance.now()). */
  time: number;
  source: InputSource;
}

export type Unsubscribe = () => void;

export interface NoteInputProvider {
  readonly kind: InputSource;
  start(): Promise<void>;
  stop(): Promise<void>;
  isActive(): boolean;
  onNote(listener: (event: NoteInputEvent) => void): Unsubscribe;
}

/** Tiện ích phát sự kiện dùng chung cho các provider. */
export class Emitter<T> {
  private listeners = new Set<(value: T) => void>();

  on(listener: (value: T) => void): Unsubscribe {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  emit(value: T): void {
    this.listeners.forEach((l) => l(value));
  }

  clear(): void {
    this.listeners.clear();
  }
}
