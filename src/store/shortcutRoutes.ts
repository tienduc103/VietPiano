/**
 * Cầu nối lối tắt ↔ router SẴN CÓ của app (`appStore.Route`): mỗi loại đích ánh xạ tới đúng một route,
 * điều hướng luôn qua `navigate` / `openLesson` như khi bấm nút trong app — không có router thứ hai, không URL.
 * Màn đích tự áp quy tắc của nó (giới hạn thời gian chơi, "Nên học trước…" của giáo trình…).
 */
import { isArcadeKind } from '../core/games/arcade';
import type { GameKind } from '../core/games/gameForLesson';
import { lessonManager } from '../core/lessons/LessonManager';
import { isPageId, isStandaloneGameId, parseLessonGameId, resolveTarget, sanitizeBalloonPreset } from '../core/shortcuts/registry';
import type { ShortcutTarget } from '../core/shortcuts/types';
import { useApp, type Route } from './appStore';

/** Route của một đích; null khi đích không còn tồn tại / tham số không hợp lệ. */
export function targetToRoute(raw: ShortcutTarget): Route | null {
  const dest = resolveTarget(raw);
  if (!dest) return null;
  const t = dest.target;
  const p = t.params ?? {};
  switch (t.type) {
    case 'page':
      if (!isPageId(t.id)) return null;
      return { name: t.id };
    case 'game':
      if (!isStandaloneGameId(t.id)) return null;
      return t.id === 'balloon-pop' && p.preset ? { name: 'balloon-pop', preset: p.preset } : { name: t.id };
    case 'level':
      return { name: 'curriculum', levelId: t.id };
    case 'lesson':
      return { name: 'lesson', lessonId: t.id, ...(p.stage ? { stage: p.stage } : {}) };
    case 'practice':
      return {
        name: 'practice',
        lessonId: t.id,
        // Bài tuyển tập khuông đôi chỉ có ở Thư viện bài hát → nút quay lại về trang đó.
        ...(lessonManager.get(t.id)?.repertoire ? { fromSongs: true } : {}),
        ...(p.measures ? { measures: p.measures } : {}),
      };
    case 'arcade': {
      const [kind, variant] = t.id.split(':');
      return isArcadeKind(kind) ? { name: 'games', open: { type: 'arcade', kind, variant } } : null;
    }
    case 'lesson-game': {
      const g = parseLessonGameId(t.id);
      return g ? { name: 'games', open: { type: 'lesson', lessonId: g.lessonId, kind: g.kind as GameKind } } : null;
    }
  }
}

/**
 * Đích của màn đang mở (nút "Ghim lối tắt"); null khi màn không ghim được (trang chủ) hoặc nội dung không có trong registry.
 * Màn có trạng thái riêng (cấp đang xem, phần của buổi học, trò đang chơi…) tự dựng đích chính xác hơn.
 */
export function routeToTarget(route: Route): ShortcutTarget | null {
  let t: ShortcutTarget | null;
  switch (route.name) {
    case 'dashboard':
      t = null;
      break;
    case 'curriculum':
      t = route.levelId ? { type: 'level', id: route.levelId } : { type: 'page', id: 'curriculum' };
      break;
    case 'lesson':
      t = { type: 'lesson', id: route.lessonId, ...(route.stage ? { params: { stage: route.stage } } : {}) };
      break;
    case 'practice':
      t = { type: 'practice', id: route.lessonId, ...(route.measures ? { params: { measures: route.measures } } : {}) };
      break;
    case 'games':
      t = !route.open
        ? { type: 'page', id: 'games' }
        : route.open.type === 'arcade'
          ? { type: 'arcade', id: `${route.open.kind}:${route.open.variant}` }
          : { type: 'lesson-game', id: `${route.open.lessonId}:${route.open.kind}` };
      break;
    case 'balloon-pop': {
      const preset = sanitizeBalloonPreset(route.preset);
      t = { type: 'game', id: 'balloon-pop', ...(preset ? { params: { preset } } : {}) };
      break;
    }
    // Coach: chỉ ghim được màn chính (chưa ghim bài / đoạn đang chấm).
    case 'coach':
      t = { type: 'page', id: 'coach' };
      break;
    default:
      t = isPageId(route.name) ? { type: 'page', id: route.name } : isStandaloneGameId(route.name) ? { type: 'game', id: route.name } : null;
  }
  return t ? (resolveTarget(t)?.target ?? null) : null;
}

/**
 * Mở một đích. Trả false khi đích không còn tồn tại (người gọi báo cho người dùng).
 * Bài thư viện mở qua `openLesson` (ghi "bài gần đây" như khi bấm trong thư viện).
 */
export function openTarget(raw: ShortcutTarget): boolean {
  const route = targetToRoute(raw);
  if (!route) return false;
  const app = useApp.getState();
  if (route.name === 'practice') {
    app.openLesson(route.lessonId, route.measures, route.fromSongs);
    return true;
  }
  // Thư viện bài nằm ngay trên trang chủ: đang ở trang chủ thì chỉ cuộn xuống.
  if (route.name === 'library' && (app.route.name === 'dashboard' || app.route.name === 'library') && typeof document !== 'undefined') {
    const el = document.getElementById('library');
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return true;
    }
  }
  app.navigate(route);
  return true;
}
