import { describe, expect, it } from 'vitest';
import { CURRICULUM } from '../curriculum/content/curriculum';
import { DISCOVERY } from '../curriculum/content/discovery';
import { SUPPLEMENT } from '../curriculum/content/supplement';
import { emptyRecord } from '../curriculum/progress';
import { findLesson } from '../curriculum/unlock';
import { ARCADE_KINDS, ARCADE_VARIANTS } from '../games/arcade';
import { curriculumGameIndex, STANDALONE_GAMES } from '../games/catalog';
import { LESSONS } from '../lessons/library';
import {
  allDestinations,
  browseTree,
  foldSearchText,
  PAGES,
  resolveTarget,
  sanitizeBalloonPreset,
  sanitizeTarget,
  searchDestinations,
  stageOptions,
  targetKey,
  targetStatus,
} from './registry';
import type { ShortcutTarget } from './types';

const count = (type: ShortcutTarget['type']) => allDestinations().filter((d) => d.target.type === type).length;

describe('ShortcutRegistry — đích đến suy từ dữ liệu của app', () => {
  it('mọi đích đến đều mở được, khoá không trùng, ID qua được bước làm sạch', () => {
    const all = allDestinations();
    const keys = new Set(all.map((d) => targetKey(d.target)));
    expect(keys.size).toBe(all.length);
    for (const d of all) {
      expect(sanitizeTarget(d.target)).toEqual(d.target);
      expect(resolveTarget(d.target)?.title).toBe(d.title);
    }
  });

  it('số đích mỗi loại khớp dữ liệu (không có danh sách giả)', () => {
    const available = CURRICULUM.levels.filter((l) => l.availability === 'available');
    expect(count('page')).toBe(PAGES.length);
    expect(count('game')).toBe(STANDALONE_GAMES.length);
    expect(count('level')).toBe(available.length);
    expect(count('lesson')).toBe(available.reduce((a, l) => a + l.lessons.length, 0) + SUPPLEMENT.levels[0].lessons.length + DISCOVERY.levels[0].lessons.length);
    expect(count('practice')).toBe(LESSONS.length);
    expect(count('arcade')).toBe(ARCADE_KINDS.reduce((a, k) => a + ARCADE_VARIANTS[k].length, 0));
    expect(count('lesson-game')).toBe(curriculumGameIndex().reduce((a, e) => a + e.specs.length, 0));
  });

  it('trang, trò chơi, cấp độ', () => {
    expect(resolveTarget({ type: 'page', id: 'games' })?.title).toBe('Trò chơi');
    expect(resolveTarget({ type: 'page', id: 'dashboard' })).toBeNull();
    const tomato = resolveTarget({ type: 'game', id: 'tomato-harvest' });
    expect(tomato).toMatchObject({ title: 'Thu hoạch cà chua', icon: '🍅', path: ['Trò chơi'] });
    expect(resolveTarget({ type: 'level', id: 'level-2' })?.shortName).toBe('Cấp 2');
    expect(resolveTarget({ type: 'level', id: 'level-99' })).toBeNull();
  });

  it('buổi học: tên theo buổi, phần mở thẳng hợp lệ theo giáo trình', () => {
    const lesson = resolveTarget({ type: 'lesson', id: 'l1-02-find-c' });
    expect(lesson?.title).toBe('Buổi 2: Tìm nốt Đô');
    expect(lesson?.path).toEqual(['Giáo trình', 'Cấp 1 — Làm quen Piano']);
    expect(resolveTarget({ type: 'lesson', id: 'l1-02-find-c', params: { stage: 'game' } })?.title).toBe('Buổi 2: Tìm nốt Đô · Trò chơi');
    expect(stageOptions('l1-02-find-c')).toEqual([null, 'review', 'game']);
    // Giáo trình dẫn dắt không có Luyện tập sau buổi.
    expect(stageOptions('sup-c')).toEqual([null, 'game']);
    expect(resolveTarget({ type: 'lesson', id: 'sup-c', params: { stage: 'review' } })).toBeNull();
    expect(resolveTarget({ type: 'lesson', id: 'sup-c' })).toMatchObject({ title: 'Nốt Đô', path: ['Làm quen từng nốt'] });
    expect(resolveTarget({ type: 'lesson', id: 'nd-c' })).toMatchObject({ title: 'Buổi 2: Nốt Đô', path: ['Khám phá nốt nhạc'] });
    expect(resolveTarget({ type: 'lesson', id: 'l9-99-gone' })).toBeNull();
  });

  it('bài thư viện + đoạn ô nhịp hợp lệ', () => {
    const song = LESSONS.find((l) => l.category === 'song' && !l.pickup && l.notes.length > 8)!;
    expect(resolveTarget({ type: 'practice', id: song.id })?.title).toBe(song.title);
    expect(resolveTarget({ type: 'practice', id: song.id, params: { measures: [1, 2] } })?.title).toBe(`${song.title} · ô 1–2`);
    expect(resolveTarget({ type: 'practice', id: song.id, params: { measures: [1, 999] } })).toBeNull();
    const rep = LESSONS.find((l) => l.repertoire)!;
    expect(resolveTarget({ type: 'practice', id: rep.id })?.path).toEqual(['Thư viện bài hát', 'Tuyển tập khuông đôi']);
    expect(resolveTarget({ type: 'practice', id: 'khong-co-bai-nay' })).toBeNull();
  });

  it('trò tự do và trò theo buổi học', () => {
    expect(resolveTarget({ type: 'arcade', id: 'note-sprint:treble-5' })?.title).toBe('Đua đọc nốt 60 giây · Khuông Sol · 5 nốt');
    expect(resolveTarget({ type: 'arcade', id: 'note-sprint:nope' })).toBeNull();
    expect(resolveTarget({ type: 'arcade', id: 'note-catch:treble-5' })).toBeNull();
    const entry = curriculumGameIndex()[0];
    const kind = entry.specs[0].kind;
    expect(resolveTarget({ type: 'lesson-game', id: `${entry.lesson.lessonId}:${kind}` })?.title).toContain(`Buổi ${entry.lesson.number}`);
    expect(resolveTarget({ type: 'lesson-game', id: `${entry.lesson.lessonId}:steady-beat` })).toBeNull();
    expect(resolveTarget({ type: 'lesson-game', id: 'l9-99:key-hunt' })).toBeNull();
  });
});

describe('sanitizeTarget / targetKey — chỉ đích nội bộ hợp lệ', () => {
  it('bỏ loại lạ, ID có ký tự lạ (URL, mã), tham số không thuộc loại đích', () => {
    expect(sanitizeTarget(null)).toBeNull();
    expect(sanitizeTarget({ type: 'url', id: 'games' })).toBeNull();
    expect(sanitizeTarget({ type: 'page', id: 'https://evil.example/x' })).toBeNull();
    expect(sanitizeTarget({ type: 'page', id: 'javascript:alert(1)' })).toBeNull();
    expect(sanitizeTarget({ type: 'page', id: '' })).toBeNull();
    expect(sanitizeTarget({ type: 'practice', id: 'song-x', params: { stage: 'game', href: '/x' } })).toEqual({ type: 'practice', id: 'song-x' });
    expect(sanitizeTarget({ type: 'lesson', id: 'l1-02-find-c', params: { stage: 'boss' } })).toEqual({ type: 'lesson', id: 'l1-02-find-c' });
    expect(sanitizeTarget({ type: 'practice', id: 'x', params: { measures: [3, 1] } })).toEqual({ type: 'practice', id: 'x' });
    expect(sanitizeTarget({ type: 'game', id: 'flappy-note', params: { preset: { difficulty: 'hard' } } })).toEqual({ type: 'game', id: 'flappy-note' });
  });

  it('khoá chuẩn hoá: cùng đích + tham số → cùng khoá, khác phần mở thẳng → khác khoá', () => {
    const a = targetKey({ type: 'game', id: 'balloon-pop', params: { preset: { mode: 'one-hand', game: 'hunt', huntLetters: ['C'] } } });
    const b = targetKey({ type: 'game', id: 'balloon-pop', params: { preset: { huntLetters: ['C'], game: 'hunt', mode: 'one-hand' } } });
    expect(a).toBe(b);
    expect(targetKey({ type: 'lesson', id: 'l1-02-find-c' })).not.toBe(targetKey({ type: 'lesson', id: 'l1-02-find-c', params: { stage: 'game' } }));
    expect(targetKey({ type: 'practice', id: 'x', params: { measures: [1, 2] } })).toBe('practice|x|measures=1-2');
  });

  it('cấu hình Bóng bay: giữ đúng khoá đã ghim, giá trị sai về mặc định hợp lệ', () => {
    expect(sanitizeBalloonPreset({ game: 'hunt', huntLetters: ['C', 'X'], evil: '<b>' })).toEqual({ game: 'hunt', huntLetters: ['C'] });
    expect(sanitizeBalloonPreset({ difficulty: 'impossible' })).toEqual({ difficulty: 'easy' });
    expect(sanitizeBalloonPreset('x')).toBeUndefined();
    const hunt = resolveTarget({ type: 'game', id: 'balloon-pop', params: { preset: { game: 'hunt', huntLetters: ['C'] } } });
    expect(hunt).toMatchObject({ title: 'Bóng bay nốt nhạc · Tìm nốt Đô', shortName: 'Bóng bay · Tìm nốt Đô' });
  });
});

describe('targetStatus — theo tiến độ giáo trình (mở khoá chỉ là gợi ý)', () => {
  it('buổi còn buổi tiên quyết chưa đạt → nên học sau; đạt rồi → ok; không còn → missing', () => {
    const lesson = CURRICULUM.levels[0].lessons.find((l) => l.prerequisites.length > 0)!;
    expect(targetStatus({ type: 'lesson', id: lesson.lessonId }, {})).toBe('suggest-later');
    const records = Object.fromEntries(lesson.prerequisites.map((id) => [id, { ...emptyRecord('p1', findLesson(CURRICULUM, id)!), passed: true }]));
    expect(targetStatus({ type: 'lesson', id: lesson.lessonId }, records)).toBe('ok');
    expect(targetStatus({ type: 'lesson', id: 'gone' }, {})).toBe('missing');
    expect(targetStatus({ type: 'game', id: 'flappy-note' }, {})).toBe('ok');
  });
});

describe('bộ chọn: cây duyệt + tìm kiếm', () => {
  it('cây có đủ nhóm; mỗi cấp vừa là đích vừa chứa các buổi của cấp', () => {
    const tree = browseTree();
    expect(tree.map((n) => n.key)).toEqual(['pages', 'curriculum', 'supplement', 'discovery', 'library', 'songs', 'games']);
    const level1 = tree[1].children![0];
    expect(level1.destination?.target).toEqual({ type: 'level', id: 'level-1' });
    expect(level1.children).toHaveLength(CURRICULUM.levels[0].lessons.length);
  });

  it('tìm không dấu, không phân biệt hoa thường', () => {
    expect(foldSearchText('  Thu  Hoạch Cà Chua ')).toBe('thu hoach ca chua');
    expect(searchDestinations('ca chua')[0].target).toEqual({ type: 'game', id: 'tomato-harvest' });
    expect(searchDestinations('FLAPPY')[0].target).toEqual({ type: 'game', id: 'flappy-note' });
    expect(searchDestinations('tim not do').some((d) => d.target.type === 'lesson' && d.target.id === 'l1-02-find-c')).toBe(true);
    expect(searchDestinations('   ')).toEqual([]);
    expect(searchDestinations('zzzz khong co')).toEqual([]);
  });
});
