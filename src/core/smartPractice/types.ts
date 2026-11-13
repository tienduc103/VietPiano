/**
 * AI Smart Practice — mô-đun DÙNG CHUNG cho mọi nội dung có `Lesson` (bài kỹ thuật, bài hát, bài hai tay, giáo trình…).
 * Đầu vào: bài gốc (`Lesson` → `ScoreReference`) + kết quả chấm của Coach (`ScoringResult`, tất định) + hồ sơ người học.
 * Không có logic riêng cho từng trang bài hát (docs/finger-coach/architecture.md).
 */
import type { Hand } from '../lessons/types';

export type PassageErrorType = 'wrong-note' | 'missing-note' | 'extra-note' | 'slow-transition' | 'rushed-transition' | 'hesitation' | 'hands-async';

export const PASSAGE_ERROR_LABEL: Record<PassageErrorType, string> = {
  'wrong-note': 'đánh sai nốt',
  'missing-note': 'bỏ sót nốt',
  'extra-note': 'đánh thừa nốt',
  'slow-transition': 'chuyển nốt chậm',
  'rushed-transition': 'chuyển nốt vội',
  hesitation: 'bị ngắt quãng',
  'hands-async': 'hai tay chưa cùng lúc',
};

export type PracticeStrategy = 'slow' | 'hands-separate' | 'note-reading' | 'rhythm' | 'isolate';

export const STRATEGY_LABEL: Record<PracticeStrategy, string> = {
  slow: 'Tách đoạn ngắn, tập chậm rồi tăng dần',
  'hands-separate': 'Tập từng tay rồi ghép hai tay thật chậm',
  'note-reading': 'Đọc kỹ nốt + ngón, tập chậm từng nốt',
  rhythm: 'Tập với máy đếm nhịp, giữ nốt đều',
  isolate: 'Tách riêng đoạn, lặp vài lần cho chắc',
};

export interface DifficultPassage {
  /** `${referenceId}:${startGroup}-${endGroup}` — ổn định giữa các lần tính. */
  id: string;
  profileKey: string;
  /** Bài gốc (`Lesson.id`) và bản tham chiếu đã dùng để chấm. */
  sourceId: string;
  referenceId: string;
  /** Nhóm nốt (cùng phách) trong `ScoreReference.groups` — lỗi nằm ở chỗ chuyển VÀO `startGroup` … tới `endGroup`. */
  startGroup: number;
  endGroup: number;
  /** Chỉ số nốt trên khuông (`lesson.notes`) đầu / cuối đoạn — để tô khuông, hiển thị. */
  startNoteIndex: number;
  endNoteIndex: number;
  measure: number;
  toMeasure: number;
  /** Tay có lỗi trong đoạn. */
  handMode: 'both' | Hand;
  errorTypes: { type: PassageErrorType; sessions: number }[];
  primaryError: PassageErrorType;
  /** Tỉ lệ phiên có lỗi trong đoạn / phiên có chấm đoạn này (0..1). */
  errorFrequency: number;
  /** Trung vị độ trễ thêm ở chỗ chuyển (ms) — chỉ khi có lỗi chuyển nốt chậm. */
  timingDeviationMs: number | null;
  confidence: 'medium' | 'high';
  evidenceSessionIds: string[];
  analyzedSessions: number;
  /** Lỗi nhiều hơn rõ rệt ở tempo cao. */
  tempoSensitive: boolean;
  strategy: PracticeStrategy;
  /** Tên nốt (giai điệu / nốt thấp nhất của nhóm) từ nhóm trước chỗ chuyển tới hết đoạn. */
  noteNames: string[];
}

/** Bài luyện bổ trợ sinh từ đoạn khó. Lesson SINH LẠI từ bài gốc theo `id` (không lưu nốt → không lệch dữ liệu bài). */
export interface RemedialExercise {
  /** `rem:<bài gốc>:<nhóm đầu>-<nhóm cuối>` */
  id: string;
  profileKey: string;
  sourceId: string;
  sourceTitle: string;
  passageId: string | null;
  startGroup: number;
  endGroup: number;
  /** 0 = ngắn nhất (3 nhóm), 1, 2 = mở rộng dần (ví dụ Rê–Mi–Fa → Rê–Mi–Fa–Sol → Đô–Rê–Mi–Fa–Sol). */
  variant: number;
  noteNames: string[];
  /** Tempo gợi ý lúc tạo (♩/phút). */
  tempo: number;
  handMode: 'both' | Hand;
  /** Cắt theo ô nhịp vì không có ranh giới an toàn trong phạm vi nốt (hợp âm / nốt ngân của tay kia). */
  byMeasures?: [number, number];
  createdAt: number;
  status: 'active' | 'mastered' | 'dismissed';
}

/** Kết quả đánh giá hiệu quả luyện bổ trợ. */
export interface RemedialOutcome {
  remedialAttempts: number;
  remedialPassed: number;
  /** Đạt ≥ 2 lượt liên tiếp gần nhất. */
  stable: boolean;
  /** Tỉ lệ lỗi đoạn này trong bài gốc trước / sau khi luyện bổ trợ (null = chưa có dữ liệu). */
  errorRateBefore: number | null;
  errorRateAfter: number | null;
  verdict: 'improved' | 'no-change' | 'not-enough-data';
  next: 'keep-practicing' | 'slower' | 'extend' | 'return-to-source';
  reason: string;
}

export interface TempoAttempt {
  at: number;
  bpm: number;
  passed: boolean;
  score: number;
}

export interface AdaptiveTempo {
  /** Tempo nên dùng cho lượt tới. */
  recommendedBpm: number;
  action: 'start' | 'increase' | 'hold' | 'decrease';
  /** Tempo ổn định cao nhất đã xác minh (≥ 2 lượt đạt, lượt gần nhất ở tempo đó không trượt). */
  stableBpm: number | null;
  reason: string;
  attempts: TempoAttempt[];
}
