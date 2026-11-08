import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { targetKey } from '../core/shortcuts/registry';
import { smartStorageKey } from '../core/shortcuts/smart/settings';
import { DAY, NOW, passed, PROFILE, record, records, smartInput } from '../core/shortcuts/smart/testing';
import { shortcutsStorageKey } from '../core/shortcuts/ShortcutService';
import { useProfiles } from './profileStore';
import { useShortcuts } from './shortcutStore';
import { useSmartShortcuts } from './smartShortcutStore';

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

/** Hồ sơ đang học dở buổi 2, buổi 1 lâu chưa ôn → có đủ "Tiếp tục", "Ôn lại", trò chơi. */
const busy = (profileId: string) =>
  smartInput({ profileId, records: records(passed('l1-01-keyboard', { bestScore: 85, lastPracticedAt: NOW - 12 * DAY }), record('l1-02-find-c', { attempts: 1 })) });

const keys = () => useSmartShortcuts.getState().list.map((c) => c.candidateKey);
/** Dữ liệu tạo hồ sơ (bỏ id / ngày tạo cố định của hồ sơ mẫu — mỗi hồ sơ mới phải có id riêng). */
const { id: _id, createdAt: _createdAt, ...profileInput } = PROFILE;

describe('store Lối tắt thông minh', () => {
  let storage: MemoryStorage;
  beforeEach(() => {
    // Đồng hồ = NOW của dữ liệu mẫu: store tự tính lại bằng Date.now() (ẩn / hiện lại / đổi cài đặt) mà chữ ký dữ liệu có
    // chỉ số ngày → giờ thật khác ngày với NOW làm cache lệch (test "mở lại app" từng chỉ qua đúng ngày 07/11/2026).
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
    storage = new MemoryStorage();
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: storage });
    useProfiles.setState({ profiles: [], activeId: null });
    useShortcuts.getState().load('guest');
    useSmartShortcuts.setState({ profileKey: 'none', signature: null });
    useSmartShortcuts.getState().selectProfile('p1');
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('chuyển hồ sơ → danh sách của hồ sơ cũ bị xoá ngay, không lộ sang hồ sơ mới', () => {
    useSmartShortcuts.getState().refresh(busy('p1'), new Set());
    expect(useSmartShortcuts.getState().list.length).toBeGreaterThan(0);
    useSmartShortcuts.getState().selectProfile('p2');
    expect(useSmartShortcuts.getState().list).toEqual([]);
    // Dữ liệu của hồ sơ cũ tới muộn (vd tính dở) không được ghi vào hồ sơ mới.
    useSmartShortcuts.getState().refresh(busy('p1'), new Set());
    expect(useSmartShortcuts.getState().list).toEqual([]);
    useSmartShortcuts.getState().refresh(smartInput({ profileId: 'p2' }), new Set());
    expect(useSmartShortcuts.getState().list.every((c) => c.profileId === 'p2')).toBe(true);
  });

  it('chuyển hồ sơ qua profileStore cũng xoá danh sách (kể cả khi trang chủ không mở)', () => {
    const a = useProfiles.getState().add({ ...profileInput, name: 'Bé A' });
    useSmartShortcuts.getState().refresh(busy(a.id), new Set());
    expect(useSmartShortcuts.getState().list.length).toBeGreaterThan(0);
    useProfiles.getState().add({ ...profileInput, name: 'Mẹ', age: 35 });
    expect(useSmartShortcuts.getState().list).toEqual([]);
  });

  it('ẩn một đề xuất → biến mất, các đề xuất còn lại giữ chỗ, đề xuất thay thế xếp sau; lưu theo hồ sơ', () => {
    useSmartShortcuts.getState().refresh(busy('p1'), new Set());
    const before = keys();
    expect(before.length).toBeGreaterThanOrEqual(3);
    useSmartShortcuts.getState().dismiss(before[0]);
    const after = keys();
    expect(after).not.toContain(before[0]);
    expect(after.slice(0, before.length - 1)).toEqual(before.slice(1));
    const saved = JSON.parse(storage.getItem(smartStorageKey('p1'))!);
    expect(Object.keys(saved.dismissed)).toEqual([before[0].split('|').slice(1).join('|')]);
    // Hồ sơ khác không bị ẩn theo.
    useSmartShortcuts.getState().selectProfile('p2');
    expect(useSmartShortcuts.getState().state.dismissed).toEqual({});
  });

  it('ghim (lối tắt thủ công mới cùng đích) → đề xuất đó rời đi, phần còn lại không nhảy chỗ', () => {
    useSmartShortcuts.getState().refresh(busy('p1'), new Set());
    const before = useSmartShortcuts.getState().list;
    const pinned = before[1];
    useSmartShortcuts.getState().refresh(busy('p1'), new Set([targetKey(pinned.target)]), { keepOrder: true });
    const after = keys();
    expect(after).not.toContain(pinned.candidateKey);
    expect(after.slice(0, before.length - 1)).toEqual(before.filter((c) => c !== pinned).map((c) => c.candidateKey));
  });

  it('tắt Lối tắt thông minh → rỗng; lối tắt thủ công không bị đụng tới', () => {
    useShortcuts.getState().create({ name: 'Cà chua', icon: '🍅', color: 'amber', target: { type: 'game', id: 'tomato-harvest' } });
    const manualBefore = storage.getItem(shortcutsStorageKey('guest'));
    useSmartShortcuts.getState().refresh(busy('p1'), new Set());
    useSmartShortcuts.getState().updateSettings({ enabled: false });
    expect(useSmartShortcuts.getState().list).toEqual([]);
    expect(storage.getItem(shortcutsStorageKey('guest'))).toBe(manualBefore);
    expect(useShortcuts.getState().items.map((s) => s.name)).toEqual(['Cà chua']);
    useSmartShortcuts.getState().updateSettings({ enabled: true, types: { review: false } });
    expect(useSmartShortcuts.getState().list.some((c) => c.type === 'review')).toBe(false);
    expect(useSmartShortcuts.getState().list.some((c) => c.type === 'continue')).toBe(true);
    // Cài đặt lưu bền vững theo hồ sơ.
    expect(JSON.parse(storage.getItem(smartStorageKey('p1'))!).settings.types.review).toBe(false);
  });

  it('mở lại app (cùng dữ liệu, cache còn hạn) → giữ đúng thứ tự đã hiện lần trước', () => {
    useSmartShortcuts.getState().refresh(busy('p1'), new Set());
    useSmartShortcuts.getState().dismiss(keys()[0]);
    useSmartShortcuts.getState().restoreDismissed();
    const shown = keys();
    // Giả lập tải lại: store trống, đọc lại từ localStorage.
    useSmartShortcuts.setState({ profileKey: 'none', signature: null, list: [] });
    useSmartShortcuts.getState().selectProfile('p1');
    useSmartShortcuts.getState().refresh({ ...busy('p1'), now: NOW + 60_000 }, new Set());
    expect(keys()).toEqual(shown);
  });

  it('trò đã mở từ gợi ý trong phiên → lần tính sau gợi ý trò khác cùng kỹ năng; "Tiếp tục" vẫn giữ', () => {
    useSmartShortcuts.getState().refresh(busy('p1'), new Set());
    const list = useSmartShortcuts.getState().list;
    const game = list.find((c) => c.type === 'game')!;
    const cont = list.find((c) => c.type === 'continue')!;
    expect(game.target).toEqual({ type: 'game', id: 'balloon-pop' });
    useSmartShortcuts.getState().markOpened(game.candidateKey);
    useSmartShortcuts.getState().markOpened(cont.candidateKey);
    useSmartShortcuts.getState().refresh(busy('p1'), new Set());
    const after = useSmartShortcuts.getState().list;
    expect(after.some((c) => c.candidateKey === game.candidateKey)).toBe(false);
    expect(after.find((c) => c.type === 'game')?.target).toEqual({ type: 'game', id: 'tomato-harvest' });
    expect(after.find((c) => c.candidateKey === cont.candidateKey)?.score).toBe(cont.score);
  });
});
