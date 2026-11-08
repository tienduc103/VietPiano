import { expect, test, type Page } from '@playwright/test';

/**
 * Lối tắt thông minh (docs/smart-shortcuts.md): đề xuất tự tính trên thanh lối tắt cạnh hồ sơ + nhóm "✨ Gợi ý" trong menu ⋯,
 * không đẩy / sửa lối tắt thủ công, ghim / ẩn, cài đặt theo hồ sơ, đổi hồ sơ không lộ đề xuất.
 */

const PROFILES = {
  profiles: [
    { id: 'p-an', name: 'Bé An', age: 8, avatar: '🐱', experience: 'new', goals: ['fun'], dailyMinutes: 15, createdAt: 1 },
    { id: 'p-bo', name: 'Bố', age: 40, avatar: '🦊', experience: 'basic', goals: ['songs'], dailyMinutes: 30, createdAt: 2 },
  ],
  activeId: 'p-an',
};

type ManualSeed = { id: string; name: string; icon: string; target: { type: string; id: string; params?: Record<string, unknown> } };

async function seedStorage(page: Page, shortcuts: Record<string, ManualSeed[]> = {}) {
  await page.addInitScript(
    ({ profiles, shortcuts }) => {
      if (sessionStorage.getItem('seeded')) return;
      sessionStorage.setItem('seeded', '1');
      localStorage.setItem('vietpiano.profiles.v1', JSON.stringify(profiles));
      for (const [profileId, list] of Object.entries(shortcuts)) {
        const items = list.map((s, i) => ({ color: 'violet', showOnHome: true, ...s, profileId, order: i, createdAt: 1, updatedAt: 1 }));
        localStorage.setItem(`vietpiano.shortcuts.v1:${profileId}`, JSON.stringify({ version: 1, items }));
      }
    },
    { profiles: PROFILES, shortcuts },
  );
}

/** Bản ghi tiến độ giáo trình tối thiểu (như `emptyRecord` + các trường cần thử). */
function lessonRecord(profileKey: string, lessonId: string, patch: Record<string, unknown> = {}) {
  return {
    key: `${profileKey}|${lessonId}`,
    profileKey,
    lessonId,
    contentVersion: 1,
    attempts: 0,
    bestScore: 0,
    lastScore: null,
    passed: false,
    passedAt: null,
    activitiesDone: false,
    practiceMs: 0,
    lastPracticedAt: Date.now() - 86_400_000,
    exercises: {},
    mistakes: {},
    reviewCount: 0,
    gamePlays: 0,
    gameBestScore: 0,
    gameBestStars: 0,
    games: {},
    aiNotes: [],
    ...patch,
  };
}

const passedRecord = (profileKey: string, lessonId: string) =>
  lessonRecord(profileKey, lessonId, { passed: true, passedAt: Date.now() - 2 * 86_400_000, attempts: 1, bestScore: 90, lastScore: 90, activitiesDone: true });

/** Ghi tiến độ vào IndexedDB của app rồi tải lại trang (app đọc lại từ đầu). */
async function seedProgress(page: Page, records: Record<string, unknown>[]) {
  await page.evaluate(async (list) => {
    await new Promise<void>((resolve, reject) => {
      const req = indexedDB.open('vietpiano-curriculum', 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('lessonRecords')) db.createObjectStore('lessonRecords', { keyPath: 'key' }).createIndex('profileKey', 'profileKey');
      };
      req.onsuccess = () => {
        const tx = req.result.transaction('lessonRecords', 'readwrite');
        for (const r of list) tx.objectStore('lessonRecords').put(r);
        tx.oncomplete = () => {
          req.result.close();
          resolve();
        };
        tx.onerror = () => reject(tx.error);
      };
      req.onerror = () => reject(req.error);
    });
  }, records);
  await page.reload();
}

const bar = (page: Page) => page.getByTestId('shortcut-bar');
const suggestionChips = (page: Page) => bar(page).locator('[data-testid^="shortcut-suggestion-"]');
const manualChips = (page: Page) => bar(page).locator('[data-testid^="shortcut-chip-"]');
const menuSuggestions = (page: Page) => page.getByTestId('shortcut-menu-suggestions').locator('li');

async function openMenu(page: Page) {
  await bar(page).getByTestId('shortcut-more').click();
  await expect(page.getByTestId('shortcut-menu')).toBeVisible();
}

test('chưa có lịch sử: gợi ý hợp lệ buổi đầu tiên (✨, có lý do) → mở đúng buổi', async ({ page }) => {
  await seedStorage(page);
  await page.goto('/');
  const chip = suggestionChips(page);
  await expect(chip).toHaveCount(1);
  await expect(chip).toContainText('✨');
  await expect(chip).toContainText('Bắt đầu — Buổi 1: Khám phá bàn phím');
  await expect(chip).toHaveAttribute('title', /Buổi đầu tiên của Cấp 1/);
  await chip.click();
  await expect(page.getByTestId('lesson-player')).toBeVisible();
  await expect(page.getByTestId('lesson-title')).toContainText('Khám phá bàn phím');
});

test('đề xuất nạp xong không làm nút trên thanh đổi chỗ: không lúc nào hiện "+ Lối tắt" rồi đổi sang ⋯; tắt gợi ý → "+ Lối tắt" như cũ', async ({ page }) => {
  await page.addInitScript(() => {
    const w = window as unknown as { __addSeen?: boolean };
    w.__addSeen = false;
    new MutationObserver(() => {
      if (document.querySelector('[data-testid="shortcut-add"]')) w.__addSeen = true;
    }).observe(document, { childList: true, subtree: true });
  });
  await seedStorage(page);
  await page.goto('/');
  await expect(suggestionChips(page)).toHaveCount(1);
  await expect(bar(page).getByTestId('shortcut-more')).toBeVisible();
  expect(await page.evaluate(() => (window as unknown as { __addSeen?: boolean }).__addSeen)).toBe(false);

  await page.evaluate(() => localStorage.setItem('vietpiano.smart-shortcuts.v1:p-an', JSON.stringify({ v: 1, settings: { enabled: false } })));
  await page.reload();
  await expect(bar(page).getByTestId('shortcut-add')).toBeVisible();
  await expect(suggestionChips(page)).toHaveCount(0);
});

test('3 lối tắt thủ công: đề xuất KHÔNG đẩy chúng ra khỏi thanh, chỉ nằm trong nhóm Gợi ý của menu ⋯', async ({ page }) => {
  await seedStorage(page, {
    'p-an': [
      { id: 's1', name: 'Cà chua', icon: '🍅', target: { type: 'game', id: 'tomato-harvest' } },
      { id: 's2', name: 'Flappy', icon: '🐤', target: { type: 'game', id: 'flappy-note' } },
      { id: 's3', name: 'Trò chơi', icon: '🎮', target: { type: 'page', id: 'games' } },
    ],
  });
  await page.goto('/');
  await expect(manualChips(page)).toHaveCount(3);
  await expect(manualChips(page)).toHaveText([/Cà chua/, /Flappy/, /Trò chơi/]);
  await expect(suggestionChips(page)).toHaveCount(0);
  await openMenu(page);
  await expect(menuSuggestions(page).first()).toContainText('Bắt đầu — Buổi 1: Khám phá bàn phím');
});

test('buổi đang dở → "Tiếp tục" đứng đầu; ghim → thành lối tắt thủ công (tên mặc định), không hiện trùng; xoá lối tắt → đề xuất quay lại, tiến độ còn nguyên', async ({ page }) => {
  await seedStorage(page);
  await page.goto('/');
  await seedProgress(page, [
    passedRecord('p-an', 'l1-01-keyboard'),
    lessonRecord('p-an', 'l1-02-find-c', { exercises: { warmup: { attempts: 1, bestScore: 100, lastScore: 100, passed: true } } }),
  ]);
  const chip = suggestionChips(page);
  await expect(chip).toContainText('Tiếp tục — Buổi 2: Tìm nốt Đô');
  await expect(chip).toHaveAttribute('title', /Đã đạt 1\/2 bài tập · học lần cuối hôm qua/);

  await openMenu(page);
  const first = menuSuggestions(page).first();
  await expect(first).toContainText('Tiếp tục — Buổi 2: Tìm nốt Đô');
  await first.getByRole('button', { name: /^Ghim lối tắt:/ }).click();
  const editor = page.getByTestId('shortcut-editor');
  await expect(editor.getByTestId('shortcut-name')).toHaveValue('Buổi 2: Tìm nốt Đô');
  await editor.getByTestId('shortcut-save').click();
  await expect(editor).toHaveCount(0);

  await expect(manualChips(page)).toHaveText([/Buổi 2: Tìm nốt Đô/]);
  await expect(bar(page).getByText('Tiếp tục — Buổi 2: Tìm nốt Đô')).toHaveCount(0);
  await openMenu(page);
  await expect(page.getByTestId('shortcut-menu-suggestions')).not.toContainText('Buổi 2: Tìm nốt Đô');
  await page.keyboard.press('Escape');

  // Xoá lối tắt thủ công ở Cài đặt → đề xuất quay lại, buổi học / tiến độ không bị xoá.
  await page.getByRole('button', { name: 'Cài đặt', exact: true }).click();
  await page.getByTestId('shortcut-manager').getByTestId('shortcut-delete').click();
  await page.getByRole('button', { name: 'Quay lại', exact: true }).click();
  await expect(suggestionChips(page)).toContainText('Tiếp tục — Buổi 2: Tìm nốt Đô');
  await expect(page.getByTestId('next-lesson')).toContainText('Buổi 2: Tìm nốt Đô');
});

test('ẩn một gợi ý: biến mất, gợi ý khác không đổi chỗ; Cài đặt → "Hiện lại"', async ({ page }) => {
  await seedStorage(page);
  await page.goto('/');
  await seedProgress(page, [
    // Buổi 1 đạt từ 12 ngày trước → có gợi ý ôn tập; buổi 2 đang dở → "Tiếp tục"; + trò chơi của buổi 2.
    { ...passedRecord('p-an', 'l1-01-keyboard'), lastPracticedAt: Date.now() - 12 * 86_400_000 },
    lessonRecord('p-an', 'l1-02-find-c', { attempts: 1 }),
  ]);
  await openMenu(page);
  const before = await menuSuggestions(page).allInnerTexts();
  expect(before.length).toBeGreaterThanOrEqual(3);
  await menuSuggestions(page).nth(1).getByRole('button', { name: /^Ẩn gợi ý:/ }).click();
  const after = await menuSuggestions(page).allInnerTexts();
  expect(after).not.toContain(before[1]);
  expect(after[0]).toBe(before[0]);
  expect(after.slice(1, before.length - 1)).toEqual(before.slice(2));
  await page.keyboard.press('Escape');

  await page.getByRole('button', { name: 'Cài đặt', exact: true }).click();
  const settings = page.getByTestId('smart-shortcut-settings');
  await expect(settings).toContainText('Đang ẩn 1 gợi ý');
  await settings.getByTestId('smart-restore-dismissed').click();
  await expect(settings).not.toContainText('Đang ẩn');
});

test('tắt Lối tắt thông minh → thanh chỉ còn lối tắt thủ công; tắt "hiện trên thanh" → gợi ý chỉ trong menu; lưu theo hồ sơ', async ({ page }) => {
  await seedStorage(page, { 'p-an': [{ id: 's1', name: 'Cà chua', icon: '🍅', target: { type: 'game', id: 'tomato-harvest' } }] });
  await page.goto('/');
  await expect(suggestionChips(page)).toHaveCount(1);

  await page.getByRole('button', { name: 'Cài đặt', exact: true }).click();
  const settings = page.getByTestId('smart-shortcut-settings');
  await settings.getByRole('switch', { name: 'Hiện gợi ý trên thanh hồ sơ (khi còn chỗ)' }).click();
  await page.getByRole('button', { name: 'Quay lại', exact: true }).click();
  await expect(suggestionChips(page)).toHaveCount(0);
  await expect(manualChips(page)).toHaveText([/Cà chua/]);
  await openMenu(page);
  await expect(menuSuggestions(page).first()).toBeVisible();
  await page.keyboard.press('Escape');

  await page.getByRole('button', { name: 'Cài đặt', exact: true }).click();
  await settings.getByRole('switch', { name: 'Bật lối tắt thông minh' }).click();
  await page.getByRole('button', { name: 'Quay lại', exact: true }).click();
  await expect(manualChips(page)).toHaveText([/Cà chua/]);
  await openMenu(page);
  await expect(page.getByTestId('shortcut-menu-suggestions')).toHaveCount(0);
  await page.keyboard.press('Escape');

  // Tải lại vẫn tắt; hồ sơ khác vẫn bật (cài đặt theo hồ sơ).
  await page.reload();
  await expect(manualChips(page)).toHaveText([/Cà chua/]);
  await expect(suggestionChips(page)).toHaveCount(0);
  await page.getByTestId('profile-Bố').click();
  await expect(suggestionChips(page)).toHaveCount(1);
});

test('đổi hồ sơ: đề xuất cập nhật ngay, không lộ đề xuất của hồ sơ kia', async ({ page }) => {
  await seedStorage(page);
  await page.goto('/');
  await seedProgress(page, [passedRecord('p-an', 'l1-01-keyboard'), lessonRecord('p-an', 'l1-02-find-c', { attempts: 1 })]);
  await expect(suggestionChips(page)).toContainText('Tiếp tục — Buổi 2: Tìm nốt Đô');
  await page.getByTestId('profile-Bố').click();
  await expect(suggestionChips(page)).toContainText('Bắt đầu — Buổi 1: Khám phá bàn phím');
  await expect(bar(page).getByText('Tìm nốt Đô')).toHaveCount(0);
  await openMenu(page);
  await expect(page.getByTestId('shortcut-menu')).not.toContainText('Tìm nốt Đô');
  await page.keyboard.press('Escape');
  await page.getByTestId('profile-Bé An').click();
  await expect(suggestionChips(page)).toContainText('Tiếp tục — Buổi 2: Tìm nốt Đô');
});

test.describe('màn hẹp', () => {
  test.use({ viewport: { width: 390, height: 844 } });
  test('thanh có gợi ý không tràn ngang', async ({ page }) => {
    await seedStorage(page);
    await page.goto('/');
    await expect(bar(page)).toBeVisible();
    await expect(bar(page).getByTestId('shortcut-more')).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });
});
