import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SMART_SETTINGS,
  dismiss,
  dismissedCount,
  emptySmartState,
  isDismissed,
  loadSmartState,
  sanitizeDismissals,
  sanitizeSmartSettings,
  saveSmartState,
  smartStorageKey,
  type SmartKeyValueStorage,
} from './settings';
import { DAY, NOW } from './testing';

function memoryStorage(): SmartKeyValueStorage & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v) };
}

describe('cài đặt Lối tắt thông minh', () => {
  it('mặc định: bật, hiện trên thanh, đủ loại gợi ý, AI cục bộ tắt', () => {
    expect(DEFAULT_SMART_SETTINGS).toEqual({
      enabled: true,
      showOnBar: true,
      types: { continue: true, weakness: true, review: true, practice: true, game: true, frequent: true },
      aiAssist: false,
    });
  });

  it('dữ liệu hỏng / thiếu → giữ phần đọc được, phần còn lại mặc định', () => {
    expect(sanitizeSmartSettings({ enabled: false, types: { game: false, weakness: 'no', lạ: false } })).toEqual({
      ...DEFAULT_SMART_SETTINGS,
      enabled: false,
      types: { ...DEFAULT_SMART_SETTINGS.types, game: false },
    });
    expect(sanitizeSmartSettings('rác')).toEqual(DEFAULT_SMART_SETTINGS);
  });

  it('lưu riêng từng hồ sơ — đổi hồ sơ không thấy cài đặt / đề xuất ẩn của hồ sơ khác', () => {
    const storage = memoryStorage();
    const a = emptySmartState();
    a.settings.types.game = false;
    a.dismissed = dismiss({}, 'lesson|l1-01-keyboard', NOW);
    expect(saveSmartState(storage, 'p1', a)).toBe(true);
    expect(loadSmartState(storage, 'p1', NOW)).toEqual(a);
    expect(loadSmartState(storage, 'p2', NOW)).toEqual(emptySmartState());
    expect([...storage.data.keys()]).toEqual([smartStorageKey('p1')]);
    // Không dùng chung khoá với lối tắt thủ công.
    expect(smartStorageKey('p1')).not.toMatch(/^vietpiano\.shortcuts\./);
  });

  it('bộ nhớ bị chặn / JSON hỏng → mặc định, không lỗi', () => {
    const broken: SmartKeyValueStorage = {
      getItem: () => {
        throw new Error('SecurityError');
      },
      setItem: () => {
        throw new Error('QuotaExceeded');
      },
    };
    expect(loadSmartState(broken, 'p1', NOW)).toEqual(emptySmartState());
    expect(saveSmartState(broken, 'p1', emptySmartState())).toBe(false);
    const s = memoryStorage();
    s.setItem(smartStorageKey('p1'), '{hỏng');
    expect(loadSmartState(s, 'p1', NOW)).toEqual(emptySmartState());
    expect(loadSmartState(null, 'p1', NOW)).toEqual(emptySmartState());
  });
});

describe('ẩn đề xuất', () => {
  it('ẩn 7 ngày; hết hạn thì tự bỏ khi đọc lại', () => {
    const d = dismiss({}, 'game|tomato-harvest', NOW);
    expect(isDismissed(d, 'game|tomato-harvest', NOW + 6 * DAY)).toBe(true);
    expect(isDismissed(d, 'game|tomato-harvest', NOW + 7 * DAY)).toBe(false);
    expect(dismissedCount(d, NOW)).toBe(1);
    expect(sanitizeDismissals(d, NOW + 8 * DAY)).toEqual({});
  });

  it('bỏ mục hỏng, giới hạn số mục', () => {
    expect(sanitizeDismissals({ ok: NOW + DAY, bad: 'x', old: NOW - 1, '': NOW + DAY }, NOW)).toEqual({ ok: NOW + DAY });
    const many = Object.fromEntries(Array.from({ length: 250 }, (_, i) => [`k${i}`, NOW + (i + 1) * 1000]));
    expect(Object.keys(sanitizeDismissals(many, NOW))).toHaveLength(200);
  });
});
