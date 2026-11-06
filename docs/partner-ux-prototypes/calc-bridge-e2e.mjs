/**
 * GC9-P0-01 bridge e2e — real iframe calc → host draft (not direct ingest).
 * Requires: static server on :8765 (`python3 -m http.server 8765 --directory docs/partner-ux-prototypes`)
 * and playwright (e.g. `cd /tmp && npm i playwright@1.49.1 && npx playwright install chromium`).
 */
import { chromium } from "playwright";

const BASE = process.env.GATE_C_BASE || "http://127.0.0.1:8765";

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
await page.evaluate(() => {
  localStorage.clear();
  MFStore.resetAll();
  MFStore.setRole("sales");
  location.hash = "#/tools/calc";
});
await page.waitForSelector('.tool-host[data-tool="calc"] iframe', { timeout: 15000 });
const frame = page.frameLocator('.tool-host[data-tool="calc"] iframe');

await frame.locator("#entryDimsBtn").click({ timeout: 15000 });
await frame.locator("#quickLength").fill("7");
await frame.locator("#quickWidth").fill("3");
await frame.locator("#quickHeight").fill("2.7");
const recalc = frame.locator('button:has-text("Пересчитать"), button:has-text("Рассчитать")').first();
await recalc.click({ timeout: 10000 });
await frame.locator(".stat-value, #partnerTotalCost").first().waitFor({ timeout: 20000 });

await page.click('[data-action="calc-save-and-bind"]');
await page.waitForFunction(
  () => {
    const d = MFStore.get().sessionDraft;
    return d && d.calcDone && MFStore.draftAreaM2(d) >= 20;
  },
  { timeout: 25000 }
);

const snap = await page.evaluate(() => {
  const d = MFStore.get().sessionDraft;
  return {
    calcDone: d?.calcDone,
    area: MFStore.draftAreaM2(d),
    amount: d?.amount,
    meta: d?.calcMeta,
    hash: location.hash,
  };
});

await browser.close();

if (!snap.calcDone || snap.area < 20) {
  console.error("FAIL calc-bridge-e2e", snap);
  process.exit(1);
}
console.log("PASS calc-bridge-e2e", JSON.stringify(snap));
