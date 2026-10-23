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

export type LessonCategory = 'notes' | 'scale' | 'right-hand' | 'left-hand' | 'both-hands' | 'kids' | 'song';

export type Hand = 'right' | 'left';
/** Tay chơi cả bài; 'both' = bài hai tay (mỗi nốt ghi tay riêng, vẽ trên khuông đôi). */
export type LessonHand = Hand | 'both';
/** Khoá của bài; 'grand' = khuông đôi (Sol trên cho tay phải, Fa dưới cho tay trái). */
export type LessonClef = Clef | 'grand';

export const HAND_LABEL: Record<LessonHand, string> = { right: 'Tay phải', left: 'Tay trái', both: 'Hai tay' };
export const CLEF_LABEL: Record<LessonClef, string> = { treble: 'Khoá Sol', bass: 'Khoá Fa', grand: 'Khuông đôi' };

/** Số ngón tay: 1 = ngón cái, 2 = trỏ, 3 = giữa, 4 = áp út, 5 = út (cả hai tay). */
export type Finger = 1 | 2 | 3 | 4 | 5;

export interface LessonNote {
  /** Tên nốt khoa học, vd "C4", "F#3". */
  pitch: string;
  midi: number;
  duration: Duration;
  /** Ngón tay gợi ý (vẽ trên khuông nhạc). */
  finger?: Finger;
  /** Tay chơi nốt này — chỉ có ở bài hai tay. */
  hand?: Hand;
}

export interface Lesson {
  id: string;
  title: string;
  description: string;
  category: LessonCategory;
  clef: LessonClef;
  /** [số phách mỗi ô nhịp, giá trị phách] — mẫu số 4 hoặc 8. */
  timeSignature: [number, 4 | 8];
  /** Hoá biểu đầu khuông; mặc định Đô trưởng (không dấu hoá). */
  keySignature?: KeySignature;
  /** Nhịp lấy đà: độ dài (tính bằng nốt đen) của ô nhịp đầu chưa đủ phách. */
  pickup?: number;
  difficulty: 1 | 2 | 3;
  hand: LessonHand;
  notes: LessonNote[];
  /** Ghi chú nguồn gốc bản nhạc (bản quyền). */
  source?: string;
  /** Nhịp độ gợi ý cho chế độ chạy theo nhịp (nốt đen/phút); mặc định DEFAULT_TEMPO_BPM. */
  tempo?: number;
}

/** Tay chơi một nốt của bài. */
export function noteHand(lesson: Pick<Lesson, 'hand'>, note: Pick<LessonNote, 'hand'>): Hand {
  return note.hand ?? (lesson.hand === 'left' ? 'left' : 'right');
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
