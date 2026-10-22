export type Clef = 'treble' | 'bass';

/** Trường độ theo ký hiệu VexFlow: w=tròn, h=trắng, q=đen, 8=móc đơn; hậu tố d = có chấm. */
export type Duration = 'w' | 'hd' | 'h' | 'qd' | 'q' | '8';

export const DURATION_BEATS: Record<Duration, number> = {
  w: 4,
  hd: 3,
  h: 2,
  qd: 1.5,
  q: 1,
  '8': 0.5,
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
  /** [số phách mỗi ô nhịp, giá trị phách] — hiện chỉ hỗ trợ mẫu số 4. */
  timeSignature: [number, 4];
  difficulty: 1 | 2 | 3;
  hand: 'right' | 'left';
  notes: LessonNote[];
  /** Ghi chú nguồn gốc bản nhạc (bản quyền). */
  source?: string;
}
