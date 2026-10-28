import { expect, test } from '@playwright/test';

/** Ollama giả: trả NDJSON như /api/chat thật; ghi lại prompt app gửi đi. */
test('nhận xét bằng AI (Ollama giả): bật trong Cài đặt, hiện sau khi hoàn thành bài', async ({ page }) => {
  const prompts: string[] = [];
  await page.route('http://localhost:11434/api/tags', (route) =>
    route.fulfill({ contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({ models: [{ name: 'gemma4:12b' }] }) }),
  );
  await page.route('http://localhost:11434/api/chat', (route) => {
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
  await expect(page.getByText('Kết nối tốt — 1 model.')).toBeVisible();

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
  await page.route('http://localhost:11434/**', (route) => {
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
