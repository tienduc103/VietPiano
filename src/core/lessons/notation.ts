import { requireMidi } from '../music/notes';
import { DURATION_BEATS, type AccompanimentNote, type Duration, type Finger, type Hand, type LessonNote } from './types';

/**
 * Phân tích chuỗi ký hiệu gọn: "C4 D4 E4/h | G4/qd A4/8".
 * Mặc định trường độ là nốt đen (q). Hậu tố ":1"…":5" là số ngón tay ("C4:1", "E4/h:3").
 * Bài hai tay: "RH" / "LH" đặt tay cho các nốt phía sau ("LH C3:5 D3:4 | RH E4:3").
 * Dấu "|" chỉ để dễ đọc, bị bỏ qua
 * (ô nhịp được tính lại từ trường độ và được kiểm tra bằng unit test).
 */
export function parseNotes(source: string): LessonNote[] {
  const notes: LessonNote[] = [];
  let hand: Hand | undefined;
  for (const tok of source.split(/\s+/)) {
    if (!tok || tok === '|') continue;
    if (tok === 'RH' || tok === 'LH') {
      hand = tok === 'RH' ? 'right' : 'left';
      continue;
    }
    const [main, finger] = tok.split(':');
    const [pitch, dur = 'q'] = main.split('/');
    if (!(dur in DURATION_BEATS)) throw new Error(`Trường độ không hợp lệ: "${tok}"`);
    const note: LessonNote = { pitch, midi: requireMidi(pitch), duration: dur as Duration };
    if (finger !== undefined) {
      if (!/^[1-5]$/.test(finger)) throw new Error(`Số ngón tay không hợp lệ: "${tok}"`);
      note.finger = Number(finger) as Finger;
    }
    if (hand) note.hand = hand;
    notes.push(note);
  }
  return notes;
}

/**
 * Phân tích phần đệm: "D3+F3+A3/hd:5+3+1 | G2:5 Bb2:3 D3:1".
 * Các nốt hợp âm nối bằng "+", ngón tay ghi theo đúng thứ tự đó ("+" để trống = không ghi ngón).
 */
export function parseAccompaniment(source: string): AccompanimentNote[] {
  const result: AccompanimentNote[] = [];
  for (const tok of source.split(/\s+/)) {
    if (!tok || tok === '|') continue;
    const [main, fingerPart] = tok.split(':');
    const [chord, dur = 'q'] = main.split('/');
    if (!(dur in DURATION_BEATS)) throw new Error(`Trường độ không hợp lệ: "${tok}"`);
    const fingerToks = fingerPart === undefined ? [] : fingerPart.split('+');
    const notes = chord.split('+').map((pitch, i) => {
      const f = fingerToks[i];
      if (f && !/^[1-5]$/.test(f)) throw new Error(`Số ngón tay không hợp lệ: "${tok}"`);
      return { pitch, midi: requireMidi(pitch), finger: f ? (Number(f) as Finger) : undefined };
    });
    if (fingerToks.length > notes.length) throw new Error(`Thừa số ngón tay: "${tok}"`);
    notes.sort((a, b) => a.midi - b.midi);
    result.push({
      pitches: notes.map((n) => n.pitch),
      midis: notes.map((n) => n.midi),
      duration: dur as Duration,
      fingers: notes.map((n) => n.finger),
    });
  }
  return result;
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
