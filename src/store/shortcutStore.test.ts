import { beforeEach, describe, expect, it } from 'vitest';
import { shortcutsStorageKey } from '../core/shortcuts/ShortcutService';
import type { ShortcutInput } from '../core/shortcuts/types';
import { useApp } from './appStore';
import { useProfiles } from './profileStore';
import { useShortcuts } from './shortcutStore';

class MemoryStorage implements Storage {
  values = new Map<string, string>();
  get length() {
    return this.values.size;
  }
  clear() {
    this.values.clear();
  }
  getItem(key: string) {
    return this.values.get(key) ?? null;
  }
  key(index: number) {
    return [...this.values.keys()][index] ?? null;
  }
  removeItem(key: string) {
    this.values.delete(key);
  }
  setItem(key: string, value: string) {
    this.values.set(key, value);
  }
}

const tomato: ShortcutInput = { name: '🍅 Thu hoạch', icon: '🍅', color: 'amber', target: { type: 'game', id: 'tomato-harvest' } };
const flappy: ShortcutInput = { name: 'Flappy', icon: '🐤', color: 'sky', target: { type: 'game', id: 'flappy-note' } };

describe('kho lối tắt theo hồ sơ', () => {
  let storage: MemoryStorage;
  beforeEach(() => {
    storage = new MemoryStorage();
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: storage });
    useProfiles.setState({ profiles: [], activeId: null });
    useShortcuts.getState().load('guest');
    useApp.setState({ route: { name: 'dashboard' }, previous: null });
  });

  it('mỗi hồ sơ một danh sách; đổi hồ sơ cập nhật ngay, không trộn dữ liệu', () => {
    const a = useProfiles.getState().add({ name: 'Bé A', age: 8, avatar: '🐱', experience: 'new', goals: [], dailyMinutes: 15 });
    expect(useShortcuts.getState().profileKey).toBe(a.id);
    expect(useShortcuts.getState().create(tomato).ok).toBe(true);

    const b = useProfiles.getState().add({ name: 'Mẹ', age: 35, avatar: '🦊', experience: 'basic', goals: [], dailyMinutes: 30 });
    expect(useShortcuts.getState().profileKey).toBe(b.id);
    expect(useShortcuts.getState().items).toEqual([]);
    useShortcuts.getState().create(flappy);

    useProfiles.getState().select(a.id);
    expect(useShortcuts.getState().items.map((s) => s.name)).toEqual(['🍅 Thu hoạch']);
    expect(useShortcuts.getState().items[0].profileId).toBe(a.id);
    useProfiles.getState().select(b.id);
    expect(useShortcuts.getState().items.map((s) => s.name)).toEqual(['Flappy']);

    // Lưu bền vững theo khoá của từng hồ sơ (tải lại app đọc lại đúng).
    expect(JSON.parse(storage.getItem(shortcutsStorageKey(a.id))!).items).toHaveLength(1);
    expect(JSON.parse(storage.getItem(shortcutsStorageKey(b.id))!).items[0].profileId).toBe(b.id);
  });

  it('trùng đích bị chặn; xoá có hoàn tác; hoàn tác không áp sang hồ sơ khác', () => {
    const s = useShortcuts.getState();
    s.create(tomato);
    s.create(flappy);
    const dup = useShortcuts.getState().create({ ...tomato, name: 'Cà chua 2' });
    expect(dup.ok).toBe(false);
    expect(!dup.ok && dup.reason).toBe('duplicate');

    const first = useShortcuts.getState().items[0];
    useShortcuts.getState().remove(first.id);
    expect(useShortcuts.getState().items.map((x) => x.name)).toEqual(['Flappy']);
    expect(useShortcuts.getState().undo?.shortcut.id).toBe(first.id);
    useShortcuts.getState().undoRemove();
    expect(useShortcuts.getState().items.map((x) => x.name)).toEqual(['🍅 Thu hoạch', 'Flappy']);
    expect(useShortcuts.getState().undo).toBeNull();

    useShortcuts.getState().remove(first.id);
    useShortcuts.getState().load('someone-else');
    expect(useShortcuts.getState().undo).toBeNull();
  });

  it('sắp xếp, bật / tắt hiện trên trang chủ, kiểm tra đã ghim', () => {
    const s = useShortcuts.getState();
    s.create(tomato);
    s.create(flappy);
    const [t, f] = useShortcuts.getState().items;
    useShortcuts.getState().move(f.id, 0);
    expect(useShortcuts.getState().items.map((x) => x.id)).toEqual([f.id, t.id]);
    useShortcuts.getState().setShowOnHome(t.id, false);
    expect(useShortcuts.getState().items.find((x) => x.id === t.id)?.showOnHome).toBe(false);
    expect(useShortcuts.getState().pinnedFor({ type: 'game', id: 'flappy-note' })?.id).toBe(f.id);
    expect(useShortcuts.getState().pinnedFor({ type: 'game', id: 'f1-racing' })).toBeUndefined();
  });

  it('mở lối tắt: điều hướng; đích không còn → thông báo, không đổi màn', () => {
    useShortcuts.getState().create(tomato);
    expect(useShortcuts.getState().open(useShortcuts.getState().items[0])).toBe(true);
    expect(useApp.getState().route).toEqual({ name: 'tomato-harvest' });

    storage.setItem(
      shortcutsStorageKey('guest'),
      JSON.stringify({
        version: 1,
        items: [{ id: 'old', profileId: 'guest', name: 'Bài cũ', icon: '🎹', color: 'pink', target: { type: 'lesson', id: 'l9-99-removed' }, order: 0, showOnHome: true }],
      }),
    );
    useShortcuts.getState().load('guest');
    const old = useShortcuts.getState().items[0];
    expect(old.name).toBe('Bài cũ');
    expect(useShortcuts.getState().open(old)).toBe(false);
    expect(useShortcuts.getState().broken?.id).toBe('old');
    expect(useApp.getState().route).toEqual({ name: 'tomato-harvest' });
    useShortcuts.getState().remove('old');
    expect(useShortcuts.getState().broken).toBeNull();
  });

  it('bộ nhớ bị chặn → vẫn dùng được trong phiên, báo lỗi lưu', () => {
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: {
        getItem: () => null,
        setItem: () => {
          throw new Error('QuotaExceededError');
        },
      },
    });
    expect(useShortcuts.getState().create(tomato).ok).toBe(true);
    expect(useShortcuts.getState().items).toHaveLength(1);
    expect(useShortcuts.getState().saveError).toMatch(/Không lưu được/);
  });
});
