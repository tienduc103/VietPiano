import { expect, test } from '@playwright/test';

/** Ollama giả: trả NDJSON như /api/chat thật; ghi lại prompt app gửi đi.
 * Cài đặt "auto" gọi proxy `<app>/ollama/api/*` trước → mock cả hai đường (proxy và localhost:11434),
 * không để e2e chạm Ollama thật qua proxy của `vite preview`. */
const TAGS = '**/api/tags';
const CHAT = '**/api/chat';

test('nhận xét bằng AI (Ollama giả): bật trong Cài đặt, hiện sau khi hoàn thành bài', async ({ page, baseURL }) => {
  const prompts: string[] = [];
  await page.route(TAGS, (route) =>
    route.fulfill({ contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({ models: [{ name: 'gemma4:12b' }] }) }),
  );
  await page.route(CHAT, (route) => {
    prompts.push(route.request().postData() ?? '');
    route.fulfill({
      contentType: 'application/x-ndjson',
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: ['Bạn chơi rất chắc tay.', ' Lần sau giữ nhịp đều hơn nhé.', ''].map((c) => JSON.stringify({ message: { content: c } })).join('\n'),
    });
  });

  await page.goto('/?screen=library');
  await page.getByRole('button', { name: 'Cài đặt' }).click();
  const toggle = page.locator('label', { hasText: 'Bật nhận xét bằng AI sau mỗi bài' }).getByRole('switch');
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-checked', 'true');
  await page.getByTestId('ollama-test').click();
  // Địa chỉ proxy theo server đang chạy test (không ghi cứng cổng).
  await expect(page.getByText(`Kết nối tốt — 1 model qua ${new URL('ollama', `${baseURL}/`).href}.`)).toBeVisible();

  await page.goto('/?screen=library');
  await page.getByTestId('lesson-scale-c-major').click();
  await expect(page.locator('[data-testid="score"] svg .score-note').first()).toBeVisible();
  for (const key of 'asdfghjkkjhgfdsa') {
    await page.keyboard.press(key);
    await page.waitForTimeout(140);
  }
  const dialog = page.getByRole('dialog', { name: 'Kết quả' });
  await expect(dialog.getByTestId('ai-coach-text')).toHaveText('Bạn chơi rất chắc tay. Lần sau giữ nhịp đều hơn nhé.');
  expect(prompts).toHaveLength(1);
  const body = JSON.parse(prompts[0]) as { model: string; messages: { content: string }[] };
  expect(body.model).toBe('gemma4:12b');
  expect(body.messages[1].content).toContain('Điểm: 100/100');
});

test('nhận xét bằng AI: mặc định tắt, không gọi Ollama', async ({ page }) => {
  let called = false;
  for (const url of ['http://localhost:11434/**', '**/ollama/**'])
    await page.route(url, (route) => {
      called = true;
      return route.abort();
    });
  await page.goto('/?screen=library');
  await page.getByTestId('lesson-scale-c-major').click();
  for (const key of 'asdfghjkkjhgfdsa') {
    await page.keyboard.press(key);
    await page.waitForTimeout(140);
  }
  await expect(page.getByRole('dialog', { name: 'Kết quả' })).toBeVisible();
  await expect(page.getByTestId('ai-coach')).toHaveCount(0);
  expect(called).toBe(false);
});

test('nhận xét AI của buổi học được lưu vào lịch sử buổi, còn sau khi tải lại', async ({ page }) => {
  await page.addInitScript(() => {
    const key = 'vietpiano.settings.v1';
    const s = JSON.parse(localStorage.getItem(key) ?? '{}') as Record<string, unknown>;
    localStorage.setItem(key, JSON.stringify({ ...s, aiCoachEnabled: true, ollamaUrl: 'http://localhost:11434' }));
  });
  await page.route(TAGS, (route) =>
    route.fulfill({ contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({ models: [{ name: 'gemma4:12b' }] }) }),
  );
  await page.route(CHAT, (route) =>
    route.fulfill({
      contentType: 'application/x-ndjson',
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ message: { content: 'Nhóm 2 phím đen còn nhầm, tập thêm nhé.' } }) + '\n',
    }),
  );

  await page.goto('/');
  await page.getByTestId('continue-learning').click();
  await page.getByTestId('start-lesson').click();
  for (let i = 0; i < 3; i++) await page.getByTestId('intro-next').click();
  const press = async (midi: number) => {
    await page.locator(`[data-testid="key-quiz"] [data-midi="${midi}"]`).click();
    await page.waitForTimeout(320);
  };
  for (const m of [61, 60, 61, 66]) await press(m);
  await page.getByTestId('exercise-next').click();
  for (const m of [61, 66, 60, 68, 63]) await press(m);
  await page.getByTestId('exercise-next').click();

  await expect(page.getByTestId('lesson-score')).toHaveText('80/100');
  await expect(page.getByTestId('ai-coach-text')).toHaveText('Nhóm 2 phím đen còn nhầm, tập thêm nhé.');
  await page.getByRole('button', { name: 'Viết lại nhận xét' }).click();
  await expect(page.getByTestId('ai-coach-text')).toHaveText('Nhóm 2 phím đen còn nhầm, tập thêm nhé.');

  // Tải lại: lịch sử đọc từ IndexedDB; "Viết lại" ghi đè cùng lần làm, không thêm bản mới.
  await page.goto('/?screen=curriculum');
  await page.getByTestId('cur-lesson-l1-01-keyboard').click();
  const history = page.getByTestId('ai-note-history');
  await expect(history).toContainText('80/100');
  await expect(history.getByTestId('ai-note-text')).toHaveCount(1);
  await expect(history.getByTestId('ai-note-text')).toHaveText('Nhóm 2 phím đen còn nhầm, tập thêm nhé.');
});
