/** Hàm dựng nội dung dùng chung cho các file cấp độ (chỉ tạo dữ liệu, không có logic học). */
import type { CurriculumLesson, Exercise, IntroPage, Piece, PlayExercise } from '../types';

export const SOURCE = 'Bài tập tự soạn cho giáo trình VietPiano';
/** Bàn phím cho bài tìm phím: C3–B5 (3 quãng 8 quanh Đô giữa). */
export const KEYS = { from: 48, to: 83 };
export const PERFORMANCE_PASS = { minScore: 80, minAccuracy: 0.8, minCompletion: 0.9 };
export const NO_FINGER_CHECK = 'App nghe được nốt nhưng không biết bạn dùng ngón nào — hãy tự để ý số ngón ghi trên khuông.';
export const NO_DURATION_MIC = 'Với micro, app không biết lúc bạn nhả phím nên không chấm trường độ (chỉ chấm khi dùng đàn MIDI hoặc bàn phím ảo).';

export const rh = (notation: string, bpm = 60, title?: string): Piece => ({ notation, clef: 'treble', hand: 'right', bpm, title, source: SOURCE });
export const lh = (notation: string, bpm = 60, title?: string): Piece => ({ notation, clef: 'bass', hand: 'left', bpm, title, source: SOURCE });
export const both = (notation: string, bpm = 60, title?: string): Piece => ({ notation, clef: 'grand', hand: 'both', bpm, title, source: SOURCE });
/** Bản nhạc có hoá biểu (vd "G" Sol trưởng, "F" Fa trưởng). */
export const inKey = (piece: Piece, keySignature: NonNullable<Piece['keySignature']>): Piece => ({ ...piece, keySignature });
/** Bản nhạc nhịp 3/4. */
export const in34 = (piece: Piece): Piece => ({ ...piece, timeSignature: [3, 4] });

export const play = (id: string, title: string, mode: PlayExercise['mode'], piece: Piece, more: Partial<PlayExercise> = {}): PlayExercise => ({
  kind: 'play',
  id,
  title,
  mode,
  piece,
  pass: mode === 'wait' ? { minAccuracy: 0.8, minCompletion: 1 } : mode === 'rhythm' ? { minScore: 75, minCompletion: 0.9 } : PERFORMANCE_PASS,
  ...more,
});

/** Bài luyện tập: không tính vào điểm buổi, không bắt buộc. */
export const practice = <T extends Exercise>(ex: T): T => ({ ...ex, required: false, weight: 0 });

type KeyHighlightArg = NonNullable<Extract<NonNullable<IntroPage['illustration']>, { type: 'keyboard' }>['highlight']>;

export const keyboardPage = (title: string, body: string, highlight: KeyHighlightArg, kids?: string): IntroPage => ({
  title,
  body,
  kids,
  illustration: { type: 'keyboard', ...KEYS, highlight },
});

export const staffPage = (title: string, body: string, piece: Piece, kids?: string): IntroPage => ({
  title,
  body,
  kids,
  illustration: { type: 'staff', piece, listen: true },
});

export const countPage = (title: string, body: string, piece: Piece, counts: string[], kids?: string): IntroPage => ({
  title,
  body,
  kids,
  illustration: { type: 'counting', piece, counts },
});

export interface LessonDef extends Omit<CurriculumLesson, 'levelId' | 'contentVersion' | 'ageVariants' | 'unlockCriteria' | 'prerequisites' | 'notes'> {
  ageVariants?: CurriculumLesson['ageVariants'];
  prerequisites?: string[];
  notes?: CurriculumLesson['notes'];
}

/** Điền các trường mặc định; điều kiện mở khoá = các buổi tiên quyết. */
export function buildLessons(levelId: string, defs: LessonDef[]): CurriculumLesson[] {
  return defs.map((d) => ({
    ...d,
    levelId,
    contentVersion: 1,
    ageVariants: d.ageVariants ?? {},
    prerequisites: d.prerequisites ?? [],
    unlockCriteria: { lessonsPassed: d.prerequisites ?? [] },
  }));
}
