import { describe, expect, it } from 'vitest';
import {
  cleanIcon,
  cleanName,
  createShortcut,
  DEFAULT_SHORTCUT_ICON,
  filterShortcuts,
  findByTarget,
  homeShortcuts,
  loadShortcuts,
  moveShortcut,
  removeShortcut,
  restoreShortcut,
  sanitizeShortcuts,
  saveShortcuts,
  shortcutsStorageKey,
  updateShortcut,
  type KeyValueStorage,
} from './ShortcutService';
import { foldSearchText } from './registry';
import { MAX_SHORTCUTS, type Shortcut, type ShortcutInput } from './types';

const T0 = 1_700_000_000_000;
let seq = 0;
const rnd = () => ((seq = (seq + 1) % 997), seq / 1000);

const input = (id: string, extra: Partial<ShortcutInput> = {}): ShortcutInput => ({
  name: `Lối tắt ${id}`,
  icon: '🎮',
  color: 'amber',
  target: { type: 'page', id },
  ...extra,
});

function build(profileId: string, ids: string[]): Shortcut[] {
  let list: Shortcut[] = [];
  for (const id of ids) {
    const r = createShortcut(list, profileId, input(id), T0, rnd);
    if (!r.ok) throw new Error(r.reason);
    list = r.list;
  }
  return list;
}

class MemoryStorage implements KeyValueStorage {
  data = new Map<string, string>();
  getItem(k: string) {
    return this.data.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    this.data.set(k, v);
  }
}

describe('ShortcutService — tạo / sửa', () => {
  it('tạo: làm sạch tên / biểu tượng / màu, thứ tự liên tục, mặc định hiện trên trang chủ', () => {
    const r = createShortcut([], 'p1', { name: '   🍅   Thu   hoạch  ', icon: ' 🍅 ', color: 'neon' as never, target: { type: 'game', id: 'tomato-harvest' } }, T0, rnd);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.shortcut).toMatchObject({ profileId: 'p1', name: '🍅 Thu hoạch', icon: '🍅', color: 'violet', order: 0, showOnHome: true, createdAt: T0, updatedAt: T0 });
    expect(r.shortcut.id).toMatch(/^sc/);
  });

  it('trùng đích (cùng nội dung + cùng tham số) → trả lối tắt cũ để mở / sửa', () => {
    const list = build('p1', ['games', 'library']);
    const dup = createShortcut(list, 'p1', input('games', { name: 'Khác tên' }), T0, rnd);
    expect(dup).toEqual({ ok: false, reason: 'duplicate', existing: list[0] });
    // Cùng buổi nhưng khác phần mở thẳng → không trùng.
    const a = createShortcut([], 'p1', input('x', { target: { type: 'lesson', id: 'l1-02-find-c' } }), T0, rnd);
    if (!a.ok) throw new Error();
    expect(createShortcut(a.list, 'p1', input('y', { target: { type: 'lesson', id: 'l1-02-find-c', params: { stage: 'game' } } }), T0, rnd).ok).toBe(true);
  });

  it('đích sai dạng → invalid; quá giới hạn an toàn → limit', () => {
    expect(createShortcut([], 'p1', input('x', { target: { type: 'url' as never, id: 'https://x' } }), T0, rnd)).toEqual({ ok: false, reason: 'invalid' });
    const many = Array.from({ length: MAX_SHORTCUTS }, (_, i) => ({ ...build('p1', ['games'])[0], id: `s${i}`, target: { type: 'practice' as const, id: `bai-${i}` }, order: i }));
    expect(createShortcut(many, 'p1', input('library'), T0, rnd)).toEqual({ ok: false, reason: 'limit' });
  });

  it('sửa tên, biểu tượng, hiện trên trang chủ; đổi sang đích đã có lối tắt khác → trùng', () => {
    const list = build('p1', ['games', 'library']);
    const r = updateShortcut(list, list[0].id, { name: 'Chơi', icon: '🐤', showOnHome: false }, T0 + 5);
    expect(r.ok && r.shortcut).toMatchObject({ name: 'Chơi', icon: '🐤', showOnHome: false, updatedAt: T0 + 5, createdAt: T0 });
    expect(updateShortcut(list, list[0].id, { name: '   ' }, T0).ok && (updateShortcut(list, list[0].id, { name: '   ' }, T0) as { shortcut: Shortcut }).shortcut.name).toBe(
      list[0].name,
    );
    expect(updateShortcut(list, list[0].id, { target: { type: 'page', id: 'library' } }, T0)).toMatchObject({ ok: false, reason: 'duplicate', existing: list[1] });
    expect(updateShortcut(list, 'nope', { name: 'x' }, T0)).toEqual({ ok: false, reason: 'not-found' });
    // Đổi đích sang chính đích hiện tại không phải trùng.
    expect(updateShortcut(list, list[0].id, { target: { type: 'page', id: 'games' } }, T0).ok).toBe(true);
  });
});

describe('ShortcutService — xoá + hoàn tác, sắp xếp, lọc', () => {
  it('xoá rồi hoàn tác về đúng vị trí cũ', () => {
    const list = build('p1', ['games', 'library', 'settings']);
    const { list: after, removed } = removeShortcut(list, list[1].id);
    expect(after.map((s) => s.target.id)).toEqual(['games', 'settings']);
    expect(after.map((s) => s.order)).toEqual([0, 1]);
    const back = restoreShortcut(after, removed!);
    expect(back.map((s) => s.target.id)).toEqual(['games', 'library', 'settings']);
    expect(back.map((s) => s.order)).toEqual([0, 1, 2]);
    expect(removeShortcut(list, 'nope').removed).toBeNull();
  });

  it('không hoàn tác chồng lên lối tắt mới cùng đích', () => {
    const list = build('p1', ['games', 'library']);
    const { list: after, removed } = removeShortcut(list, list[0].id);
    const again = createShortcut(after, 'p1', input('games'), T0, rnd);
    if (!again.ok) throw new Error();
    expect(restoreShortcut(again.list, removed!)).toHaveLength(2);
  });

  it('kéo thả / lên xuống: đổi chỗ + đánh lại thứ tự, chặn vượt biên', () => {
    const list = build('p1', ['games', 'library', 'settings', 'coach']);
    expect(moveShortcut(list, list[0].id, 2).map((s) => s.target.id)).toEqual(['library', 'settings', 'games', 'coach']);
    expect(moveShortcut(list, list[3].id, 0).map((s) => s.target.id)).toEqual(['coach', 'games', 'library', 'settings']);
    expect(moveShortcut(list, list[1].id, 99).map((s) => s.target.id)).toEqual(['games', 'settings', 'coach', 'library']);
    expect(moveShortcut(list, list[1].id, -5).map((s) => s.order)).toEqual([0, 1, 2, 3]);
    expect(moveShortcut(list, 'nope', 0)).toEqual(list);
  });

  it('chỉ lối tắt bật "hiện trên trang chủ" lên thanh; tìm theo tên hoặc tên đích, không dấu', () => {
    let list = build('p1', ['games', 'library', 'settings']);
    const r = updateShortcut(list, list[1].id, { showOnHome: false }, T0);
    if (!r.ok) throw new Error();
    list = r.list;
    expect(homeShortcuts(list).map((s) => s.target.id)).toEqual(['games', 'settings']);
    const describe = (s: Shortcut) => (s.target.id === 'settings' ? 'Cài đặt' : '');
    expect(filterShortcuts(list, 'cai dat', describe, foldSearchText).map((s) => s.target.id)).toEqual(['settings']);
    expect(filterShortcuts(list, 'LỐI TẮT LIB', describe, foldSearchText).map((s) => s.target.id)).toEqual(['library']);
    expect(filterShortcuts(list, '', describe, foldSearchText)).toHaveLength(3);
    expect(findByTarget(list, { type: 'page', id: 'library' })?.id).toBe(list[1].id);
  });
});

describe('ShortcutService — làm sạch + lưu theo hồ sơ', () => {
  it('bỏ mục sai dạng, mục của hồ sơ khác, id / đích trùng; GIỮ mục có đích không còn tồn tại', () => {
    const good = build('p1', ['games', 'library']);
    const raw = {
      version: 1,
      items: [
        good[1],
        { ...good[0], order: -1 },
        { ...good[0], id: 'other-profile', profileId: 'p2', target: { type: 'page', id: 'coach' } },
        { ...good[0], id: 'dup-target' },
        { ...good[0], id: 'bad-target', target: { type: 'page', id: 'https://x' } },
        { ...good[0], id: 'gone', target: { type: 'lesson', id: 'l9-99-removed' }, order: 5 },
        { id: 'broken' },
        'rác',
        null,
        { ...good[0], id: 'evil-icon', icon: '<img src=x onerror=alert(1)>', name: 123, target: { type: 'page', id: 'settings' }, order: 9 },
      ],
    };
    const list = sanitizeShortcuts(raw, 'p1');
    expect(list.map((s) => s.id)).toEqual([good[0].id, good[1].id, 'gone', 'evil-icon']);
    expect(list.map((s) => s.order)).toEqual([0, 1, 2, 3]);
    expect(list[3]).toMatchObject({ icon: DEFAULT_SHORTCUT_ICON, name: 'Lối tắt' });
    expect(sanitizeShortcuts('{}', 'p1')).toEqual([]);
    expect(sanitizeShortcuts(undefined, 'p1')).toEqual([]);
  });

  it('mỗi hồ sơ một khoá riêng — không trộn dữ liệu; hỏng JSON → rỗng; bộ nhớ bị chặn → báo lỗi', () => {
    const storage = new MemoryStorage();
    const a = build('p1', ['games']);
    const b = build('p2', ['library', 'settings']);
    expect(saveShortcuts(storage, 'p1', a)).toBe(true);
    expect(saveShortcuts(storage, 'p2', b)).toBe(true);
    expect(loadShortcuts(storage, 'p1')).toEqual(a);
    expect(loadShortcuts(storage, 'p2')).toEqual(b);
    expect(loadShortcuts(storage, 'guest')).toEqual([]);
    // Dữ liệu hồ sơ p2 bị chép nhầm vào khoá p1 → không hiện ở p1.
    storage.setItem(shortcutsStorageKey('p1'), JSON.stringify({ version: 1, items: b }));
    expect(loadShortcuts(storage, 'p1')).toEqual([]);
    storage.setItem(shortcutsStorageKey('p1'), '{hỏng');
    expect(loadShortcuts(storage, 'p1')).toEqual([]);
    const blocked: KeyValueStorage = {
      getItem: () => {
        throw new Error('SecurityError');
      },
      setItem: () => {
        throw new Error('QuotaExceededError');
      },
    };
    expect(loadShortcuts(blocked, 'p1')).toEqual([]);
    expect(saveShortcuts(blocked, 'p1', a)).toBe(false);
    expect(saveShortcuts(null, 'p1', a)).toBe(false);
  });

  it('tên / biểu tượng: cắt theo ký tự (không cắt đôi emoji), biểu tượng lạ về mặc định', () => {
    expect(cleanName('🎹'.repeat(50))).toBe('🎹'.repeat(40));
    expect(cleanName(42)).toBe('');
    expect(cleanIcon('🏎️')).toBe('🏎️');
    expect(cleanIcon('👨‍👩‍👧')).toBe('👨‍👩‍👧');
    expect(cleanIcon('javascript:alert(1)')).toBe(DEFAULT_SHORTCUT_ICON);
    expect(cleanIcon('<b>')).toBe(DEFAULT_SHORTCUT_ICON);
    expect(cleanIcon('')).toBe(DEFAULT_SHORTCUT_ICON);
  });
});
