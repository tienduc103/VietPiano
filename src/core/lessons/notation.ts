import { requireMidi } from '../music/notes';
import { DURATION_BEATS, type Duration, type Finger, type LessonNote } from './types';

/**
 * Phân tích chuỗi ký hiệu gọn: "C4 D4 E4/h | G4/qd A4/8".
 * Mặc định trường độ là nốt đen (q). Hậu tố ":1"…":5" là số ngón tay ("C4:1", "E4/h:3").
 * Dấu "|" chỉ để dễ đọc, bị bỏ qua
 * (ô nhịp được tính lại từ trường độ và được kiểm tra bằng unit test).
 */
export function parseNotes(source: string): LessonNote[] {
  return source
    .split(/\s+/)
    .filter((tok) => tok && tok !== '|')
    .map((tok) => {
      const [main, finger] = tok.split(':');
      const [pitch, dur = 'q'] = main.split('/');
      if (!(dur in DURATION_BEATS)) throw new Error(`Trường độ không hợp lệ: "${tok}"`);
      const note: LessonNote = { pitch, midi: requireMidi(pitch), duration: dur as Duration };
      if (finger !== undefined) {
        if (!/^[1-5]$/.test(finger)) throw new Error(`Số ngón tay không hợp lệ: "${tok}"`);
        note.finger = Number(finger) as Finger;
      }
      return note;
    });
}

export interface Measure<T> {
  items: T[];
  beats: number;
}

/**
 * Chia nốt thành các ô nhịp (độ dài tính bằng nốt đen). Ô đầu dài `pickup` nếu có nhịp lấy đà.
 * Ném lỗi nếu một nốt vắt qua vạch nhịp.
 */
export function splitMeasures<T extends { duration: Duration }>(
  notes: T[],
  beatsPerMeasure: number,
  pickup = 0,
): Measure<T>[] {
  const measures: Measure<T>[] = [];
  let current: Measure<T> = { items: [], beats: 0 };
  for (const note of notes) {
    const b = DURATION_BEATS[note.duration];
    const limit = measures.length === 0 && pickup > 0 ? pickup : beatsPerMeasure;
    if (current.beats + b > limit + 1e-9) {
      throw new Error(`Nốt vắt qua vạch nhịp ở ô nhịp ${measures.length + 1}`);
    }
    current.items.push(note);
    current.beats += b;
    if (Math.abs(current.beats - limit) < 1e-9) {
      measures.push(current);
      current = { items: [], beats: 0 };
    }
  }
  if (current.items.length) measures.push(current);
  return measures;
}
