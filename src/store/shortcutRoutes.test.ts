import { beforeEach, describe, expect, it } from 'vitest';
import { allDestinations } from '../core/shortcuts/registry';
import { LESSONS } from '../core/lessons/library';
import type { ShortcutTarget } from '../core/shortcuts/types';
import { useApp, type Route } from './appStore';
import { openTarget, routeToTarget, targetToRoute } from './shortcutRoutes';

describe('lối tắt ↔ route sẵn có của app', () => {
  beforeEach(() => useApp.setState({ route: { name: 'dashboard' }, previous: null }));

  it('mỗi loại đích → đúng route', () => {
    const cases: [ShortcutTarget, Route][] = [
      [{ type: 'page', id: 'library' }, { name: 'library' }],
      [{ type: 'page', id: 'settings' }, { name: 'settings' }],
      [{ type: 'game', id: 'tomato-harvest' }, { name: 'tomato-harvest' }],
      [
        { type: 'game', id: 'balloon-pop', params: { preset: { game: 'hunt', huntLetters: ['C'] } } },
        { name: 'balloon-pop', preset: { game: 'hunt', huntLetters: ['C'] } },
      ],
      [
        { type: 'level', id: 'level-3' },
        { name: 'curriculum', levelId: 'level-3' },
      ],
      [
        { type: 'lesson', id: 'l1-02-find-c', params: { stage: 'game' } },
        { name: 'lesson', lessonId: 'l1-02-find-c', stage: 'game' },
      ],
      [
        { type: 'lesson', id: 'sup-c' },
        { name: 'lesson', lessonId: 'sup-c' },
      ],
      [
        { type: 'arcade', id: 'ear-finder:c-five' },
        { name: 'games', open: { type: 'arcade', kind: 'ear-finder', variant: 'c-five' } },
      ],
      [
        { type: 'lesson-game', id: 'l1-01-keyboard:key-hunt' },
        { name: 'games', open: { type: 'lesson', lessonId: 'l1-01-keyboard', kind: 'key-hunt' } },
      ],
    ];
    for (const [target, route] of cases) expect(targetToRoute(target), JSON.stringify(target)).toEqual(route);
    const rep = LESSONS.find((l) => l.repertoire)!;
    expect(targetToRoute({ type: 'practice', id: rep.id })).toEqual({ name: 'practice', lessonId: rep.id, fromSongs: true });
    const song = LESSONS.find((l) => l.category === 'song' && !l.repertoire && !l.pickup)!;
    expect(targetToRoute({ type: 'practice', id: song.id, params: { measures: [1, 2] } })).toEqual({ name: 'practice', lessonId: song.id, measures: [1, 2] });
  });

  it('đích không còn / không hợp lệ → không có route', () => {
    expect(targetToRoute({ type: 'lesson', id: 'l9-99-gone' })).toBeNull();
    expect(targetToRoute({ type: 'page', id: 'dashboard' as never })).toBeNull();
    expect(targetToRoute({ type: 'game', id: 'https://x' as never })).toBeNull();
  });

  it('mọi đích của bộ chọn đều có route, và route → đích cho lại đúng đích (nút Ghim)', () => {
    for (const d of allDestinations()) {
      const route = targetToRoute(d.target);
      expect(route, JSON.stringify(d.target)).not.toBeNull();
      expect(routeToTarget(route!), JSON.stringify(d.target)).toEqual(d.target);
    }
  });

  it('màn không ghim được: trang chủ; Coach chỉ ghim màn chính', () => {
    expect(routeToTarget({ name: 'dashboard' })).toBeNull();
    expect(routeToTarget({ name: 'coach', lessonId: 'x', measures: [1, 2] })).toEqual({ type: 'page', id: 'coach' });
    expect(routeToTarget({ name: 'curriculum' })).toEqual({ type: 'page', id: 'curriculum' });
    expect(routeToTarget({ name: 'settings', section: 'shortcuts' })).toEqual({ type: 'page', id: 'settings' });
    expect(routeToTarget({ name: 'lesson', lessonId: 'gone' })).toBeNull();
  });

  it('mở: điều hướng qua router; bài thư viện qua openLesson (ghi bài gần đây); đích mất → false', () => {
    expect(openTarget({ type: 'lesson', id: 'l1-02-find-c', params: { stage: 'review' } })).toBe(true);
    expect(useApp.getState().route).toEqual({ name: 'lesson', lessonId: 'l1-02-find-c', stage: 'review' });
    expect(useApp.getState().previous).toEqual({ name: 'dashboard' });

    const song = LESSONS.find((l) => l.category === 'song' && !l.repertoire)!;
    expect(openTarget({ type: 'practice', id: song.id })).toBe(true);
    expect(useApp.getState().route).toEqual({ name: 'practice', lessonId: song.id });
    expect(useApp.getState().recent[0]).toBe(song.id);

    const before = useApp.getState().route;
    expect(openTarget({ type: 'practice', id: 'bai-da-xoa' })).toBe(false);
    expect(useApp.getState().route).toBe(before);
  });
});
