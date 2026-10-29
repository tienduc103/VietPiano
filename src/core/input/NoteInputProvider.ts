/**
 * Nguồn nốt nhạc trừu tượng. PracticeEngine chỉ làm việc với interface này nên
 * micro, đàn MIDI (Web MIDI; sau này có thể là app native Core MIDI) và bàn phím ảo
 * đều đi vào cùng một logic Wait Mode.
 */

export type InputSource = 'microphone' | 'virtual' | 'midi';

export interface NoteInputEvent {
  midi: number;
  /** Thời điểm (ms, cùng gốc với performance.now()). */
  time: number;
  source: InputSource;
  /** Lực gõ 1–127 (chỉ đàn MIDI có). */
  velocity?: number;
  /** Micro: RMS khung lúc nhận nốt — độ to tương đối (chấm sắc thái mạnh nhẹ). */
  level?: number;
}

/**
 * Thả phím. Chỉ nguồn biết chính xác lúc thả mới phát (đàn MIDI, bàn phím ảo); micro không phát —
 * không đo được trường độ đáng tin từ âm ngân.
 */
export interface NoteOffEvent {
  midi: number;
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
  /** Có ở nguồn đo được lúc thả phím. */
  onNoteOff?(listener: (event: NoteOffEvent) => void): Unsubscribe;
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
