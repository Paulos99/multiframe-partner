import { test, expect, type Page } from '@playwright/test';

// На экране входа — логотип MultiFrame (белая надпись-маска logo-multiframe.png).
// Как в шапке кабинета: чёрный на светлой теме, белый на тёмной. Компактный и чёткий.

async function inkPixels(page: Page, theme: 'light' | 'dark') {
  const logo = page.getByRole('img', { name: 'MultiFrame' });
  return logo.evaluate((el, t) => {
    const img = el as HTMLImageElement;
    const cs = getComputedStyle(img);
    // Фон под логотипом — первый непрозрачный фон среди предков.
    let bg = 'rgb(255, 255, 255)';
    for (let node: HTMLElement | null = img.parentElement; node; node = node.parentElement) {
      const c = getComputedStyle(node).backgroundColor;
      if (c && c !== 'transparent' && !c.startsWith('rgba(0, 0, 0, 0)')) {
        bg = c;
        break;
      }
    }
    const w = 300;
    const h = Math.round((w * img.naturalHeight) / img.naturalWidth);
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);
    ctx.filter = cs.filter === 'none' ? 'none' : cs.filter;
    ctx.globalAlpha = Number(cs.opacity) || 1;
    ctx.drawImage(img, 0, 0, w, h);
    const d = ctx.getImageData(0, 0, w, h).data;
    let n = 0;
    for (let i = 0; i < d.length; i += 4) {
      const lum = (d[i]! + d[i + 1]! + d[i + 2]!) / 3;
      if (t === 'light' ? lum < 70 : lum > 200) n += 1;
    }
    return n;
  }, theme);
}

const viewports = [
  { name: 'компьютер', size: { width: 1440, height: 1000 }, min: 140, max: 160 },
  { name: 'телефон', size: { width: 390, height: 844 }, min: 110, max: 130 },
] as const;

for (const vp of viewports) {
  for (const theme of ['light', 'dark'] as const) {
    test(`${vp.name}, ${theme}: на входе логотип MultiFrame, компактный и контрастный`, async ({ page }) => {
      await page.setViewportSize(vp.size);
      await page.addInitScript((t) => localStorage.setItem('mf_theme', t), theme);
      await page.goto('/');
      const logo = page.getByRole('img', { name: 'MultiFrame' });
      await expect(logo).toBeVisible();
      await expect(logo).toHaveJSProperty('complete', true);
      await expect(logo).toHaveAttribute('src', /logo-multiframe\.png$/);
      // Старого логотипа StP на экране входа больше нет.
      await expect(page.locator('img[src*="logo-stp"]')).toHaveCount(0);

      const box = (await logo.boundingBox())!;
      expect(box.width, 'ширина логотипа').toBeGreaterThanOrEqual(vp.min);
      expect(box.width, 'ширина логотипа').toBeLessThanOrEqual(vp.max);
      // Чёткость: у исходника минимум в 3 раза больше пикселей, чем на экране.
      const natural = await logo.evaluate((el) => (el as HTMLImageElement).naturalWidth);
      expect(natural).toBeGreaterThanOrEqual(box.width * 3);

      // Светлая тема — чёрная надпись, тёмная — белая.
      expect(await inkPixels(page, theme), 'контрастные пиксели логотипа').toBeGreaterThan(2000);
    });
  }
}
