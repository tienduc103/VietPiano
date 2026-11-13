/**
 * Thư viện bài luyện kỹ thuật ngón tay (AI Finger Coach — docs/finger-coach/architecture.md).
 * Mỗi bài là một `Lesson` bình thường (khuông nhạc, số ngón, phát mẫu, chấm của Coach dùng lại hết) + thông tin sư phạm.
 */
import type { CriterionKey } from '../coach/types';
import type { Lesson } from '../lessons/types';

/** Cấp độ kỹ thuật — riêng của nhóm bài này, KHÔNG phải cấp giáo trình chính thức. */
export type TechniqueLevel = 1 | 2 | 3 | 4 | 5;

export const TECHNIQUE_LEVEL_LABEL: Record<TechniqueLevel, string> = {
  1: 'Cấp 1 · Làm quen',
  2: 'Cấp 2 · Kiểm soát ngón',
  3: 'Cấp 3 · Chuyển ngón',
  4: 'Cấp 4 · Trung cấp',
  5: 'Cấp 5 · Nâng cao',
};

/** Nhóm bài (mục 1–13 của đặc tả §4; mục 14–15 là màn "Hôm nay" và "Tiến bộ"). */
export type TechniqueGroup =
  | 'hand-intro'
  | 'five-finger'
  | 'eight-finger'
  | 'eight-note'
  | 'transition'
  | 'independence'
  | 'rhythm'
  | 'dynamics'
  | 'articulation'
  | 'scale'
  | 'coordination'
  | 'speed'
  | 'advanced';

export const TECHNIQUE_GROUP_LABEL: Record<TechniqueGroup, string> = {
  'hand-intro': 'Làm quen bàn tay và số ngón',
  'five-finger': 'Luyện 5 ngón',
  'eight-finger': 'Luyện 8 ngón hai tay',
  'eight-note': 'Chuỗi 8 nốt liên tục',
  transition: 'Chuyển ngón linh hoạt',
  independence: 'Độc lập ngón',
  rhythm: 'Nhịp và độ đều',
  dynamics: 'Lực đánh và sắc thái',
  articulation: 'Legato và Staccato',
  scale: 'Gam và luồn ngón cái',
  coordination: 'Phối hợp hai tay',
  speed: 'Tốc độ có kiểm soát',
  advanced: 'Kỹ thuật nâng cao',
};

export const TECHNIQUE_GROUP_ORDER: TechniqueGroup[] = [
  'hand-intro',
  'five-finger',
  'eight-finger',
  'eight-note',
  'transition',
  'independence',
  'rhythm',
  'dynamics',
  'articulation',
  'scale',
  'coordination',
  'speed',
  'advanced',
];

/**
 * Kỹ năng ĐO ĐƯỢC từ MIDI (không có "đúng ngón", "tư thế", "lực cơ" — MIDI không biết).
 * notes / rhythm / duration / dynamics = giá trị tiêu chí của Scoring Engine; coordination = đồng bộ hai tay;
 * transition = nốt chuyển ngón đúng phím + đúng lúc; consistency = độ ổn định qua nhiều lượt; speed = tempo ổn định.
 */
export type SkillId = 'notes' | 'rhythm' | 'duration' | 'dynamics' | 'coordination' | 'transition' | 'consistency' | 'speed';

export const SKILL_LABEL: Record<SkillId, string> = {
  notes: 'Chính xác nốt',
  rhythm: 'Nhịp đều',
  duration: 'Giữ trường độ',
  dynamics: 'Lực đánh',
  coordination: 'Phối hợp hai tay',
  transition: 'Chuyển ngón',
  consistency: 'Ổn định qua các lượt',
  speed: 'Tốc độ ổn định',
};

export const SKILL_ORDER: SkillId[] = ['notes', 'rhythm', 'duration', 'dynamics', 'coordination', 'transition', 'consistency', 'speed'];

/** right / left = một tay; together = hai tay cùng lúc (tay trái là phần đệm cùng phách); alternate = hai tay lần lượt. */
export type HandMode = 'right' | 'left' | 'together' | 'alternate';

export const HAND_MODE_LABEL: Record<HandMode, string> = {
  right: 'Tay phải',
  left: 'Tay trái',
  together: 'Hai tay cùng lúc',
  alternate: 'Hai tay lần lượt',
};

export interface ScoringConfig {
  /** Trọng số tiêu chí riêng theo mục tiêu bài (đè trọng số chế độ Coach); tiêu chí không đo được vẫn chia lại như cũ. */
  weights?: Partial<Record<CriterionKey, number>>;
  /** Điểm tổng tối thiểu để tính là "đạt" (tiên quyết, Adaptive Tempo). */
  passScore: number;
}

export interface FingerExercise {
  id: string;
  title: string;
  level: TechniqueLevel;
  group: TechniqueGroup;
  targetSkills: SkillId[];
  /** Nốt + tiết tấu + ngón gợi ý + tay (dùng chung khuông nhạc / Coach / phát mẫu). */
  lesson: Lesson;
  handMode: HandMode;
  /** Khoảng tempo (♩/phút) hợp lý cho bài; Adaptive Tempo không đề xuất ra ngoài khoảng này. */
  tempoRange: [number, number];
  estimatedMinutes: number;
  /** Bài cần đạt trước (CHỈ để đề xuất — mở khoá là gợi ý, người học vẫn tự mở được). */
  prerequisites: string[];
  scoringConfig: ScoringConfig;
  /** Giải thích kỹ thuật ngắn (tiếng Việt). */
  tips: string;
  /** Ghi chú về giới hạn đo (vd Legato chỉ đo bằng thời gian giữ phím). */
  measureNote?: string;
  /**
   * Id nốt (theo `ScoreReference`: `m:i` tay phải / giai điệu, `a:i:0` tay trái phần đệm) ở chỗ chuyển ngón — luồn ngón cái, vắt ngón,
   * đổi vị trí tay, đổi ngón trên cùng phím. Tự suy từ số ngón (`transitionRefIds`).
   */
  transitionNotes: string[];
  /** Bài áp dụng vào bản nhạc có sẵn trong Thư viện (dùng nguyên bài thư viện). */
  libraryLessonId?: string;
}
