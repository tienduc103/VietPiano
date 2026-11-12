/**
 * Cài đặt của "Đố bé nốt gì?" (phụ huynh / giáo viên chọn trong bảng ⚙ trên màn chơi) + kiểm tra dữ liệu lưu.
 */
import { LETTERS, QUIZ_CLEFS, QUIZ_DURATIONS, type Letter, type QuizClef, type QuizDuration } from './staff';

/** Cao độ: tìm nốt theo tên · Trường độ: tìm nốt theo hình trường độ · Kết hợp: cả hai ("nốt Đô Tròn"). */
export type QuizMode = 'pitch' | 'duration' | 'both';
export const QUIZ_MODES: readonly QuizMode[] = ['pitch', 'duration', 'both'];
export const MODE_LABEL: Record<QuizMode, string> = { pitch: 'Cao độ', duration: 'Trường độ', both: 'Kết hợp' };

/** Khoá của ván: một khoá, hoặc Hỗn hợp (mỗi câu một khoá, mọi ô của câu cùng khoá). */
export type ClefChoice = QuizClef | 'mixed';
export const CLEF_CHOICES: readonly ClefChoice[] = [...QUIZ_CLEFS, 'mixed'];

export type ChoiceCount = 2 | 3 | 4 | 6;
export const CHOICE_COUNTS: readonly ChoiceCount[] = [2, 3, 4, 6];
export const QUESTION_COUNTS: readonly number[] = [5, 10, 15, 20];

export interface NoteQuizSettings {
  mode: QuizMode;
  clef: ClefChoice;
  choices: ChoiceCount;
  /** Nốt cần học (tên). */
  letters: Letter[];
  /** Phạm vi: một hay hai quãng tám quanh khoá (`clefRange`). */
  octaves: 1 | 2;
  /** Trường độ cần học. */
  durations: QuizDuration[];
  questions: number;
  /** Cô giáo gợi ý thông minh (tăng dần, theo nguyên nhân sai — `hints.ts`). Tắt: chỉ "thử lại nhé". */
  smartHints: boolean;
  /** Bắt đầu gợi ý sau 1 hay 2 lần chọn sai. */
  hintAfter: 1 | 2;
  /** Cô đọc gợi ý thành tiếng (tắt: chỉ hiện chữ). */
  hintVoice: boolean;
  /** Minh hoạ trực quan: khuông tô dòng / khe, hình mẫu trường độ. */
  hintVisual: boolean;
  /** Hỗ trợ tối đa cho bé nhỏ: gợi ý trực quan ngay lần sai đầu, cất ô sai nhanh hơn. */
  maxSupport: boolean;
  /** Cô tự đọc câu hỏi khi hiện câu mới (tắt: bấm 🔊 để nghe). */
  autoRead: boolean;
}

/**
 * Mặc định cho bé 4 tuổi: khoá Sol, Cao độ, 2 đáp án, Đô–Rê–Mi, 10 câu, cô tự đọc, gợi ý thông minh từ lần sai đầu tiên
 * (đọc + minh hoạ). Không giới hạn thời gian, không trừ điểm.
 */
export const DEFAULT_QUIZ_SETTINGS: NoteQuizSettings = {
  mode: 'pitch',
  clef: 'treble',
  choices: 2,
  letters: ['C', 'D', 'E'],
  octaves: 1,
  durations: ['w', 'h', 'q'],
  questions: 10,
  smartHints: true,
  hintAfter: 1,
  hintVoice: true,
  hintVisual: true,
  maxSupport: false,
  autoRead: true,
};

export function sanitizeQuizSettings(raw: unknown): NoteQuizSettings {
  const d = DEFAULT_QUIZ_SETTINGS;
  if (!raw || typeof raw !== 'object') return { ...d, letters: [...d.letters], durations: [...d.durations] };
  const s = raw as Record<string, unknown>;
  const pick = <T>(list: readonly T[], v: unknown, fallback: T): T => (list.includes(v as T) ? (v as T) : fallback);
  const letters = Array.isArray(s.letters) ? LETTERS.filter((l) => (s.letters as unknown[]).includes(l)) : [];
  const durations = Array.isArray(s.durations) ? QUIZ_DURATIONS.filter((x) => (s.durations as unknown[]).includes(x)) : [];
  return {
    mode: pick(QUIZ_MODES, s.mode, d.mode),
    clef: pick(CLEF_CHOICES, s.clef, d.clef),
    choices: pick(CHOICE_COUNTS, s.choices, d.choices),
    letters: letters.length > 0 ? letters : [...d.letters],
    octaves: s.octaves === 2 ? 2 : 1,
    durations: durations.length > 0 ? durations : [...d.durations],
    questions: pick(QUESTION_COUNTS, s.questions, d.questions),
    // Bản đầu lưu `hints` (sai 2 lần → sáng ô đúng) → coi là bật / tắt gợi ý thông minh.
    smartHints: typeof s.smartHints === 'boolean' ? s.smartHints : typeof s.hints === 'boolean' ? s.hints : d.smartHints,
    hintAfter: s.hintAfter === 2 ? 2 : 1,
    hintVoice: typeof s.hintVoice === 'boolean' ? s.hintVoice : d.hintVoice,
    hintVisual: typeof s.hintVisual === 'boolean' ? s.hintVisual : d.hintVisual,
    maxSupport: typeof s.maxSupport === 'boolean' ? s.maxSupport : d.maxSupport,
    autoRead: typeof s.autoRead === 'boolean' ? s.autoRead : d.autoRead,
  };
}

/** Số ô thật sự dùng: chế độ Trường độ chỉ có 5 hình trường độ khác nhau → tối đa 5 ô. */
export function effectiveChoices(s: Pick<NoteQuizSettings, 'mode' | 'choices'>): number {
  return s.mode === 'duration' ? Math.min(s.choices, QUIZ_DURATIONS.length) : s.choices;
}

/** Khoá kỷ lục: nội dung của ván (gợi ý không đổi điểm của câu đúng ngay → không tách kỷ lục). */
export function quizRecordKey(s: NoteQuizSettings): string {
  return [s.mode, s.clef, s.choices, s.letters.join(''), s.octaves, s.durations.join('.'), s.questions].join(':');
}
