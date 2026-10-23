/**
 * GC9/GC10 browser E2E — calc iframe → mf-cabinet-calc → bind → room reopen.
 * Run: node docs/partner-ux-prototypes/e2e-gc9.mjs
 */
import { chromium } from "playwright-core";
import { createServer } from "http";
import { readFile } from "fs/promises";
import { join, extname } from "path";
import { fileURLToPath } from "url";

const ROOT = fileURLToPath(new URL(".", import.meta.url));
const PORT = 8765;
const STORE_KEY = "mf_gate_c_proto_v10";
const BIND_PAIR = "prj_nv_soroka::room_sor_living";
const PANEL_COVERAGE_M2 = 0.75 * 0.55;
const CEILING_21_PANELS = Math.ceil(21 / PANEL_COVERAGE_M2);

const results = [];
function check(name, ok, detail = "") {
  results.push({ name, ok, detail });
  console.log(ok ? "PASS" : "FAIL", name, detail || "");
}

function mime(p) {
  const m = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".png": "image/png" };
  return m[extname(p)] || "application/octet-stream";
}

async function ensureServer() {
  try {
    const r = await fetch(`http://127.0.0.1:${PORT}/`);
    if (r.ok) return;
  } catch {
    /* start */
  }
  const server = createServer(async (req, res) => {
    const path = (req.url || "/").split("?")[0];
    const file = join(ROOT, path === "/" ? "index.html" : path.replace(/^\//, ""));
    try {
      const body = await readFile(file);
      res.writeHead(200, { "Content-Type": mime(file) });
      res.end(body);
    } catch {
      res.writeHead(404);
      res.end("not found");
    }
  });
  await new Promise((r) => server.listen(PORT, "127.0.0.1", r));
}

async function loginSales(page) {
  await page.goto(`http://127.0.0.1:${PORT}/`);
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: "networkidle" });
  await page.click('button[data-action="login"][data-role="sales"]');
  await page.waitForTimeout(300);
}

function calcFrame(page) {
  return page.frameLocator("iframe.tool-frame");
}

async function wallSurfacesChecked(page) {
  const f = calcFrame(page);
  return await f.locator('input[name="wallSurface"]:checked').count();
}

async function readSessionDraft(page) {
  return page.evaluate((key) => JSON.parse(localStorage.getItem(key) || "{}").sessionDraft, STORE_KEY);
}

async function waitCalcDraft(page, areaExpected, timeout = 20000) {
  await page.waitForFunction(
    ({ key, area }) => {
      const raw = localStorage.getItem(key);
      if (!raw) return false;
      const st = JSON.parse(raw);
      const d = st.sessionDraft;
      if (!d?.calcDone || !d.amount) return false;
      const a = Number(d.answers?.areaM2);
      return Math.abs(a - area) < 0.6;
    },
    { key: STORE_KEY, area: areaExpected },
    { timeout }
  );
}

async function runCalc(page) {
  const f = calcFrame(page);
  const btn = f.getByRole("button", { name: /Рассчитать|Пересчитать/i }).first();
  await btn.click();
  await page.waitForTimeout(900);
}

async function reloadCalcIframe(page) {
  await page.goto(`http://127.0.0.1:${PORT}/#/tools/calc`);
  await page.waitForTimeout(600);
  await page.evaluate(() => {
    const f = document.querySelector("iframe.tool-frame");
    if (f?.src) f.src = f.src;
  });
  await page.waitForTimeout(1200);
}

/** GC10: ceiling-only payload — area, panels, amount same scope; walls unchecked. */
async function assertCeilingOnlyDraft(page, areaExpected, label) {
  const walls = await wallSurfacesChecked(page);
  check(`GC10 ${label} zero walls`, walls === 0, String(walls));
  const draft = await readSessionDraft(page);
  const area = Number(draft?.answers?.areaM2);
  check(`GC10 ${label} area ${areaExpected} m²`, Math.abs(area - areaExpected) < 0.6, String(area));
  const panels = Number(draft?.calcPanels);
  const expectedPanels = Math.ceil(areaExpected / PANEL_COVERAGE_M2);
  check(
    `GC10 ${label} ceiling panels ~${expectedPanels}`,
    panels >= expectedPanels - 1 && panels <= expectedPanels + 2,
    `got ${panels}`
  );
  const ceilingOnlyCap = Math.ceil(areaExpected / PANEL_COVERAGE_M2) * 3200 + areaExpected * 2000;
  check(`GC10 ${label} amount ceiling scope`, draft.amount <= ceilingOnlyCap, `${draft.amount} <= ${ceilingOnlyCap}`);
  return draft;
}

async function bindAndReopen(page, areaExpected, draftBeforeBind) {
  await page.goto(`http://127.0.0.1:${PORT}/#/tools/bind`);
  await page.waitForTimeout(400);
  const app = await page.locator("#app").innerText();
  check("bind has draft", !app.includes("Нет черновика"), "");
  await page.selectOption("#bind-savetype", "preliminary");
  await page.selectOption("#bind-pair", BIND_PAIR);
  await page.click('[data-action="do-bind"]');
  await page.waitForTimeout(300);
  const adopt = page.locator('[data-action="bind-resolve-area"][data-resolution="adopt_consultation"]');
  try {
    await adopt.waitFor({ state: "visible", timeout: 4000 });
    await adopt.click();
  } catch {
    /* saved without mismatch */
  }
  const [projectId, roomId] = BIND_PAIR.split("::");
  await page.waitForFunction(
    ({ key, projectId, roomId, amount }) => {
      const st = JSON.parse(localStorage.getItem(key) || "{}");
      const r = st.projects?.find((p) => p.id === projectId)?.rooms?.find((x) => x.id === roomId);
      return r?.preliminary?.areaM2 > 0 && r?.preliminary?.amount === amount;
    },
    { key: STORE_KEY, projectId, roomId, amount: draftBeforeBind.amount },
    { timeout: 12000 }
  );
  await page.goto(`http://127.0.0.1:${PORT}/#/sales/room/${projectId}/${roomId}`);
  await page.waitForTimeout(400);
  const stored = await page.evaluate(
    ({ key, projectId, roomId }) => {
      const st = JSON.parse(localStorage.getItem(key) || "{}");
      const p = st.projects?.find((x) => x.id === projectId);
      const r = p?.rooms?.find((x) => x.id === roomId);
      return { area: r?.preliminary?.areaM2, amount: r?.preliminary?.amount };
    },
    { key: STORE_KEY, projectId, roomId }
  );
  check("room prelim area matches", Math.abs(stored.area - areaExpected) < 0.6, JSON.stringify(stored));
  check("room prelim amount matches draft", stored.amount === draftBeforeBind.amount, String(stored.amount));

  await reloadCalcIframe(page);
  const wallsAfter = await wallSurfacesChecked(page);
  check("GC10 reopen calc walls still off", wallsAfter === 0, String(wallsAfter));
}

const context = await chromium.launchPersistentContext("/tmp/gc9-e2e", {
  executablePath: "/usr/local/bin/google-chrome",
  headless: true,
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
  viewport: { width: 1280, height: 800 },
});
const page = await context.newPage();

await ensureServer();
await loginSales(page);

await page.goto(`http://127.0.0.1:${PORT}/#/tools/bind`);
const neg = await page.locator("#app").innerText();
check("GC10 negative bind blocked", neg.includes("Нет черновика") || neg.includes("Нужен Result"), "");

const saveDisabled = await page.locator('[data-action="calc-save-and-bind"]').count();
check("GC10 no save without calc", saveDisabled === 0, "bind-only view");

await loginSales(page);
await reloadCalcIframe(page);
const src = await page.locator("iframe.tool-frame").getAttribute("src");
check("calc iframe partner=1 walls=0", (src || "").includes("partner=1") && (src || "").includes("walls=0"), src || "");

const f = calcFrame(page);
await f.locator("#entryAreaBtn").click();
await f.locator("#areaOnlyInput").fill("21");
await runCalc(page);
await waitCalcDraft(page, 21);
const draft21 = await assertCeilingOnlyDraft(page, 21, "area");
check("GC9 area draft not 14 fixture", draft21.amount !== 47600 || draft21.answers.areaM2 === 21, "");
await bindAndReopen(page, 21, draft21);

await loginSales(page);
await reloadCalcIframe(page);
const f2 = calcFrame(page);
await f2.locator("#entryDimsBtn").click();
await f2.locator("#quickLength").fill("7");
await f2.locator("#quickWidth").fill("3");
await runCalc(page);
await waitCalcDraft(page, 21);
let draftDims = await assertCeilingOnlyDraft(page, 21, "dims 7×3");
check("GC10 dims panels ceiling-only", draftDims.calcPanels === CEILING_21_PANELS, String(draftDims.calcPanels));

await f2.locator("#quickLength").fill("7.2");
await runCalc(page);
await page.waitForTimeout(400);
await f2.locator("#quickLength").fill("7");
await runCalc(page);
await waitCalcDraft(page, 21);
draftDims = await assertCeilingOnlyDraft(page, 21, "dims after edit");
await bindAndReopen(page, 21, draftDims);

await loginSales(page);
await page.setViewportSize({ width: 1280, height: 800 });
await reloadCalcIframe(page);
const f3 = calcFrame(page);
await f3.locator("#entryDrawBtn").click();
await page.waitForTimeout(500);
await f3.getByRole("button", { name: /Шаблоны/ }).click();
await f3.getByRole("button", { name: "Г-форма", exact: true }).click();
await page.waitForTimeout(800);
await runCalc(page);
await page.waitForFunction(
  (key) => {
    const d = JSON.parse(localStorage.getItem(key) || "{}").sessionDraft;
    return d?.calcDone && d.amount > 0 && d.fromLiveCalc && d.calcInputMode === "draw";
  },
  STORE_KEY,
  { timeout: 25000 }
);
const drawDraft = await readSessionDraft(page);
const drawArea = Number(drawDraft.answers?.areaM2);
check("GC10 draw zero walls", (await wallSurfacesChecked(page)) === 0, "");
check("GC10 draw live payload", drawDraft.fromLiveCalc && drawDraft.amount > 0, JSON.stringify(drawDraft));
const drawPanelsExpected = Math.ceil(drawArea / PANEL_COVERAGE_M2);
const panelArea = drawDraft.calcPanels * PANEL_COVERAGE_M2;
check(
  "GC10 draw panels match posted area",
  Math.abs(panelArea - drawArea) / Math.max(drawArea, 1) < 0.12,
  `area ${drawArea} panels ${drawDraft.calcPanels} (~${panelArea.toFixed(1)} m²)`
);
await bindAndReopen(page, drawArea, drawDraft);

await context.close();

const failed = results.filter((r) => !r.ok);
console.log("\n===", `${results.filter((r) => r.ok).length}/${results.length}`, failed.length ? "FAILED" : "PASS", "===");
if (failed.length) {
  failed.forEach((f) => console.error(" -", f.name, f.detail));
  process.exit(1);
}
