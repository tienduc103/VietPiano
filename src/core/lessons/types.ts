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

export type LessonCategory = 'notes' | 'scale' | 'right-hand' | 'left-hand' | 'kids' | 'song';

/** Số ngón tay: 1 = ngón cái, 2 = trỏ, 3 = giữa, 4 = áp út, 5 = út (cả hai tay). */
export type Finger = 1 | 2 | 3 | 4 | 5;

export interface LessonNote {
  /** Tên nốt khoa học, vd "C4", "F#3". */
  pitch: string;
  midi: number;
  duration: Duration;
  /** Ngón tay gợi ý (vẽ trên khuông nhạc). */
  finger?: Finger;
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
  /** Nhịp độ gợi ý cho chế độ chạy theo nhịp (nốt đen/phút); mặc định DEFAULT_TEMPO_BPM. */
  tempo?: number;
}

/** Nhịp độ chậm, vừa sức người mới học. */
export const DEFAULT_TEMPO_BPM = 72;

export function lessonTempo(lesson: Pick<Lesson, 'tempo'>): number {
  return lesson.tempo ?? DEFAULT_TEMPO_BPM;
}

/** Độ dài một ô nhịp đầy đủ, tính bằng nốt đen (3/8 → 1.5). */
export function measureLength([beats, beatValue]: Lesson['timeSignature']): number {
  return (beats * 4) / beatValue;
}
