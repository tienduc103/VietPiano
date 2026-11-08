/**
 * Gom "số lần dùng" của từng đích từ các kho kết quả SẴN CÓ (không thêm theo dõi mới):
 * lịch sử ván Thu hoạch cà chua / F1 / Săn nốt (có thời điểm), kỷ lục Flappy Note / Bóng bay / trò tự do / trò của buổi
 * (chỉ có tổng số ván, không có thời điểm), chuỗi "5 ngón · 8 nốt" (đếm số ngày luyện).
 * Hàm thuần: nơi gọi tự đọc kho của ĐÚNG hồ sơ rồi truyền vào.
 */
import type { ArcadeRecords } from '../../games/arcade';
import { guidedCourseOf } from '../../curriculum/content/guided';
import type { Records } from '../../curriculum/unlock';
import type { FiveFingerStats } from '../../fiveFinger/stats';
import { dayIndex } from '../../profile/assessment';
import type { ShortcutTarget } from '../types';
import { DAY_MS } from './context';
import type { UsageEntry } from './types';

export const USAGE_WINDOW_DAYS = 30;

/** Kho có thời điểm từng lần (ván / lần chơi): đếm trong cửa sổ, lần gần nhất. */
export function usageFromTimes(target: ShortcutTarget, times: readonly number[], now: number, windowDays = USAGE_WINDOW_DAYS): UsageEntry | null {
  const since = now - windowDays * DAY_MS;
  const recent = times.filter((t) => Number.isFinite(t) && t >= since && t <= now + DAY_MS);
  if (recent.length === 0) return null;
  return { target, uses: recent.length, lastAt: Math.max(...recent), windowDays, unit: 'play' };
}

/** Kho chỉ có số ván (kỷ lục theo mức chơi): tổng số ván, không có thời điểm. */
export function usageFromPlays(target: ShortcutTarget, records: Readonly<Record<string, { plays: number }>>): UsageEntry | null {
  const uses = Object.values(records).reduce((a, r) => a + (Number.isFinite(r.plays) && r.plays > 0 ? r.plays : 0), 0);
  return uses > 0 ? { target, uses, lastAt: null, windowDays: null, unit: 'play' } : null;
}

/** Trò tự do: mỗi mức chơi là một đích riêng (`arcade` id = `<loại trò>:<mức>`, cùng khoá kỷ lục). */
export function usageFromArcade(records: ArcadeRecords): UsageEntry[] {
  return Object.entries(records)
    .filter(([, r]) => r.plays > 0)
    .map(([key, r]) => ({ target: { type: 'arcade', id: key }, uses: r.plays, lastAt: null, windowDays: null, unit: 'play' }));
}

/** Trò sau buổi (`LessonRecord.games`): giáo trình chính → trò đó trong mục Trò chơi; giáo trình dẫn dắt → phần Trò chơi của buổi. */
export function usageFromLessonGames(records: Records): UsageEntry[] {
  const out: UsageEntry[] = [];
  for (const rec of Object.values(records)) {
    if (!rec) continue;
    if (guidedCourseOf(rec.lessonId)) {
      const plays = Object.values(rec.games).reduce((a, g) => a + g.plays, 0);
      if (plays > 0) out.push({ target: { type: 'lesson', id: rec.lessonId, params: { stage: 'game' } }, uses: plays, lastAt: null, windowDays: null, unit: 'play' });
      continue;
    }
    for (const [kind, g] of Object.entries(rec.games)) {
      if (g.plays > 0) out.push({ target: { type: 'lesson-game', id: `${rec.lessonId}:${kind}` }, uses: g.plays, lastAt: null, windowDays: null, unit: 'play' });
    }
  }
  return out;
}

/** "5 ngón · 8 nốt": số NGÀY có luyện trong cửa sổ (mỗi chuỗi chỉ 8 nốt — đếm chuỗi sẽ thổi phồng). */
export function usageFromFiveFinger(stats: FiveFingerStats | null, now: number, tzOffsetMin: number, windowDays = USAGE_WINDOW_DAYS): UsageEntry | null {
  if (!stats) return null;
  const since = now - windowDays * DAY_MS;
  const times = stats.history.map((h) => h.at).filter((t) => Number.isFinite(t) && t >= since);
  if (times.length === 0) return null;
  const days = new Set(times.map((t) => dayIndex(t, tzOffsetMin))).size;
  return { target: { type: 'page', id: 'five-finger' }, uses: days, lastAt: Math.max(...times), windowDays, unit: 'day' };
}
