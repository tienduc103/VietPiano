/**
 * Lối tắt thông minh (Smart Shortcuts) — đề xuất TỰ TÍNH từ tiến độ / lịch sử học của MỘT hồ sơ (docs/smart-shortcuts.md).
 *
 * - Dùng chung kiểu đích `ShortcutTarget` và registry (`targetKey`, `targetStatus`, `resolveTarget`) với lối tắt thủ công:
 *   cùng cách định danh, cùng điều hướng — không có hệ thống điều hướng riêng.
 * - KHÔNG lưu như lối tắt thủ công: danh sách tính lại được bất cứ lúc nào; chỉ lưu cache thứ tự (stability.ts),
 *   cài đặt + đề xuất đã ẩn theo hồ sơ (settings.ts).
 * - Engine chỉ ĐỌC khoá đích của lối tắt thủ công để bỏ đề xuất trùng — không bao giờ tạo / sửa / xoá / đổi thứ tự chúng.
 * - Quy tắc thuần (rule-based), không cần AI; điểm mở rộng cho AI cục bộ ở ai.ts (tuỳ chọn, chưa bật).
 */
import type { ShortcutTarget } from '../types';
import type { Hand } from '../../lessons/types';

/**
 * continue : buổi học / bài luyện đang dở + buổi tiếp theo đã mở (đặc tả 2.1).
 * weakness : luyện lại điểm yếu có bằng chứng (2.2).
 * practice : bài luyện vừa sức ở Thư viện (2.3).
 * game     : trò chơi luyện đúng kỹ năng đang học (2.4).
 * frequent : nội dung hay dùng (2.5).
 * review   : ôn lại bài đã học lâu chưa luyện (2.6).
 */
export type SmartType = 'continue' | 'weakness' | 'review' | 'practice' | 'game' | 'frequent';

export const SMART_TYPES: readonly SmartType[] = ['continue', 'weakness', 'review', 'practice', 'game', 'frequent'];

export const SMART_TYPE_LABEL: Record<SmartType, string> = {
  continue: 'Tiếp tục học',
  weakness: 'Luyện điểm yếu',
  review: 'Ôn tập',
  practice: 'Bài luyện phù hợp',
  game: 'Trò chơi phù hợp',
  frequent: 'Nội dung thường chơi',
};

/**
 * Điểm cơ sở thang 0–100 (đặc tả mục 4) — chỉ để thử nghiệm thứ tự, KHÔNG phải đánh giá năng lực học viên.
 * `next`: buổi tiếp theo (thuộc loại continue); `practice` bằng `next` nhưng thua khi hoà (giáo trình là lộ trình chính).
 */
export const BASE_SCORE = {
  inProgress: 100,
  weakness: 85,
  reviewDue: 75,
  next: 70,
  practice: 70,
  game: 60,
  frequent: 50,
} as const;

/** Điểm cộng tối đa của từng nhóm (độ mới, mức nghiêm trọng…) — luôn thấp hơn nhóm ngay trên nó. */
export const MAX_BONUS: Record<keyof typeof BASE_SCORE, number> = {
  inProgress: 0,
  weakness: 9,
  reviewDue: 9,
  next: 4,
  practice: 4,
  game: 9,
  frequent: 9,
};

/** Thứ tự loại khi hoà điểm (tie-breaker ổn định thứ hai, sau điểm). */
export const TYPE_PRIORITY: Record<SmartType, number> = { continue: 0, weakness: 1, review: 2, practice: 3, game: 4, frequent: 5 };

/** Nguồn lịch sử dùng cho "Nội dung thường chơi". */
export type UsageUnit = 'session' | 'play' | 'day';

/** Số lần dùng một đích (gom từ kho kết quả sẵn có — không đếm lượt mở trang). */
export interface UsageEntry {
  target: ShortcutTarget;
  uses: number;
  /** Lần gần nhất; null = kho đó không lưu thời điểm. */
  lastAt: number | null;
  /** Số ngày đã gom (null = toàn bộ lịch sử của kho). */
  windowDays: number | null;
  unit: UsageUnit;
}

export type SkillTag =
  | 'keyboard' // nhận biết bàn phím, tìm phím
  | 'note-names' // tên nốt → phím
  | 'staff-reading' // đọc nốt trên khuông
  | 'reading-speed' // đọc nốt nhanh
  | 'rhythm' // tiết tấu / trường độ / giữ nhịp
  | 'ear' // luyện tai
  | 'intervals' // quãng
  | 'fingers' // thế tay / số ngón
  | 'two-hands'; // phối hợp hai tay

/** Bằng chứng (số liệu thật) của đề xuất — lý do hiển thị được dựng từ đây; AI cục bộ (P8) chỉ nhận phần này. */
export type SmartEvidence =
  | { kind: 'lesson-in-progress'; lessonId: string; exercisesPassed: number; exercisesTotal: number; lastPracticedAt: number }
  | { kind: 'practice-unfinished'; lessonId: string; notesReached: number; totalNotes: number; at: number }
  | { kind: 'next-lesson'; lessonId: string; passedInLevel: number; levelTotal: number; first: boolean }
  | { kind: 'trouble-note'; midi: number; attempts: number; misses: number; sessions: number; confusedWith: number | null }
  | { kind: 'curriculum-confusion'; pitch: string; count: number; lessons: number }
  | { kind: 'low-accuracy'; lessonId: string; accuracy: number; sessions: number; notes: number }
  | { kind: 'slow-reading'; avgMs: number; targetMs: number; notes: number }
  | { kind: 'five-finger-hand'; hand: Hand; accuracy: number; notes: number }
  | { kind: 'review-due'; lessonId: string; daysSince: number; intervalDays: number; bestScore: number; source: 'curriculum' | 'library' }
  | { kind: 'recommended'; lessonId: string; why: string; targetDifficulty: 1 | 2 | 3 }
  | { kind: 'skill-match'; lessonId: string; skills: SkillTag[] }
  | { kind: 'usage'; uses: number; unit: UsageUnit; windowDays: number | null; lastAt: number | null };

/** Đề xuất trước khi qua bộ lọc (do từng quy tắc sinh ra). */
export interface SmartDraft {
  type: SmartType;
  target: ShortcutTarget;
  /** Động từ đứng trước tên đích: "Tiếp tục" → "Tiếp tục — Buổi 2: Tìm nốt Đô". Không có → chỉ tên đích. */
  verb?: string;
  /** Tên tự đặt (thay "verb — tên đích"), vd "Luyện lại nốt Pha". */
  label?: string;
  /** Biểu tượng riêng; không có → biểu tượng của đích trong registry. */
  icon?: string;
  reason: string;
  evidence: SmartEvidence;
  score: number;
}

export interface SmartCandidate {
  /** Khoá ổn định của đề xuất: loại + khoá đích (dùng khoá thứ tự, React key, tie-breaker). */
  candidateKey: string;
  /** Khoá đích chuẩn hoá — CÙNG hàm `targetKey` với lối tắt thủ công (loại trùng, ẩn theo nội dung). */
  targetKey: string;
  profileId: string;
  type: SmartType;
  target: ShortcutTarget;
  /** Tên trên nút. */
  label: string;
  icon: string;
  /** Lý do ngắn dựa trên số liệu đã lưu (tooltip / dòng phụ trong menu). */
  reason: string;
  evidence: SmartEvidence;
  score: number;
  calculatedAt: number;
  expiresAt: number;
  status: 'active';
}

/** Lý do một đề xuất không được hiện (để test / gỡ lỗi; không hiện cho người học). */
export type SmartExclusion = 'type-disabled' | 'dismissed' | 'pinned' | 'missing' | 'locked' | 'duplicate' | 'limit';

export interface SmartResult {
  profileId: string;
  /** Đã lọc + xếp hạng, ưu tiên cao trước. */
  candidates: SmartCandidate[];
  excluded: { candidateKey: string; targetKey: string; type: SmartType; why: SmartExclusion }[];
  calculatedAt: number;
  expiresAt: number;
}
