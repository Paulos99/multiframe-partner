import { test, expect } from '@playwright/test';

// Файл logo-stp.png белый. На белой плашке экрана входа он должен быть затемнён.
for (const theme of ['light', 'dark'] as const) {
  test(`${theme}: логотип на экране входа виден, а не белый на белом`, async ({ page }) => {
    await page.addInitScript((t) => localStorage.setItem('mf_theme', t), theme);
    await page.goto('/');
    const logo = page.getByRole('img', { name: 'StP MultiFrame' });
    await expect(logo).toBeVisible();
    await expect(logo).toHaveJSProperty('complete', true);
    // Рисуем логотип с его вычисленным фильтром поверх фона плашки и считаем тёмные пиксели.
    const dark = await logo.evaluate((el) => {
      const img = el as HTMLImageElement;
      const cs = getComputedStyle(img);
      const c = document.createElement('canvas');
      c.width = 120;
      c.height = 120;
      const ctx = c.getContext('2d')!;
      ctx.fillStyle = getComputedStyle(img.parentElement!).backgroundColor;
      ctx.fillRect(0, 0, 120, 120);
      ctx.filter = cs.filter === 'none' ? 'none' : cs.filter;
      ctx.drawImage(img, 0, 0, 120, 120);
      const d = ctx.getImageData(0, 0, 120, 120).data;
      let n = 0;
      for (let i = 0; i < d.length; i += 4) if (d[i]! < 100 && d[i + 1]! < 100 && d[i + 2]! < 100) n += 1;
      return n;
    });
    expect(dark, 'тёмные пиксели логотипа').toBeGreaterThan(300);
  });
}
