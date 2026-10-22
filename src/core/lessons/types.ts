import type { KeySignature } from '../music/keySignature';

export type Clef = 'treble' | 'bass';

/** Trường độ theo ký hiệu VexFlow: w=tròn, h=trắng, q=đen, 8=móc đơn, 16=móc kép; hậu tố d = có chấm. */
export type Duration = 'w' | 'hd' | 'h' | 'qd' | 'q' | '8d' | '8' | '16';

export const DURATION_BEATS: Record<Duration, number> = {
  w: 4,
  hd: 3,
  h: 2,
  qd: 1.5,
  q: 1,
  '8d': 0.75,
  '8': 0.5,
  '16': 0.25,
};

export type LessonCategory = 'notes' | 'scale' | 'right-hand' | 'left-hand' | 'song';

export interface LessonNote {
  /** Tên nốt khoa học, vd "C4", "F#3". */
  pitch: string;
  midi: number;
  duration: Duration;
}

export interface Lesson {
  id: string;
  title: string;
  description: string;
  category: LessonCategory;
  clef: Clef;
  /** [số phách mỗi ô nhịp, giá trị phách] — mẫu số 4 hoặc 8. */
  timeSignature: [number, 4 | 8];
  /** Hoá biểu đầu khuông; mặc định Đô trưởng (không dấu hoá). */
  keySignature?: KeySignature;
  /** Nhịp lấy đà: độ dài (tính bằng nốt đen) của ô nhịp đầu chưa đủ phách. */
  pickup?: number;
  difficulty: 1 | 2 | 3;
  hand: 'right' | 'left';
  notes: LessonNote[];
  /** Ghi chú nguồn gốc bản nhạc (bản quyền). */
  source?: string;
}

/** Độ dài một ô nhịp đầy đủ, tính bằng nốt đen (3/8 → 1.5). */
export function measureLength([beats, beatValue]: Lesson['timeSignature']): number {
  return (beats * 4) / beatValue;
}
