#!/usr/bin/env node
/**
 * Capture production + prototype visual baseline @ 1440 and 390.
 * Waits for real UI (no skeleton) before screenshots.
 */
import { chromium } from "playwright-core";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { spawn } from "child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outRepo = path.join(__dirname, "media/visual-baseline");
const outStore = "/cursor/stores/bc-4e5fdec0-03d5-44d5-95da-9adbe9fb08b4/media/visual-baseline";
const PROD = "https://paulos99.github.io/multiframe-partner/?demo=1";

for (const d of [outRepo, outStore]) fs.mkdirSync(d, { recursive: true });

function copyPair(name) {
  fs.copyFileSync(path.join(outRepo, name), path.join(outStore, name));
}

/** Reject empty / skeleton captures (mostly flat gray). */
function assertPngHasContent(file) {
  const buf = fs.readFileSync(path.join(outRepo, file));
  if (buf.length < 25_000) {
    throw new Error(`Capture too small (skeleton?): ${file} (${buf.length} bytes)`);
  }
  const sample = buf.subarray(0, Math.min(buf.length, 8000));
  let unique = new Set();
  for (let i = 0; i < sample.length; i += 47) unique.add(sample[i]);
  if (unique.size < 12) {
    throw new Error(`Capture looks flat/blank: ${file}`);
  }
}

async function waitForProductionCabinet(page) {
  await page.waitForFunction(
    () => {
      const t = document.body?.innerText || "";
      const hasNav = /Сделки\s*·|Инструменты|Обучение|Сотрудники/i.test(t);
      const hasWork =
        /Сегодня в работе|Сформировать КП|Новый объект|ул\.|Объекты/i.test(t);
      return hasNav && hasWork && t.length > 900;
    },
    { timeout: 90000 }
  );
  await page.waitForTimeout(600);
}

async function waitForPrototypeBaseline(page) {
  await page.waitForSelector(".mf-cab-frame", { timeout: 30000 });
  await page.waitForFunction(
    () => {
      const t = document.body?.innerText || "";
      return (
        document.querySelector(".mf-cab-brand img.mf") &&
        /Сегодня в работе|С чего начать|mf-hint-card/i.test(document.body.innerHTML) &&
        /Сегодня в работе|С чего начать|Неболайн|Сорокин/i.test(t) &&
        t.length > 200
      );
    },
    { timeout: 30000 }
  );
  await page.waitForTimeout(400);
}

async function captureViewport(page, file, w, h, { ready } = {}) {
  await page.setViewportSize({ width: w, height: h });
  if (ready === "production") await waitForProductionCabinet(page);
  if (ready === "prototype") await waitForPrototypeBaseline(page);
  await page.screenshot({ path: path.join(outRepo, file), fullPage: false });
  assertPngHasContent(file);
  copyPair(file);
  console.log("ok", file, w);
}

async function gotoPrototype(page, protoBase, hash) {
  const url = `${protoBase}#${hash}`;
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForFunction(() => window.MFStore && MFStore.get().role === "sales", {
    timeout: 15000,
  });
}

async function loginSalesDemo(page) {
  await page.goto(PROD, { waitUntil: "domcontentloaded", timeout: 90000 });
  const salesBtn = page
    .locator("button")
    .filter({ hasText: "Менеджер" })
    .filter({ hasText: "Сделки" })
    .first();
  await salesBtn.waitFor({ state: "visible", timeout: 30000 });
  await salesBtn.click();
  await waitForProductionCabinet(page);
}

async function sideBySide(page, leftFile, rightFile, outFile, w, h) {
  const left = fs.readFileSync(path.join(outRepo, leftFile)).toString("base64");
  const right = fs.readFileSync(path.join(outRepo, rightFile)).toString("base64");
  const html = `<!DOCTYPE html><html><body style="margin:0;display:flex;background:#111">
    <img src="data:image/png;base64,${left}" style="width:50%;height:100vh;object-fit:cover;object-position:top left"/>
    <img src="data:image/png;base64,${right}" style="width:50%;height:100vh;object-fit:cover;object-position:top left"/>
  </body></html>`;
  await page.setViewportSize({ width: w, height: h });
  await page.setContent(html);
  await page.screenshot({ path: path.join(outRepo, outFile), fullPage: false });
  assertPngHasContent(outFile);
  copyPair(outFile);
  console.log("ok", outFile);
}

async function main() {
  const server = spawn("python3", ["-m", "http.server", "8765", "--directory", __dirname], {
    stdio: "ignore",
  });
  await new Promise((r) => setTimeout(r, 800));

  const context = await chromium.launchPersistentContext(`/tmp/vb-capture-${Date.now()}`, {
    executablePath: "/usr/local/bin/google-chrome",
    headless: true,
    viewport: { width: 1440, height: 900 },
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });
  const page = context.pages()[0] || (await context.newPage());

  try {
    await loginSalesDemo(page);
    await captureViewport(page, "original-sales-home-1440.png", 1440, 900, {
      ready: "production",
    });
    await captureViewport(page, "original-sales-home-390.png", 390, 844, {
      ready: "production",
    });

    const protoBase = "http://127.0.0.1:8765/index.html";
    await page.goto(`${protoBase}#/login`, { waitUntil: "domcontentloaded" });
    await page.evaluate(() => {
      localStorage.clear();
      if (window.MFStore) MFStore.setRole("sales");
    });

    const protoRoutes = [
      ["prototype-sales-home-1440.png", "/sales/home", 1440, 900],
      ["prototype-sales-home-390.png", "/sales/home", 390, 844],
      ["prototype-room-empty-1440.png", "/sales/room/prj_nv_soroka/room_sor_living", 1440, 900],
      ["prototype-room-empty-390.png", "/sales/room/prj_nv_soroka/room_sor_living", 390, 844],
      ["prototype-room-filled-1440.png", "/sales/room/prj_nv_soroka/room_sor_bedroom", 1440, 900],
      ["prototype-room-filled-390.png", "/sales/room/prj_nv_soroka/room_sor_bedroom", 390, 844],
      ["prototype-tool-calc-1440.png", "/sales/tool/calc/prj_nv_soroka/room_sor_living", 1440, 900],
      ["prototype-tool-calc-390.png", "/sales/tool/calc/prj_nv_soroka/room_sor_living", 390, 844],
    ];
    for (const [file, hash, w, h] of protoRoutes) {
      await gotoPrototype(page, protoBase, hash);
      const ready = hash.includes("/room/") || hash.includes("/tool/")
        ? undefined
        : "prototype";
      if (hash.includes("/room/")) {
        await page.waitForSelector(".mf-cab-frame", { timeout: 20000 });
        await page.waitForTimeout(500);
      }
      if (hash.includes("/tool/")) {
        await page.waitForSelector(".mf-cab--tool", { timeout: 20000 });
        await page.waitForTimeout(800);
      }
      await captureViewport(page, file, w, h, { ready });
    }

    await sideBySide(
      page,
      "original-sales-home-1440.png",
      "prototype-sales-home-1440.png",
      "compare-sales-home-1440.png",
      1440,
      900
    );
    await sideBySide(
      page,
      "original-sales-home-390.png",
      "prototype-sales-home-390.png",
      "compare-sales-home-390.png",
      390,
      844
    );
    await sideBySide(
      page,
      "original-sales-home-1440.png",
      "prototype-room-empty-1440.png",
      "compare-room-empty-1440.png",
      1440,
      900
    );
    await sideBySide(
      page,
      "original-sales-home-1440.png",
      "prototype-room-filled-1440.png",
      "compare-room-filled-1440.png",
      1440,
      900
    );
    await sideBySide(
      page,
      "original-sales-home-1440.png",
      "prototype-tool-calc-1440.png",
      "compare-tool-calc-1440.png",
      1440,
      900
    );
  } finally {
    await context.close();
    server.kill();
  }

  console.log("Saved to", outRepo, "and", outStore);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
