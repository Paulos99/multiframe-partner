import { test, type Page } from '@playwright/test';
import { writeFileSync } from 'node:fs';
const roles = ['admin', 'owner', 'sales', 'measurer', 'crew'];
const widths = (process.env.AUDIT_W || '360,390,768,820,1024').split(',').map(Number);
const out: unknown[] = [];
test.use({ actionTimeout: 8000 });
async function measure(page: Page, label: string) {
  
  await page.waitForTimeout(500);
  const r = await page.evaluate(() => {
    const W = window.innerWidth;
    const se = document.scrollingElement!;
    const over: string[] = [];
    const small: string[] = [];
    const fonts: string[] = [];
    const desc = (el: Element) => `${el.tagName.toLowerCase()}.${String((el as HTMLElement).className).slice(0, 50)}"${(el.textContent || (el as HTMLInputElement).placeholder || el.getAttribute('aria-label') || '').trim().slice(0, 28)}"`;
    document.querySelectorAll('body *').forEach((el) => {
      const b = el.getBoundingClientRect();
      if (!b.width || !b.height) return;
      const cs = getComputedStyle(el);
      if (cs.visibility === 'hidden' || cs.display === 'none') return;
      if (b.right > W + 1 || b.left < -1) {
        let p = el.parentElement; let clipped = false;
        while (p) { const pc = getComputedStyle(p); if (pc.overflowX !== 'visible') { clipped = true; break; } p = p.parentElement; }
        if (!clipped) over.push(`${desc(el)} L${Math.round(b.left)} R${Math.round(b.right)}`);
      }
      if (el.matches('button, a[href], [role=tab], select, input:not([type=hidden])') && (b.height < 43.5) && b.right > 0 && b.left < W && b.bottom > 0) small.push(`${desc(el)} ${Math.round(b.width)}x${Math.round(b.height)}`);
      if (el.matches('input:not([type=checkbox]):not([type=radio]):not([type=file]), select, textarea') && parseFloat(cs.fontSize) < 16) fonts.push(`${desc(el)} ${cs.fontSize}`);
    });
    return { W, sw: se.scrollWidth, over: over.slice(0, 10), small: [...new Set(small)].slice(0, 30), fonts: [...new Set(fonts)].slice(0, 10) };
  });
  out.push({ label, ...r });
  console.log('M', label, r.sw, r.over.length, r.small.length);
}
test('audit', async ({ page, request }) => {
  test.setTimeout(1200000);
  for (const w of widths) {
    await page.setViewportSize({ width: w, height: w < 700 ? 844 : 1100 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');
    await measure(page, `${w} login`);
    for (const role of roles) {
      await request.post('http://127.0.0.1:4181/__reset');
      await page.getByRole('button', { name: 'Выйти', exact: true }).click({ timeout: 2000 }).catch(() => {});
      await page.goto('/');
      await page.getByLabel('Логин', { exact: true }).fill(`ui.${role}`);
      await page.getByLabel('Пароль', { exact: true }).fill('ui-fixture-password-only');
      await page.getByRole('button', { name: 'Войти', exact: true }).click();
      await page.getByRole('button', { name: 'Мой профиль', exact: true }).waitFor({ timeout: 15000 });
      await measure(page, `${w} ${role} home`);
      const tabs = page.locator('aside button');
      const n = await tabs.count();
      for (let i = 0; i < n; i++) {
        const t = tabs.nth(i);
        const name = (await t.innerText()).trim();
        if (/Проблемомер|Калькулятор/.test(name)) continue;
        await t.click({ timeout: 3000 }).catch(() => {});
        await measure(page, `${w} ${role} ${name}`);
      }
      await page.getByRole('button', { name: 'Мой профиль', exact: true }).click({ timeout: 5000 }).catch(() => {});
      await measure(page, `${w} ${role} profile`);
      await page.getByRole('button', { name: 'Закрыть профиль' }).click({ timeout: 3000 }).catch(() => {});
    }
  }
  writeFileSync(`/workspace/audit/report-${process.env.AUDIT_TAG || 'x'}.json`, JSON.stringify(out, null, 1));
});
