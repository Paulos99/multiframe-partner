#!/usr/bin/env node
/**
 * Capture visual-baseline-1 screenshots (desktop 1440 + mobile 390).
 * Requires: npm install in this folder (playwright-core).
 */
import { createServer } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const mediaDir = path.join(__dirname, "media");
const port = 8766;

function mime(p) {
  if (p.endsWith(".css")) return "text/css";
  if (p.endsWith(".js")) return "text/javascript";
  if (p.endsWith(".png")) return "image/png";
  if (p.endsWith(".html")) return "text/html";
  return "application/octet-stream";
}

function startServer() {
  return new Promise((resolve) => {
    const srv = createServer((req, res) => {
      const url = new URL(req.url || "/", `http://127.0.0.1:${port}`);
      let fp = path.join(__dirname, decodeURIComponent(url.pathname.replace(/^\//, "")) || "index.html");
      if (!existsSync(fp) || fp.includes("..")) fp = path.join(__dirname, "index.html");
      res.writeHead(200, { "Content-Type": mime(fp) });
      res.end(readFileSync(fp));
    });
    srv.listen(port, "127.0.0.1", () => resolve(srv));
  });
}

async function shot(page, name, w, h, hash) {
  await page.setViewportSize({ width: w, height: h });
  await page.goto(`http://127.0.0.1:${port}/#${hash}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(400);
  const out = path.join(mediaDir, name);
  await page.screenshot({ path: out, fullPage: false });
  console.log("wrote", out);
}

const srv = await startServer();
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();

await page.goto(`http://127.0.0.1:${port}/#/login`);
await page.click('[data-action="login"][data-role="sales"]');
await page.waitForTimeout(300);

const shots = [
  ["visual-baseline-1-sales-home-desktop.png", 1440, 900, "/sales/home"],
  ["visual-baseline-1-sales-home-mobile.png", 390, 844, "/sales/home"],
  ["visual-baseline-1-room-empty-desktop.png", 1440, 900, "/sales/room/prj_nv_soroka/room_sor_living"],
  ["visual-baseline-1-room-empty-mobile.png", 390, 844, "/sales/room/prj_nv_soroka/room_sor_living"],
  ["visual-baseline-1-room-filled-desktop.png", 1440, 900, "/sales/room/prj_nv_soroka/room_sor_bedroom"],
  ["visual-baseline-1-room-filled-mobile.png", 390, 844, "/sales/room/prj_nv_soroka/room_sor_bedroom"],
  ["visual-baseline-1-tools-hub-desktop.png", 1440, 900, "/tools/hub"],
];

for (const [name, w, h, hash] of shots) {
  await shot(page, name, w, h, hash);
}

await browser.close();
srv.close();
