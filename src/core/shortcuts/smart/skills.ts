/**
 * Kỹ năng ↔ trò chơi cho gợi ý "Trò chơi phù hợp" (đặc tả 2.4).
 *
 * Mỗi trò chỉ gắn những kỹ năng mà CƠ CHẾ của nó thật sự luyện (docs/architecture.md) — không mặc định trò nào cũng
 * luyện mọi kỹ năng. Vd Thu hoạch cà chua "không có đồng hồ, không phạt khi suy nghĩ lâu" nên KHÔNG gắn "đọc nốt nhanh";
 * Bóng bay mặc định hiện tên nốt (Đô Rê Mi) nên gắn "tên nốt → phím", không gắn đọc khuông.
 * Kỹ năng của buổi học suy từ bài tập thật của buổi (`lessonSkills`).
 */
import type { CurriculumLesson, Illustration } from '../../curriculum/types';
import type { ArcadeKind } from '../../games/arcade';
import type { GameKind } from '../../games/gameForLesson';
import type { PageId, StandaloneGameId } from '../types';
import type { SkillTag } from './types';

export const SKILL_LABEL: Record<SkillTag, string> = {
  keyboard: 'nhận biết bàn phím',
  'note-names': 'tên nốt và vị trí phím',
  'staff-reading': 'đọc nốt trên khuông',
  'reading-speed': 'đọc nốt nhanh',
  rhythm: 'tiết tấu',
  ear: 'luyện tai',
  intervals: 'quãng',
  fingers: 'thế tay, số ngón',
  'two-hands': 'phối hợp hai tay',
};

/** Trò của buổi học + trò tự do (theo `GAME_INFO.skill`). */
export const GAME_KIND_SKILLS: Record<GameKind, readonly SkillTag[]> = {
  'note-catch': ['note-names', 'keyboard'],
  'key-hunt': ['keyboard'],
  'rhythm-train': ['rhythm'],
  'staff-shoot': ['staff-reading'],
  'echo-melody': ['ear'],
  'finger-quiz': ['fingers'],
  'note-sprint': ['staff-reading', 'reading-speed'],
  'ear-finder': ['ear'],
  'interval-detective': ['intervals'],
  'steady-beat': ['rhythm'],
};

/** Trò có màn riêng. */
export const STANDALONE_GAME_SKILLS: Record<StandaloneGameId, readonly SkillTag[]> = {
  // Bản nhạc tự chạy, dừng ở nốt mục tiêu chờ đánh đúng; có chế độ theo nhịp.
  'note-hunter': ['staff-reading', 'rhythm'],
  // Mỗi nốt đúng = một lần vỗ cánh (chim rơi liên tục → phải đọc nhanh); khu hướng dẫn có khuông + số ngón.
  'flappy-note': ['staff-reading', 'reading-speed', 'fingers'],
  // Bóng mang TÊN nốt bay lên trên phím của nó (mặc định Đô Rê Mi); bóng bay mất → mất mạng.
  'balloon-pop': ['note-names', 'keyboard'],
  // Đọc nốt trên khuông (có tên nốt ở mức Dễ / Vừa) — không đồng hồ.
  'tomato-harvest': ['staff-reading', 'note-names'],
  // Tay phải đọc nốt để giữ tốc độ, tay trái lái bằng hai phím.
  'f1-racing': ['staff-reading', 'reading-speed', 'two-hands'],
};

/** Màn luyện có kỹ năng rõ ràng. */
export const PAGE_SKILLS: Partial<Record<PageId, readonly SkillTag[]>> = {
  'five-finger': ['fingers', 'two-hands'],
};

/** Trò tự do: mức chơi dễ nhất làm đích gợi ý (người chơi tự đổi mức trong mục Trò chơi). */
export const ARCADE_STARTER_VARIANT: Record<ArcadeKind, string> = {
  'note-sprint': 'treble-5',
  'ear-finder': 'c-five',
  'interval-detective': 'steps-up',
  'steady-beat': 'bpm-60',
};

/** Hình minh hoạ dạy thế tay / số ngón (bàn tay, bàn phím ghi số ngón). */
function teachesFingers(ill: Illustration | undefined): boolean {
  return !!ill && (ill.type === 'hand' || (ill.type === 'keyboard' && !!ill.fingers && Object.keys(ill.fingers).length > 0));
}

/** Kỹ năng mà buổi học luyện — suy từ bài tập + hình minh hoạ thật của buổi (không đoán theo tên buổi). */
export function lessonSkills(lesson: Pick<CurriculumLesson, 'exercises' | 'activities'>): SkillTag[] {
  const out = new Set<SkillTag>();
  for (const ex of lesson.exercises) {
    switch (ex.kind) {
      case 'key-quiz':
        out.add('keyboard');
        if (ex.rounds.some((r) => r.target.type === 'midi' || r.target.type === 'pitch-class')) out.add('note-names');
        break;
      case 'note-reading':
        out.add('staff-reading');
        break;
      case 'play':
        if (ex.mode !== 'rhythm') out.add('staff-reading');
        if (ex.mode !== 'wait') out.add('rhythm');
        if (ex.piece.hand === 'both' || ex.piece.accompaniment) out.add('two-hands');
        break;
      case 'choice-quiz':
        if (ex.questions.some((q) => teachesFingers(q.illustration))) out.add('fingers');
        break;
    }
  }
  for (const activity of lesson.activities) {
    for (const page of activity.pages) {
      if ([page.illustration, ...(page.moreIllustrations ?? [])].some(teachesFingers)) out.add('fingers');
    }
  }
  return SKILL_ORDER.filter((s) => out.has(s));
}

/** Thứ tự cố định (kết quả ổn định giữa các lần tính). */
export const SKILL_ORDER: readonly SkillTag[] = ['note-names', 'keyboard', 'staff-reading', 'reading-speed', 'rhythm', 'fingers', 'two-hands', 'ear', 'intervals'];

/** Số kỹ năng chung của hai danh sách. */
export function skillOverlap(a: readonly SkillTag[], b: readonly SkillTag[]): SkillTag[] {
  return a.filter((s) => b.includes(s));
}
