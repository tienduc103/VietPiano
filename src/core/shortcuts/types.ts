/**
 * Lối tắt cá nhân (Quick Access) — kiểu dữ liệu dùng chung.
 *
 * Một lối tắt KHÔNG lưu đường dẫn / URL: chỉ lưu đích đến có kiểu (`ShortcutTarget`) gồm loại đích, ID ổn định
 * của nội dung (route, levelId, lessonId…) và vài tham số điều hướng được phép. Mỗi loại đích ánh xạ tới đúng MỘT
 * route sẵn có của app (`store/shortcutRoutes.ts`) — không có router thứ hai.
 */
import type { BalloonSettings } from '../balloonPop/storage';
import type { StandaloneGameId } from '../games/catalog';

export type { StandaloneGameId };

/**
 * page        : màn cố định (id = tên route: 'curriculum', 'library', 'games'…).
 * game        : trò chơi có màn riêng (id = tên route: 'flappy-note', 'tomato-harvest'…).
 * level       : một cấp của giáo trình chính (id = levelId).
 * lesson      : một buổi học — giáo trình chính, "Làm quen từng nốt" (sup-…), "Khám phá nốt nhạc" (nd-…) (id = lessonId).
 * practice    : một bài ở Thư viện bài / Thư viện bài hát, mở màn Luyện tập (id = Lesson.id).
 * arcade      : trò tự do có mức chơi soạn sẵn trong mục Trò chơi (id = `<loại trò>:<mức>`).
 * lesson-game : trò của một buổi học trong mục Trò chơi (id = `<lessonId>:<loại trò>`).
 */
export type ShortcutTargetType = 'page' | 'game' | 'level' | 'lesson' | 'practice' | 'arcade' | 'lesson-game';

export const SHORTCUT_TARGET_TYPES: readonly ShortcutTargetType[] = ['page', 'game', 'level', 'lesson', 'practice', 'arcade', 'lesson-game'];

/** Màn cố định tạo được lối tắt (trùng tên route). Trang chủ không có — thanh lối tắt nằm ở đó. */
export type PageId = 'curriculum' | 'supplement' | 'note-discovery' | 'library' | 'song-library' | 'games' | 'five-finger' | 'coach' | 'settings';

/** Phần mở thẳng của buổi học: Luyện tập sau buổi / Trò chơi sau buổi (không có = trang tổng quan buổi). */
export type LessonStage = 'review' | 'game';

/** Cấu hình mở sẵn của Bóng bay nốt nhạc — chỉ các khoá route `balloon-pop.preset` dùng (vd "Tìm nốt Đô" từ bài học). */
export type BalloonPreset = Partial<Pick<BalloonSettings, 'game' | 'huntLetters' | 'mode' | 'hand' | 'difficulty' | 'speed' | 'display' | 'staffClef' | 'labelStyle'>>;

/** Tham số điều hướng được phép — mỗi loại đích chỉ nhận một số khoá (xem `sanitizeTarget`). */
export interface ShortcutParams {
  /** `lesson`: mở thẳng phần Luyện tập ('review', chỉ giáo trình chính) hoặc Trò chơi ('game'). */
  stage?: LessonStage;
  /** `practice`: luyện riêng đoạn ô [từ, tới] (số ô in trên bản nhạc). */
  measures?: [number, number];
  /** `game` balloon-pop: cấu hình mở sẵn. */
  preset?: BalloonPreset;
}

export interface ShortcutTarget {
  type: ShortcutTargetType;
  /** ID ổn định của nội dung — không phụ thuộc tên hiển thị. */
  id: string;
  params?: ShortcutParams;
}

/** Màu nền nhẹ của nút lối tắt (khoá bảng màu, không lưu CSS tuỳ ý). */
export type ShortcutColor = 'violet' | 'pink' | 'amber' | 'emerald' | 'sky' | 'rose' | 'orange' | 'slate';

export const SHORTCUT_COLORS: readonly ShortcutColor[] = ['violet', 'pink', 'amber', 'emerald', 'sky', 'rose', 'orange', 'slate'];

export interface Shortcut {
  id: string;
  /** Hồ sơ sở hữu (id hồ sơ, hoặc "guest" khi chưa có hồ sơ). */
  profileId: string;
  /** Tên hiển thị do người dùng đặt. */
  name: string;
  /** Biểu tượng (emoji). */
  icon: string;
  color: ShortcutColor;
  target: ShortcutTarget;
  /** Thứ tự (0 = đầu tiên); danh sách luôn được đánh lại liên tục 0, 1, 2… */
  order: number;
  /** Hiện thành nút trên thanh lối tắt ở trang chủ. */
  showOnHome: boolean;
  createdAt: number;
  updatedAt: number;
}

/** Dữ liệu người dùng nhập khi tạo / sửa. */
export interface ShortcutInput {
  name: string;
  icon: string;
  color: ShortcutColor;
  target: ShortcutTarget;
  showOnHome?: boolean;
}

/**
 * Đề xuất hiện cạnh lối tắt thủ công (vd "Lối tắt thông minh" tự tính) — CHỈ để hiển thị, không lưu như lối tắt:
 * thanh trang chủ đặt sau các lối tắt thủ công khi còn chỗ, menu ⋯ có nhóm riêng; "Ghim" mở hộp thoại tạo lối tắt thường.
 */
export interface ShortcutSuggestion {
  /** Khoá ổn định của đề xuất (React key). */
  key: string;
  name: string;
  icon: string;
  target: ShortcutTarget;
  /** Lý do đề xuất (chú thích / tooltip), vd "Học tiếp buổi đang dở". */
  reason?: string;
}

export const SHORTCUT_NAME_MAX = 40;
/** Đủ cho emoji ghép (cờ, gia đình…), tính theo đơn vị UTF-16. */
export const SHORTCUT_ICON_MAX = 16;
/** Giới hạn an toàn cho bộ nhớ trình duyệt — không phải giới hạn hiển thị (thanh chỉ hiện 2–3 nút). */
export const MAX_SHORTCUTS = 100;
/** Số nút tối đa hiện thẳng trên thanh trang chủ; còn lại vào menu ⋯. */
export const HOME_BAR_MAX = 3;
