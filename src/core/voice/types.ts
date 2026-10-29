/**
 * Kiểu dữ liệu của cô giáo giọng nói (VoiceTeacher) — hướng dẫn bằng tiếng Việt cho bé chưa biết đọc.
 * Không phụ thuộc React hay trình duyệt; phần phát thật nằm ở `speakers.ts`.
 */

/** Sự kiện làm cô giáo lên tiếng. `step_start` = mở một trang giới thiệu / bài tập (đọc lời dặn). */
export type VoiceTrigger = 'lesson_start' | 'step_start' | 'note_expected' | 'note_correct' | 'note_wrong' | 'timeout' | 'lesson_complete';

export const VOICE_TRIGGERS: readonly VoiceTrigger[] = ['lesson_start', 'step_start', 'note_expected', 'note_correct', 'note_wrong', 'timeout', 'lesson_complete'];

/**
 * Một câu hướng dẫn. Dữ liệu bài học (giáo trình) khai báo được bằng `voice: VoiceCue[]`;
 * câu mặc định sinh ở `phrases.ts`.
 */
export interface VoiceCue {
  /** Khoá chống lặp (cooldown) — cùng id thì coi là cùng một câu. Mặc định = trigger. */
  id?: string;
  trigger: VoiceTrigger;
  /** Chữ hiển thị (bong bóng lời thoại, phụ huynh đọc được). */
  instructionText: string;
  /** Chữ đọc cho bé (có thể khác chữ hiển thị, vd viết "C4" nhưng đọc "Đô"). Mặc định = instructionText. */
  voiceText?: string;
  /** File ghi âm sẵn (đường dẫn tương đối trong `public/`, vd "voice/l1-01-start.mp3") — ưu tiên hơn TTS. */
  audioAsset?: string;
  /** Câu ưu tiên cao hơn được ngắt câu đang đọc; thấp hơn thì chờ. Mặc định theo trigger (`DEFAULT_PRIORITY`). */
  priority?: number;
  /** Không đọc lại cùng id trong khoảng này (ms). Mặc định theo trigger (`DEFAULT_COOLDOWN_MS`). */
  cooldownMs?: number;
}

export const DEFAULT_PRIORITY: Record<VoiceTrigger, number> = {
  note_expected: 1,
  note_correct: 1,
  timeout: 2,
  note_wrong: 2,
  step_start: 3,
  lesson_start: 3,
  lesson_complete: 4,
};

export const DEFAULT_COOLDOWN_MS: Record<VoiceTrigger, number> = {
  note_expected: 0,
  note_correct: 0,
  timeout: 0,
  note_wrong: 2500,
  step_start: 0,
  lesson_start: 0,
  lesson_complete: 0,
};

/** Một lần phát (TTS hoặc file); `done` resolve khi đọc xong, bị huỷ hoặc lỗi. */
export interface SpeechHandle {
  done: Promise<void>;
  cancel(): void;
}

/** Nguồn phát giọng nói (trình duyệt: `HybridSpeaker`; test: giả). */
export interface Speaker {
  /** null = không phát được câu này (không có file, không có giọng tiếng Việt) → chỉ hiện chữ. */
  speak(cue: { text: string; audioAsset?: string }, rate: number): SpeechHandle | null;
  /** Gọi trong thao tác người dùng (Safari / iPad chỉ cho phát âm thanh sau một lần chạm). */
  unlock(): void;
}
