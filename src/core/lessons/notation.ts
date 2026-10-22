import { requireMidi } from '../music/notes';
import { DURATION_BEATS, type Duration, type LessonNote } from './types';

/**
 * Phân tích chuỗi ký hiệu gọn: "C4 D4 E4/h | G4/qd A4/8".
 * Mặc định trường độ là nốt đen (q). Dấu "|" chỉ để dễ đọc, bị bỏ qua
 * (ô nhịp được tính lại từ trường độ và được kiểm tra bằng unit test).
 */
export function parseNotes(source: string): LessonNote[] {
  return source
    .split(/\s+/)
    .filter((tok) => tok && tok !== '|')
    .map((tok) => {
      const [pitch, dur = 'q'] = tok.split('/');
      if (!(dur in DURATION_BEATS)) throw new Error(`Trường độ không hợp lệ: "${tok}"`);
      return { pitch, midi: requireMidi(pitch), duration: dur as Duration };
    });
}

export interface Measure<T> {
  items: T[];
  beats: number;
}

/** Chia nốt thành các ô nhịp. Ném lỗi nếu một nốt vắt qua vạch nhịp. */
export function splitMeasures<T extends { duration: Duration }>(notes: T[], beatsPerMeasure: number): Measure<T>[] {
  const measures: Measure<T>[] = [];
  let current: Measure<T> = { items: [], beats: 0 };
  for (const note of notes) {
    const b = DURATION_BEATS[note.duration];
    if (current.beats + b > beatsPerMeasure + 1e-9) {
      throw new Error(`Nốt vắt qua vạch nhịp ở ô nhịp ${measures.length + 1}`);
    }
    current.items.push(note);
    current.beats += b;
    if (Math.abs(current.beats - beatsPerMeasure) < 1e-9) {
      measures.push(current);
      current = { items: [], beats: 0 };
    }
  }
  if (current.items.length) measures.push(current);
  return measures;
}
