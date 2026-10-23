#!/usr/bin/env node
/**
 * Capture production + prototype visual baseline @ 1440 and 390.
 * Usage: node capture-visual-baseline.mjs
 */
import { chromium } from "playwright-core";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { spawn } from "child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outRepo = path.join(__dirname, "media/visual-baseline");
const outStore = "/cursor/stores/bc-4e5fdec0-03d5-44d5-95da-9adbe9fb08b4/media/visual-baseline";

for (const d of [outRepo, outStore]) fs.mkdirSync(d, { recursive: true });

function copyPair(name) {
  fs.copyFileSync(path.join(outRepo, name), path.join(outStore, name));
}

async function shot(page, file, url, w, h, waitMs = 800) {
  await page.setViewportSize({ width: w, height: h });
  await page.goto(url, { waitUntil: "networkidle", timeout: 120000 });
  await page.waitForTimeout(waitMs);
  await page.screenshot({ path: path.join(outRepo, file), fullPage: false });
  copyPair(file);
}

async function loginSalesDemo(page) {
  await page.goto("https://paulos99.github.io/multiframe-partner/?demo=1", {
    waitUntil: "networkidle",
    timeout: 120000,
  });
  const salesBtn = page.locator("button").filter({ hasText: /Менеджер|Продаж|sales1/i }).first();
  await salesBtn.click({ timeout: 30000 });
  await page.waitForTimeout(2500);
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
  await page.screenshot({ path: path.join(outRepo, outFile) });
  copyPair(outFile);
}

async function main() {
  const server = spawn("python3", ["-m", "http.server", "8765", "--directory", __dirname], {
    stdio: "ignore",
  });
  await new Promise((r) => setTimeout(r, 600));

  const context = await chromium.launchPersistentContext(`/tmp/vb-capture-${Date.now()}`, {
    executablePath: "/usr/local/bin/google-chrome",
    headless: true,
    viewport: { width: 1440, height: 900 },
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });
  const page = context.pages()[0] || (await context.newPage());

  try {
    await loginSalesDemo(page);
    await shot(page, "original-sales-home-1440.png", page.url(), 1440, 900, 1200);
    await shot(page, "original-sales-home-390.png", page.url(), 390, 844, 800);

    const protoBase = "http://127.0.0.1:8765/index.html";
    await page.goto(`${protoBase}#/login`, { waitUntil: "networkidle" });
    await page.evaluate(() => {
      localStorage.clear();
      if (window.MFStore) MFStore.setRole("sales");
    });

    const protoShots = [
      ["prototype-sales-home-1440.png", `${protoBase}#/sales/home`, 1440, 900],
      ["prototype-sales-home-390.png", `${protoBase}#/sales/home`, 390, 844],
      [
        "prototype-room-empty-1440.png",
        `${protoBase}#/sales/room/prj_nv_soroka/room_sor_living`,
        1440,
        900,
      ],
      [
        "prototype-room-empty-390.png",
        `${protoBase}#/sales/room/prj_nv_soroka/room_sor_living`,
        390,
        844,
      ],
      [
        "prototype-room-filled-1440.png",
        `${protoBase}#/sales/room/prj_nv_soroka/room_sor_bedroom`,
        1440,
        900,
      ],
      [
        "prototype-room-filled-390.png",
        `${protoBase}#/sales/room/prj_nv_soroka/room_sor_bedroom`,
        390,
        844,
      ],
      [
        "prototype-tool-calc-1440.png",
        `${protoBase}#/sales/tool/calc/prj_nv_soroka/room_sor_living`,
        1440,
        900,
      ],
      [
        "prototype-tool-calc-390.png",
        `${protoBase}#/sales/tool/calc/prj_nv_soroka/room_sor_living`,
        390,
        844,
      ],
    ];
    for (const [file, url, w, h] of protoShots) {
      await shot(page, file, url, w, h, w < 500 ? 700 : 900);
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
