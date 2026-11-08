import { expect, test, type Page } from '@playwright/test';

/** Lối tắt cá nhân (Quick Access): thanh cạnh hồ sơ ở trang chủ, Cài đặt → Lối tắt, ghim tại chỗ. */

type Seed = { id: string; name: string; icon: string; color?: string; target: { type: string; id: string; params?: Record<string, unknown> }; showOnHome?: boolean };

const PROFILES = {
  profiles: [
    { id: 'p-be', name: 'Bé Na', age: 8, avatar: '🐱', experience: 'new', goals: ['fun'], dailyMinutes: 15, createdAt: 1 },
    { id: 'p-me', name: 'Mẹ', age: 35, avatar: '🦊', experience: 'basic', goals: ['songs'], dailyMinutes: 30, createdAt: 2 },
  ],
  activeId: 'p-be',
};

async function seed(page: Page, shortcuts: Record<string, Seed[]> = {}, profiles: unknown = PROFILES) {
  await page.addInitScript(
    ({ profiles, shortcuts }) => {
      // Chỉ gieo lần đầu (trang tải lại trong cùng test phải giữ thay đổi của người dùng).
      if (sessionStorage.getItem('seeded')) return;
      sessionStorage.setItem('seeded', '1');
      localStorage.setItem('vietpiano.profiles.v1', JSON.stringify(profiles));
      for (const [profileId, list] of Object.entries(shortcuts)) {
        const items = list.map((s, i) => ({ color: 'violet', showOnHome: true, ...s, profileId, order: i, createdAt: 1, updatedAt: 1 }));
        localStorage.setItem(`vietpiano.shortcuts.v1:${profileId}`, JSON.stringify({ version: 1, items }));
      }
    },
    { profiles, shortcuts },
  );
}

const bar = (page: Page) => page.getByTestId('shortcut-bar');
const chipNamed = (page: Page, name: string) => bar(page).getByRole('button', { name: new RegExp(`^${name}`) });
/** Nút lối tắt thủ công trên thanh (không tính đề xuất của Lối tắt thông minh). */
const manualChips = (page: Page) => bar(page).locator('[data-testid^="shortcut-chip-"]');

/** Mở hộp thoại tạo lối tắt từ trang chủ: menu ⋯ → "+ Thêm lối tắt" (khi có / chờ đề xuất), hoặc nút "+ Lối tắt" khi thanh trống. */
async function openCreate(page: Page) {
  const more = bar(page).getByTestId('shortcut-more');
  const add = bar(page).getByTestId('shortcut-add');
  await expect(more.or(add)).toBeVisible();
  if (await add.isVisible()) return add.click();
  await more.click();
  await page.getByTestId('shortcut-menu').getByRole('button', { name: '+ Thêm lối tắt' }).click();
}

test('tạo lối tắt ở Cài đặt (tìm không dấu) → hiện cạnh hồ sơ, không làm hàng cao thêm, mở đúng trò; tải lại vẫn còn', async ({ page }) => {
  await seed(page);
  await page.goto('/');
  const row = page.getByTestId('profile-row');
  await expect(bar(page)).toBeVisible();
  const heightBefore = (await row.boundingBox())!.height;
  await expect(manualChips(page)).toHaveCount(0);

  await page.getByRole('button', { name: 'Cài đặt', exact: true }).click();
  const manager = page.getByTestId('shortcut-manager');
  await expect(manager).toContainText('Bé Na');
  await expect(manager.getByTestId('shortcut-empty')).toBeVisible();
  await manager.getByTestId('shortcut-create').click();

  const editor = page.getByTestId('shortcut-editor');
  await expect(editor).toHaveAttribute('data-step', 'pick');
  await editor.getByTestId('destination-search').fill('ca chua');
  await editor.getByTestId('destination-game-tomato-harvest').click();
  await expect(editor).toHaveAttribute('data-step', 'form');
  await expect(editor.getByTestId('shortcut-name')).toHaveValue('Thu hoạch cà chua');
  await expect(editor.getByTestId('shortcut-icon')).toHaveValue('🍅');
  await editor.getByTestId('shortcut-name').fill('🍅 Thu hoạch');
  await editor.getByTestId('shortcut-save').click();
  await expect(editor).toHaveCount(0);
  await expect(manager.getByTestId('shortcut-row-name')).toHaveText(['🍅 Thu hoạch']);

  await page.getByRole('button', { name: 'Quay lại', exact: true }).click();
  await expect(chipNamed(page, '🍅 Thu hoạch')).toBeVisible();
  // Nút lối tắt cao bằng nút hồ sơ: hàng hồ sơ không cao thêm.
  expect((await row.boundingBox())!.height).toBeLessThanOrEqual(heightBefore + 1);

  await page.reload();
  await chipNamed(page, '🍅 Thu hoạch').click();
  await expect(page.getByTestId('tomato-harvest')).toBeVisible();
});

test('buổi học sâu trong giáo trình: duyệt Giáo trình → Cấp 1 → Buổi 2, mở thẳng phần Trò chơi', async ({ page }) => {
  await seed(page);
  await page.goto('/');
  await openCreate(page);
  const editor = page.getByTestId('shortcut-editor');
  await editor.getByTestId('browse-curriculum').click();
  await editor.getByTestId('browse-curriculum/level-1').click();
  await editor.getByTestId('browse-curriculum/level-1/l1-02-find-c').click();
  await expect(editor.getByTestId('shortcut-editor-destination')).toContainText('Buổi 2: Tìm nốt Đô');
  await editor.getByTestId('shortcut-stage-game').click();
  await expect(editor.getByTestId('shortcut-name')).toHaveValue('Buổi 2: Tìm nốt Đô · Trò chơi');
  await editor.getByTestId('shortcut-save').click();

  await chipNamed(page, 'Buổi 2: Tìm nốt Đô').click();
  await expect(page.getByTestId('lesson-title')).toHaveText('Tìm nốt Đô');
  await expect(page.getByTestId('nav-game')).toHaveAttribute('aria-current', 'step');
  // Đang ở đúng phần đã ghim → nút ghim ở đầu trang báo "Đã ghim".
  await expect(page.getByTestId('pin-shortcut')).toHaveAttribute('data-pinned', 'true');
});

test('buổi "nên học sau" vẫn theo quy tắc giáo trình: mở trang buổi học kèm nhắc buổi nên học trước', async ({ page }) => {
  await seed(page, { 'p-be': [{ id: 's1', name: 'Kiểm tra tuần 1', icon: '📗', target: { type: 'lesson', id: 'l1-05-week1-test' } }] });
  await page.goto('/');
  await chipNamed(page, 'Kiểm tra tuần 1').click();
  await expect(page.getByTestId('lesson-title')).toHaveText('Kiểm tra tuần 1');
  await expect(page.getByText(/Nên học trước: Buổi 4/)).toBeVisible();
});

test('ghim tại chỗ trong ⚙ Cài đặt của trò chơi; trùng đích bị chặn; bỏ ghim có hoàn tác', async ({ page }) => {
  await seed(page);
  await page.goto('/?screen=flappy-note');
  await page.getByTestId('flappy-settings').click();
  const row = page.getByTestId('pin-shortcut-row');
  await expect(row).toHaveAttribute('data-pinned', 'false');
  await row.getByTestId('pin-shortcut').click();
  const editor = page.getByTestId('shortcut-editor');
  await expect(editor).toHaveAttribute('data-step', 'form');
  await expect(editor.getByTestId('shortcut-name')).toHaveValue('Flappy Note');
  await editor.getByTestId('shortcut-save').click();
  await expect(row).toHaveAttribute('data-pinned', 'true');
  await expect(row).toContainText('Đã ghim');

  // Tạo lại cùng đích từ trang chủ → báo trùng, không lưu được.
  await page.goto('/');
  await expect(chipNamed(page, 'Flappy Note')).toBeVisible();
  await openCreate(page);
  await editor.getByTestId('destination-search').fill('flappy');
  await editor.getByTestId('destination-game-flappy-note').click();
  await expect(editor.getByTestId('shortcut-duplicate')).toContainText('Flappy Note');
  await expect(editor.getByTestId('shortcut-save')).toBeDisabled();
  await page.keyboard.press('Escape');

  // Bỏ ghim ngay trong trò → Hoàn tác.
  await page.goto('/?screen=flappy-note');
  await page.getByTestId('flappy-settings').click();
  await row.getByTestId('pin-shortcut-remove').click();
  await expect(row).toHaveAttribute('data-pinned', 'false');
  await page.getByTestId('shortcut-undo-button').click();
  await expect(row).toHaveAttribute('data-pinned', 'true');
});

test('mỗi hồ sơ một danh sách lối tắt; đổi hồ sơ cập nhật tức thì', async ({ page }) => {
  await seed(page, {
    'p-be': [{ id: 'a1', name: 'Cà chua', icon: '🍅', target: { type: 'game', id: 'tomato-harvest' } }],
    'p-me': [{ id: 'b1', name: 'Bài hát yêu thích', icon: '🎼', target: { type: 'practice', id: 'song-ode-to-joy' } }],
  });
  await page.goto('/');
  await expect(chipNamed(page, 'Cà chua')).toBeVisible();
  await expect(chipNamed(page, 'Bài hát yêu thích')).toHaveCount(0);
  await page.getByTestId('profile-Mẹ').click();
  await expect(chipNamed(page, 'Bài hát yêu thích')).toBeVisible();
  await expect(chipNamed(page, 'Cà chua')).toHaveCount(0);
  await chipNamed(page, 'Bài hát yêu thích').click();
  await expect(page.getByRole('heading', { level: 1, name: /Ode to Joy/ })).toBeVisible();
  await page.goto('/');
  // Hồ sơ đang chọn được giữ → vẫn là lối tắt của Mẹ.
  await expect(chipNamed(page, 'Bài hát yêu thích')).toBeVisible();
  await page.getByTestId('profile-Bé Na').click();
  await expect(chipNamed(page, 'Cà chua')).toBeVisible();
});

test('đích không còn tồn tại: thông báo thân thiện, cho chọn lại hoặc xoá (có hoàn tác)', async ({ page }) => {
  await seed(page, { 'p-be': [{ id: 'gone', name: 'Bài cũ', icon: '🎹', target: { type: 'lesson', id: 'l9-99-removed' } }] });
  await page.goto('/');
  const chip = chipNamed(page, 'Bài cũ');
  await expect(chip).toHaveAttribute('data-broken', 'true');
  await chip.click();
  const dialog = page.getByTestId('shortcut-broken');
  await expect(dialog).toContainText('Không mở được');
  await expect(page.getByTestId('dashboard')).toBeVisible();
  // Chọn lại nội dung → hộp thoại sửa mở ở bước chọn đích.
  await dialog.getByTestId('shortcut-broken-edit').click();
  await expect(page.getByTestId('shortcut-editor')).toHaveAttribute('data-step', 'pick');
  await page.keyboard.press('Escape');
  await chip.click();
  await dialog.getByTestId('shortcut-broken-delete').click();
  await expect(chip).toHaveCount(0);
  await page.getByTestId('shortcut-undo-button').click();
  await expect(chip).toBeVisible();
});

test('Cài đặt → Lối tắt: sắp xếp bằng nút và kéo thả, ẩn khỏi thanh, tìm khi danh sách dài, xoá có hoàn tác', async ({ page }) => {
  const names = ['Cà chua', 'Flappy', 'Bóng bay', 'Săn nốt', 'Thư viện', 'Giáo trình'];
  const targets = [
    { type: 'game', id: 'tomato-harvest' },
    { type: 'game', id: 'flappy-note' },
    { type: 'game', id: 'balloon-pop' },
    { type: 'game', id: 'note-hunter' },
    { type: 'page', id: 'library' },
    { type: 'page', id: 'curriculum' },
  ];
  await seed(page, { 'p-be': names.map((name, i) => ({ id: `s${i}`, name, icon: '⭐', target: targets[i] })) });
  await page.goto('/');
  await page.getByRole('button', { name: 'Cài đặt', exact: true }).click();
  const manager = page.getByTestId('shortcut-manager');
  const order = () => manager.getByTestId('shortcut-row-name').allTextContents();
  await expect.poll(order).toEqual(names);

  // Nút xuống / lên (thiết bị không kéo thả được).
  await manager.getByTestId('shortcut-row-s0').getByTestId('shortcut-down').click();
  await expect.poll(order).toEqual(['Flappy', 'Cà chua', 'Bóng bay', 'Săn nốt', 'Thư viện', 'Giáo trình']);
  await manager.getByTestId('shortcut-row-s0').getByTestId('shortcut-up').click();
  await expect.poll(order).toEqual(names);

  // Kéo tay nắm của "Săn nốt" lên đầu danh sách.
  const handle = manager.getByTestId('shortcut-row-s3').getByTestId('shortcut-drag');
  const first = (await manager.getByTestId('shortcut-row-s0').boundingBox())!;
  const box = (await handle.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2, first.y + 4, { steps: 8 });
  await page.mouse.up();
  await expect.poll(order).toEqual(['Săn nốt', 'Cà chua', 'Flappy', 'Bóng bay', 'Thư viện', 'Giáo trình']);

  // Phím mũi tên trên tay nắm.
  await manager.getByTestId('shortcut-row-s3').getByTestId('shortcut-drag').press('ArrowDown');
  await expect.poll(order).toEqual(['Cà chua', 'Săn nốt', 'Flappy', 'Bóng bay', 'Thư viện', 'Giáo trình']);

  // Tìm (đủ dài mới có ô tìm).
  await manager.getByTestId('shortcut-search').fill('bong bay');
  await expect.poll(order).toEqual(['Bóng bay']);
  await manager.getByTestId('shortcut-search').fill('');

  // Ẩn "Cà chua" khỏi thanh → không còn nút trên thanh nhưng vẫn ở menu ⋯.
  await manager.getByTestId('shortcut-row-s0').getByTestId('shortcut-home-toggle').click();
  await expect(manager.getByTestId('shortcut-row-s0').getByTestId('shortcut-home-toggle')).toHaveAttribute('aria-checked', 'false');

  // Xoá → hoàn tác.
  await manager.getByTestId('shortcut-row-s5').getByTestId('shortcut-delete').click();
  await expect.poll(order).toEqual(['Cà chua', 'Săn nốt', 'Flappy', 'Bóng bay', 'Thư viện']);
  await page.getByTestId('shortcut-undo-button').click();
  await expect.poll(order).toEqual(['Cà chua', 'Săn nốt', 'Flappy', 'Bóng bay', 'Thư viện', 'Giáo trình']);

  await page.getByRole('button', { name: 'Quay lại', exact: true }).click();
  await expect(chipNamed(page, 'Cà chua')).toHaveCount(0);
  await expect(chipNamed(page, 'Săn nốt')).toBeVisible();
  await bar(page).getByTestId('shortcut-more').click();
  const menuItems = page.getByTestId('shortcut-menu').locator('[data-testid^="shortcut-menu-item-"]');
  await expect(menuItems).toHaveCount(6);
  await expect(menuItems.first()).toContainText('Cà chua');
});

test('trò tự do, trò của buổi học, bài thư viện: mở thẳng đúng nội dung từ menu ⋯', async ({ page }) => {
  await seed(page, {
    'p-be': [
      { id: 'x1', name: 'Nghe nốt', icon: '👂', target: { type: 'arcade', id: 'ear-finder:c-five' } },
      { id: 'x2', name: 'Săn phím buổi 1', icon: '🐸', target: { type: 'lesson-game', id: 'l1-01-keyboard:key-hunt' } },
      { id: 'x3', name: 'Twinkle', icon: '⭐', target: { type: 'practice', id: 'song-twinkle' } },
      { id: 'x4', name: 'Thư viện bài', icon: '📖', target: { type: 'page', id: 'library' }, showOnHome: false },
    ],
  });
  const viaMenu = async (id: string) => {
    await page.goto('/');
    await bar(page).getByTestId('shortcut-more').click();
    await page.getByTestId(`shortcut-menu-item-${id}`).click();
  };
  await viaMenu('x1');
  await expect(page.getByTestId('games-playing-title')).toContainText('Nghe nốt đoán phím · 5 nốt Đô – Sol');
  await viaMenu('x2');
  await expect(page.getByTestId('games-playing-title')).toContainText('Cấp 1 · Buổi 1');
  await expect(page.getByTestId('game-intro')).toHaveAttribute('data-game', 'key-hunt');
  await viaMenu('x3');
  await expect(page.getByRole('heading', { level: 1, name: /Twinkle/ })).toBeVisible();
  // Thư viện bài nằm ngay trên trang chủ → chỉ cuộn xuống.
  await viaMenu('x4');
  await expect(page.getByTestId('dashboard')).toBeVisible();
  await expect(page.locator('#library')).toBeInViewport();
});

test('trẻ em: menu ⋯ chỉ có mở / thêm lối tắt; người lớn có thêm "Quản lý" → Cài đặt → Lối tắt', async ({ page }) => {
  await seed(page, {
    'p-be': [{ id: 'k1', name: 'Cà chua', icon: '🍅', target: { type: 'game', id: 'tomato-harvest' } }],
    'p-me': [{ id: 'm1', name: 'Giáo trình', icon: '📚', target: { type: 'page', id: 'curriculum' } }],
  });
  await page.goto('/');
  await expect(page.getByTestId('dashboard')).toHaveAttribute('data-ui-mode', 'kids');
  await bar(page).getByTestId('shortcut-more').click();
  await expect(page.getByTestId('shortcut-menu')).toBeVisible();
  await expect(page.getByTestId('shortcut-manage')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await page.getByTestId('profile-Mẹ').click();
  await expect(page.getByTestId('dashboard')).toHaveAttribute('data-ui-mode', 'adult');
  await bar(page).getByTestId('shortcut-more').click();
  await page.getByTestId('shortcut-manage').click();
  await expect(page.getByTestId('shortcut-manager')).toBeInViewport();
  await expect(page.getByTestId('shortcut-manager')).toContainText('Mẹ');
});

test.describe('màn hẹp (điện thoại)', () => {
  test.use({ viewport: { width: 390, height: 844 } });
  test('thanh lối tắt dồn vào menu gọn, không tràn ngang', async ({ page }) => {
    await seed(page, {
      'p-be': [
        { id: 'n1', name: 'Thu hoạch cà chua rất là dài', icon: '🍅', target: { type: 'game', id: 'tomato-harvest' } },
        { id: 'n2', name: 'Flappy Note', icon: '🐤', target: { type: 'game', id: 'flappy-note' } },
        { id: 'n3', name: 'Giáo trình', icon: '📚', target: { type: 'page', id: 'curriculum' } },
      ],
    });
    await page.goto('/');
    await expect(bar(page)).toBeVisible();
    const overflow = await page.getByTestId('dashboard').evaluate((el) => el.scrollWidth - el.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    const barBox = (await bar(page).boundingBox())!;
    expect(barBox.x + barBox.width).toBeLessThanOrEqual(390);
    await bar(page).getByTestId('shortcut-more').click();
    const menu = page.getByTestId('shortcut-menu');
    await expect(menu).toBeVisible();
    const menuBox = (await menu.boundingBox())!;
    expect(menuBox.x).toBeGreaterThanOrEqual(0);
    expect(menuBox.x + menuBox.width).toBeLessThanOrEqual(390);
    await menu.getByTestId('shortcut-menu-item-n3').click();
    await expect(page.getByTestId('curriculum')).toBeVisible();
  });
});
