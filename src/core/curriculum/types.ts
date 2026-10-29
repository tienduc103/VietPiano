/**
 * Mô hình dữ liệu giáo trình: Curriculum → Level → Week → CurriculumLesson → Activity / Exercise → Assessment.
 * Đây CHỈ là dữ liệu (nội dung nằm ở `content/`), không có logic UI. Thêm cấp độ 2–6 = thêm file nội dung,
 * không đổi kiểu dữ liệu. Tiến độ (Progress) lưu riêng ở `storage/CurriculumStorage.ts`.
 */
import type { Clef, LessonClef, LessonHand, LessonSection } from '../lessons/types';
import type { DynamicMark } from '../music/dynamics';
import type { KeySignature } from '../music/keySignature';

/**
 * Chữ hiển thị. Hiện chỉ có tiếng Việt; sau này có thể là `{ vi, en }` mà không phải đổi nội dung cũ
 * (dùng `text()` để đọc).
 */
export type Text = string | { vi: string; [locale: string]: string };

export type Locale = 'vi' | (string & {});

export function text(t: Text, locale: Locale = 'vi'): string {
  return typeof t === 'string' ? t : (t[locale] ?? t.vi);
}

export type UiMode = 'kids' | 'adult';

/** Một bản nhạc ngắn trong bài: ký hiệu gọn như thư viện ("C4:1 D4/h | R E4"). */
export interface Piece {
  notation: string;
  clef: LessonClef;
  hand: LessonHand;
  timeSignature?: [number, 4 | 8];
  /** Nhịp độ gốc (nốt đen/phút). */
  bpm: number;
  title?: Text;
  /** Ghi nguồn gốc (bản quyền): giai điệu tự soạn cho giáo trình. */
  source?: string;
  /** Hoá biểu ("G", "F"…). Ký hiệu vẫn ghi đủ dấu hoá ("F#4"); khuông nhạc tự bỏ dấu đã có trong hoá biểu. */
  keySignature?: KeySignature;
  /**
   * Phần đệm tay trái đánh CÙNG LÚC với giai điệu ("C3+E3+G3/w:5+3+1 | G2/h C3/h"), vẽ trên khuông Fa.
   * Chỉ dùng với `clef: 'grand'`, `hand: 'right'` (notation = giai điệu tay phải). App chỉ chấm giai điệu:
   * nốt thấp hơn giai điệu (tay trái) bị bỏ qua — micro chỉ nhận một nốt mỗi lúc.
   */
  accompaniment?: string;
  /**
   * Dấu sắc thái theo ô nhịp (số ô như bản in, từ 1): `{ 1: 'p', 5: 'f' }` — có hiệu lực từ nốt đầu ô tới dấu sau.
   * Biểu diễn có thêm tiêu chí "Mạnh – nhẹ" (so sánh tương đối giữa các đoạn); phát mẫu theo sắc thái.
   */
  dynamics?: Partial<Record<number, DynamicMark>>;
  /** Chữ đánh dấu đoạn (A, B…) ở đầu ô nhịp. */
  sections?: LessonSection[];
}

// ── Hình minh hoạ ─────────────────────────────────────────────────────

/** Nhóm phím được tô sáng trên bàn phím minh hoạ. */
export type KeyHighlight = 'black' | 'white' | 'black-group-2' | 'black-group-3' | 'all-c' | number[];

export type Illustration =
  | { type: 'keyboard'; from: number; to: number; highlight?: KeyHighlight; /** Hiện tên mọi phím trắng. */ labels?: boolean; fingers?: Record<number, number> }
  | { type: 'hand'; hand: 'right' | 'left' }
  | { type: 'staff'; piece: Piece; /** Cho nghe mẫu. */ listen?: boolean }
  | { type: 'counting'; piece: Piece; /** Chữ đếm dưới từng nốt, vd ["1", "2-3-4"]. */ counts: string[] };

export interface IntroPage {
  title?: Text;
  body: Text;
  illustration?: Illustration;
  /** Lời nhắc cho bé (Kids Mode) — thay `body` nếu có. */
  kids?: Text;
}

// ── Hoạt động (không chấm điểm) ──────────────────────────────────────

/** Giới thiệu kiến thức, hình minh hoạ, nghe/xem đàn mẫu. */
export interface IntroActivity {
  kind: 'intro';
  id: string;
  title: Text;
  pages: IntroPage[];
}

export type Activity = IntroActivity;

// ── Bài tập (có chấm điểm) ───────────────────────────────────────────

/** Điều kiện đạt của một bài tập. */
export interface PassRule {
  /** Điểm tối thiểu 0–100. */
  minScore?: number;
  /** Độ chính xác (nốt / câu trả lời) tối thiểu 0–1. */
  minAccuracy?: number;
  /** Số lượt đúng tối thiểu (bài nhiều lượt, vd "đúng 4/5 lượt"). */
  minCorrect?: number;
  /** Tỉ lệ hoàn thành tối thiểu 0–1 (bài biểu diễn). */
  minCompletion?: number;
}

/** Phím cần tìm trong bài tìm phím. */
export type KeyTarget =
  | { type: 'midi'; midi: number }
  | { type: 'pitch-class'; pc: number; /** Không nhận phím này (vd "một nốt Đô KHÁC Đô giữa"). */ exclude?: number[] }
  | { type: 'black' }
  | { type: 'white' }
  | { type: 'black-group'; size: 2 | 3 };

export interface KeyQuizRound {
  prompt: Text;
  target: KeyTarget;
}

interface ExerciseBase {
  id: string;
  title: Text;
  instructions?: Text;
  /** Bắt buộc đạt để qua bài (mặc định true). */
  required?: boolean;
  /** Trọng số trong điểm của bài (mặc định 1). */
  weight?: number;
  pass: PassRule;
}

/**
 * Tìm phím trên đàn (đàn thật qua micro/MIDI, hoặc bàn phím ảo).
 * `retry`: luyện tập — sai thì thử lại tới khi đúng (chấm theo lần đầu). Không retry: kiểm tra — mỗi lượt một lần.
 */
export interface KeyQuizExercise extends ExerciseBase {
  kind: 'key-quiz';
  keyboard: { from: number; to: number };
  rounds: KeyQuizRound[];
  retry: boolean;
}

export interface ChoiceQuestion {
  prompt: Text;
  illustration?: Illustration;
  options: Text[];
  /** Chỉ số đáp án đúng trong `options`. */
  answer: number;
}

/** Câu hỏi lý thuyết trắc nghiệm. */
export interface ChoiceQuizExercise extends ExerciseBase {
  kind: 'choice-quiz';
  questions: ChoiceQuestion[];
}

/**
 * Nhận diện nốt trên khuông: hiện từng nốt, người học chọn tên nốt (`answer: 'name'`)
 * hoặc đánh nốt đó trên đàn (`answer: 'play'`).
 */
export interface NoteReadingExercise extends ExerciseBase {
  kind: 'note-reading';
  clef: Clef;
  /** Thứ tự nốt hỏi (tên nốt khoa học). */
  sequence: string[];
  /** Các tên nốt hiện làm lựa chọn khi `answer: 'name'`. */
  choices?: string[];
  answer: 'name' | 'play';
  /** Đọc nốt trong hoá biểu: nốt "F#4" vẽ không có dấu thăng — người học phải nhớ hoá biểu. */
  keySignature?: KeySignature;
}

/**
 * Chơi theo khuông nhạc.
 *  - wait: Wait Mode (chờ đúng nốt, không tính thời gian) — rubric KHÔNG có tiêu chí nhịp.
 *  - performance: đồng hồ nhịp cố định, chấm cao độ + thời điểm + trường độ.
 *  - rhythm: như performance nhưng không xét cao độ (bài tiết tấu).
 */
export interface PlayExercise extends ExerciseBase {
  kind: 'play';
  mode: 'wait' | 'performance' | 'rhythm';
  piece: Piece;
}

export type Exercise = KeyQuizExercise | ChoiceQuizExercise | NoteReadingExercise | PlayExercise;
export type ExerciseKind = Exercise['kind'];

/** Rubric chấm điểm (xem `scoring.ts`). */
export type Rubric = 'theory' | 'keyboard' | 'recognition' | 'wait' | 'performance' | 'rhythm';

export function exerciseRubric(ex: Exercise): Rubric {
  switch (ex.kind) {
    case 'choice-quiz':
      return 'theory';
    case 'key-quiz':
      return 'keyboard';
    case 'note-reading':
      return 'recognition';
    case 'play':
      return ex.mode;
  }
}

// ── Bài học, tuần, cấp độ ───────────────────────────────────────────

export interface Assessment {
  /** Điểm bài (trung bình có trọng số các bài tập) tối thiểu để đạt. */
  passScore: number;
  /** Buổi kiểm tra (cuối tuần / cuối cấp). */
  checkpoint: boolean;
}

export interface UnlockCriteria {
  /** Các buổi phải đạt trước (gợi ý — app không khoá cứng, xem `unlock.ts`). */
  lessonsPassed: string[];
}

export interface AgeVariant {
  /** Mô tả thay thế cho nhóm tuổi này. */
  description?: Text;
  /** Mẹo riêng. */
  tips?: Text[];
  /** % nhịp độ so với bài (bé tập chậm hơn). */
  tempoPercent?: number;
}

export interface CurriculumLesson {
  lessonId: string;
  levelId: string;
  weekId: string;
  /** Số buổi trong cấp độ (1–20). */
  number: number;
  title: Text;
  description: Text;
  learningObjectives: Text[];
  /** Phút. */
  estimatedDuration: number;
  ageVariants: Partial<Record<UiMode, AgeVariant>>;
  prerequisites: string[];
  activities: Activity[];
  exercises: Exercise[];
  assessment: Assessment;
  unlockCriteria: UnlockCriteria;
  /** Tăng khi sửa nội dung bài làm điểm cũ không còn so sánh được. */
  contentVersion: number;
  /** Ghi chú giới hạn kỹ thuật hiển thị cho người học (vd "app không kiểm tra được ngón tay"). */
  notes?: Text[];
}

/** Bài trong thư viện nên luyện thêm ở tuần này (gộp từ khoá học "Nốt nhạc cơ bản" cũ). */
export interface ExtraPractice {
  lessonId: string;
  tip: Text;
}

export interface Week {
  weekId: string;
  number: number;
  title: Text;
  description: Text;
  lessonIds: string[];
  extraPractice?: ExtraPractice[];
}

export interface Level {
  levelId: string;
  number: number;
  title: Text;
  description: Text;
  /** 'coming-soon' = chưa có nội dung (chỉ hiện trong danh sách cấp độ). */
  availability: 'available' | 'coming-soon';
  weeks: Week[];
  lessons: CurriculumLesson[];
}

export interface Curriculum {
  curriculumId: string;
  title: Text;
  contentVersion: number;
  levels: Level[];
}
