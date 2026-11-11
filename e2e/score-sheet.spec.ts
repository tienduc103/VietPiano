import { expect, test } from '@playwright/test';

type FillText = { font: string; align: CanvasTextAlign; text: string };

/**
 * Ảnh khuông nhạc (canvas, `core/score/ScoreSheet`): VexFlow vẽ glyph tại mép trái nên phải vẽ với `textAlign` canh trái —
 * để lọt canh giữa của tiêu đề / tên nốt thì mọi đầu nốt, khoá, dấu hoá lệch nửa bề rộng (đuôi nốt mọc giữa đầu nốt).
 * Ảnh có đủ ký hiệu như khuông màn hình: sắc thái, pedal, nhịp độ, tên giọng.
 */
test('ảnh khuông nhạc Canon in D: glyph VexFlow canh trái, đủ sắc thái + pedal + nhịp độ', async ({ page }) => {
  await page.addInitScript(() => {
    const calls: FillText[] = [];
    (window as unknown as { __fillTexts: FillText[] }).__fillTexts = calls;
    const orig = CanvasRenderingContext2D.prototype.fillText;
    CanvasRenderingContext2D.prototype.fillText = function (this: CanvasRenderingContext2D, text: string, x: number, y: number, maxWidth?: number) {
      calls.push({ font: this.font, align: this.textAlign, text });
      if (maxWidth === undefined) orig.call(this, text, x, y);
      else orig.call(this, text, x, y, maxWidth);
    };
  });
  await page.goto('/?screen=song-library');
  await page.getByTestId('export-song-canon-in-d-easy').click();
  const dialog = page.getByRole('dialog', { name: 'Xuất ảnh khuông nhạc' });
  const preview = dialog.getByTestId('score-sheet-preview');
  await expect(preview).toBeVisible();
  expect(await preview.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBe(2200);

  const calls = await page.evaluate(() => (window as unknown as { __fillTexts: FillText[] }).__fillTexts);
  // Glyph của VexFlow (font "Bravura, Academico"): đầu nốt, khoá, hoá biểu, số chỉ nhịp, dấu lặng, cờ móc.
  const glyphs = calls.filter((c) => /Bravura,\s*Academico/.test(c.font));
  expect(glyphs.length).toBeGreaterThan(100);
  expect([...new Set(glyphs.map((c) => c.align))]).toEqual(['left']);

  const texts = calls.map((c) => c.text);
  // Sắc thái p / mp / mf và "Ped." (glyph SMuFL của Bravura), nhịp độ ♩ = 76, tên giọng ở dòng thông tin.
  expect(texts).toEqual(expect.arrayContaining(['\uE520', '\uE521\uE520', '\uE521\uE522', '\uE650', '= 76']));
  expect(texts.some((t) => t.includes('Rê trưởng'))).toBe(true);
  // Hàng tên nốt dưới khuông; tắt "Ghi tên nốt" thì vẽ lại không có hàng tên nốt (pedal vẫn còn).
  expect(texts).toContain('F#5');
  const before = texts.length;
  await dialog.getByRole('switch', { name: 'Ghi tên nốt dưới khuông' }).click();
  await expect(preview).toBeVisible();
  await expect.poll(async () => page.evaluate(() => (window as unknown as { __fillTexts: FillText[] }).__fillTexts.length)).toBeGreaterThan(before);
  const after = (await page.evaluate(() => (window as unknown as { __fillTexts: FillText[] }).__fillTexts)).slice(before).map((c) => c.text);
  expect(after).not.toContain('F#5');
  expect(after).toContain('\uE650');
});
