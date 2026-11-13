/**
 * Theo dõi phím đang giữ: note-on → note-off của từng phím, đo THỜI GIAN GIỮ PHÍM VẬT LÝ.
 *
 * - Nhiều phím cùng lúc: mỗi phím một mốc riêng.
 * - Note-on lặp khi phím đang giữ (đàn gửi lại / hai nguồn) → bỏ, giữ mốc đầu.
 * - Note-off không có note-on (phím bấm trước khi vào màn) → bỏ.
 * - Note-on velocity 0 = note-off theo chuẩn MIDI — `MidiByteParser` đã đổi sẵn; ở đây vẫn chấp nhận để an toàn.
 * - Pedal vang (CC 64) KHÔNG kéo dài phép đo: thả phím lúc đang đạp vẫn kết thúc đúng lúc thả. Chỉ ghi lại
 *   pedal có đang đạp (để báo cáo "âm còn ngân do pedal").
 * - Mất kết nối / rời màn → `releaseAll` (MidiEngine cũng gửi Note Off khi rút đàn) — không kẹt phím.
 */
import type { InputSource } from '../input/NoteInputProvider';

/** Một sự kiện nốt dạng chuẩn (mô hình dữ liệu `MidiEvent` của bài). */
export interface MidiEvent {
  noteNumber: number;
  eventType: 'noteOn' | 'noteOff' | 'pedalDown' | 'pedalUp';
  /** 0–127; noteOn velocity 0 = noteOff. Micro / bàn phím ảo: không có. */
  velocity?: number;
  /** ms, cùng gốc performance.now(). */
  timestamp: number;
  channel?: number;
  sourceDevice: InputSource;
}

export interface HeldKey {
  midi: number;
  onAt: number;
  velocity?: number;
  source: InputSource;
}

export interface Press {
  midi: number;
  onAt: number;
  offAt: number;
  /** Thời gian giữ phím vật lý (ms). */
  durationMs: number;
  velocity?: number;
  source: InputSource;
  /** Pedal vang đang đạp lúc thả phím (âm còn ngân nhưng phép đo đã dừng). */
  sustainedByPedal: boolean;
  /** Kết thúc do mất kết nối / rời màn, không phải bé thả phím → không chấm. */
  aborted: boolean;
}

export type TrackerOutput = { kind: 'start'; key: HeldKey } | { kind: 'end'; press: Press } | null;

export class PressTracker {
  private held = new Map<number, HeldKey>();
  private pedal = false;

  handle(e: MidiEvent): TrackerOutput {
    switch (e.eventType) {
      case 'pedalDown':
        this.pedal = true;
        return null;
      case 'pedalUp':
        this.pedal = false;
        return null;
      case 'noteOn':
        if (e.velocity === 0) return this.off(e.noteNumber, e.timestamp, false);
        return this.on(e);
      case 'noteOff':
        return this.off(e.noteNumber, e.timestamp, false);
    }
  }

  private on(e: MidiEvent): TrackerOutput {
    if (this.held.has(e.noteNumber)) return null;
    const key: HeldKey = { midi: e.noteNumber, onAt: e.timestamp, source: e.sourceDevice, ...(e.velocity !== undefined ? { velocity: e.velocity } : {}) };
    this.held.set(e.noteNumber, key);
    return { kind: 'start', key };
  }

  private off(midi: number, time: number, aborted: boolean): TrackerOutput {
    const key = this.held.get(midi);
    if (!key) return null;
    this.held.delete(midi);
    // Mốc lệch (đồng hồ hai nguồn khác nhau) → không để thời lượng âm.
    const offAt = Math.max(key.onAt, time);
    return {
      kind: 'end',
      press: {
        midi,
        onAt: key.onAt,
        offAt,
        durationMs: offAt - key.onAt,
        source: key.source,
        sustainedByPedal: this.pedal,
        aborted,
        ...(key.velocity !== undefined ? { velocity: key.velocity } : {}),
      },
    };
  }

  /** Thả mọi phím (mất kết nối, rời màn, đổi hoạt động). Các lần nhấn trả về đánh dấu `aborted`. */
  releaseAll(time: number): Press[] {
    const out: Press[] = [];
    for (const midi of [...this.held.keys()]) {
      const r = this.off(midi, time, true);
      if (r?.kind === 'end') out.push(r.press);
    }
    this.pedal = false;
    return out;
  }

  heldKeys(): HeldKey[] {
    return [...this.held.values()];
  }

  /** Phím giữ lâu nhất hiện tại (để vẽ thanh thời gian). */
  current(): HeldKey | null {
    let best: HeldKey | null = null;
    for (const k of this.held.values()) if (!best || k.onAt < best.onAt) best = k;
    return best;
  }

  pedalDown(): boolean {
    return this.pedal;
  }
}
