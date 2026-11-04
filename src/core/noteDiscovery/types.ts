/**
 * Kiểu dữ liệu cho module Khám phá nốt nhạc (Note Discovery).
 */
import type { ExpectedInputType } from './musicModel';

export type ActivityKind =
  | 'intro' // 1. Note Introduction
  | 'find-key' // 2. Find the Key
  | 'staff-recognition' // 3. Staff Recognition
  | 'listening' // 4. Listening Practice
  | 'sequence' // 5. Note Sequence
  | 'memory-challenge'; // 6. Memory Challenge

export type MasteryLevel = 'new' | 'learning' | 'practicing' | 'remembered' | 'mastered';

/**
 * Cấp độ hỗ trợ / gợi ý (Scaffolding / Hint Level)
 * - 0: Tối đa (Hiện tên nốt trên khuông, tô màu nốt, highlight phím trên piano)
 * - 1: Trung bình (Hiện tên nốt hoặc tô màu, không highlight phím)
 * - 2: Tối thiểu (Chỉ hiện nốt nhạc trên khuông, không màu, không tên, không highlight phím)
 */
export type HintLevel = 0 | 1 | 2;

export interface ActivityBase {
  id: string;
  kind: ActivityKind;
  title: string;
  instructions: string;
  voicePrompt?: string; // Câu đọc cho trẻ em
  hintLevelDefault?: HintLevel;
}

/** 1. Activity: Note Introduction */
export interface IntroActivityItem {
  midi: number;
  playSampleOnStart?: boolean;
  instructionText: string;
  voiceText: string;
  highlightKey?: boolean;
  showStaffNote?: boolean;
}

export interface NoteIntroActivity extends ActivityBase {
  kind: 'intro';
  items: IntroActivityItem[];
}

/** 2. Activity: Find the Key */
export interface FindKeyRound {
  target: ExpectedInputType;
  prompt: string;
  voiceText: string;
  displayMidi?: number; // Nốt hiển thị tham chiếu nếu có
  displaySymbol?: string; // Tên nốt (ví dụ "Đô (C4)") hoặc biểu tượng
  allowOctaveFree?: boolean;
  hintLevel?: HintLevel;
}

export interface FindKeyActivity extends ActivityBase {
  kind: 'find-key';
  keyboardRange: { from: number; to: number };
  rounds: FindKeyRound[];
  retryOnWrong: boolean;
}

/** 3. Activity: Staff Recognition */
export interface StaffRecognitionRound {
  midi: number;
  answerType: 'play' | 'choice';
  choices?: string[]; // Nếu là choice: danh sách lựa chọn tên nốt (ví dụ ["Đô", "Rê", "Mi"])
  correctChoiceIndex?: number;
  prompt: string;
  voiceText: string;
  hintLevel?: HintLevel;
}

export interface StaffRecognitionActivity extends ActivityBase {
  kind: 'staff-recognition';
  rounds: StaffRecognitionRound[];
}

/** 4. Activity: Listening Practice */
export interface ListeningPracticeRound {
  firstMidi: number;
  secondMidi: number;
  comparison: 'higher' | 'lower' | 'equal';
  prompt: string;
  voiceText: string;
}

export interface ListeningPracticeActivity extends ActivityBase {
  kind: 'listening';
  rounds: ListeningPracticeRound[];
}

/** 5. Activity: Note Sequence */
export interface NoteSequenceActivity extends ActivityBase {
  kind: 'sequence';
  sequence: number[]; // Dãy MIDI notes, ví dụ [60, 62, 64]
  prompt?: string;
  voiceText?: string;
  allowPlaybackSample: boolean;
  titleSnippet?: string; // Ví dụ: "Bậc thang Đô Rê Mi"
}

/** 6. Activity: Memory Challenge */
export interface MemoryChallengeRound {
  midi: number;
  timeLimitMs?: number; // Giới hạn phản hồi gợi ý (nếu có)
}

export interface MemoryChallengeActivity extends ActivityBase {
  kind: 'memory-challenge';
  notePool: number[]; // Các nốt rút ngẫu nhiên
  roundCount: number;
  hintLevel: HintLevel; // Thường là 1 hoặc 2 (giảm dần gợi ý)
}

export type DiscoveryActivity =
  | NoteIntroActivity
  | FindKeyActivity
  | StaffRecognitionActivity
  | ListeningPracticeActivity
  | NoteSequenceActivity
  | MemoryChallengeActivity;

/** Tiêu chí hoàn thành / đánh giá một Stage */
export interface StageAssessment {
  minPracticeAccuracy: number; // Thường 0.80 (80%)
  minTestAccuracy: number; // Thường 0.85 (85%)
  requiresIndependentConfirmations: number; // Ít nhất 2 lần đánh giá độc lập
}

/** Cấu hình một Stage */
export interface DiscoveryStage {
  stageId: string;
  number: number; // 1..8
  title: string;
  subtitle: string;
  description: string;
  learningObjectives: string[];
  prerequisites: string[]; // Danh sách stageId cần đạt trước
  keyboardRange: { from: number; to: number };
  noteRange: number[]; // Danh sách MIDI nốt trọng tâm
  activities: DiscoveryActivity[];
  assessment: StageAssessment;
  reviewRules: {
    spacedIntervalDays: number[];
  };
}

/** Kỹ năng theo dõi riêng cho từng nốt */
export interface NoteSkillStats {
  midi: number;
  noteRecognitionAccuracy: number; // 0..1
  keyboardLocationAccuracy: number; // 0..1
  staffRecognitionAccuracy: number; // 0..1
  listeningDiscriminationAccuracy: number; // 0..1
  totalAttempts: number;
  totalCorrect: number;
  averageResponseTimeMs: number;
  hintUsageCount: number;
  consecutiveCorrect: number;
  recentMistakes: Record<string, number>; // "60->62": count
  lastPracticedAt: number;
  nextReviewAt: number;
  masteryLevel: MasteryLevel;
  evaluationCount: number;
}

/** Tiến độ toàn bộ module của một học viên */
export interface NoteDiscoveryProgress {
  profileKey: string;
  completedStages: Record<string, {
    passed: boolean;
    passedAt: number | null;
    bestScore: number;
    attempts: number;
    independentEvaluationsPassed: number;
  }>;
  currentStageId: string;
  noteSkills: Record<number, NoteSkillStats>;
  lastSessionAt: number;
}
