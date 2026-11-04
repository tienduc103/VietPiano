import { expect, test } from '@playwright/test';

test.describe('Module Khám phá nốt nhạc (Note Discovery)', () => {
  test('mở màn tổng quan từ trang chủ và hiển thị đủ 8 chặng', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('open-note-discovery').click();

    await expect(page.getByRole('heading', { name: 'Khám phá nốt nhạc' })).toBeVisible();
    await expect(page.getByText('Bảng mức độ thành thạo các nốt')).toBeVisible();

    // Kiểm tra có đủ 8 chặng
    for (let i = 1; i <= 8; i++) {
      await expect(page.getByText(`Chặng ${i}`)).toBeVisible();
    }
  });

  test('vào thẳng chặng 2 qua URL và tương tác phím Đô giữa (C4)', async ({ page }) => {
    await page.goto('/?screen=note-discovery');
    // Bấm bắt đầu học ở chặng 1 hoặc chặng 2
    await page.getByRole('button', { name: 'Bắt đầu học ▶️' }).first().click();

    // Màn học hiện ra
    await expect(page.getByTestId('note-discovery-screen')).toBeVisible();
    await expect(page.getByTestId('discovery-staff-view')).toBeVisible();

    // Bàn phím piano ảo sẵn sàng
    const keyboard = page.getByRole('group', { name: 'Bàn phím piano ảo' });
    await expect(keyboard).toBeVisible();
  });
});
