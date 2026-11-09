/** Visual QA for KP HTML. Usage: npx tsx scripts/preview-kp.mts */
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { buildLocalDemoObjects, buildLocalDemoOrgs } from '../src/partner/demoSeed.ts';
import { buildKpModel } from '../src/partner/kp/kpModel.ts';
import { buildKpHtml } from '../src/partner/kp/kpHtml.ts';
import { PILLARS } from '../src/state/reportPdf.ts';
import { productAbout } from '../src/state/recommendations.ts';
import type { OrgSettings } from '../../../../packages/shared/partner.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const outDir = resolve('/workspace/handover/screenshots-kp');
mkdirSync(outDir, { recursive: true });

function logoDataUrl(name: string): string {
  const src = resolve(root, 'public', name).replace(/\\/g, '/');
  const py = `
from pathlib import Path
import io, base64, sys
from PIL import Image
im = Image.open(r"${src}").convert("RGBA")
px = im.load()
w, h = im.size
for y in range(h):
    for x in range(w):
        r,g,b,a = px[x,y]
        if a < 8: continue
        px[x,y] = (15, 28, 22, a)
buf = io.BytesIO()
im.save(buf, format="PNG")
sys.stdout.buffer.write(b"data:image/png;base64," + base64.b64encode(buf.getvalue()))
`;
  return execFileSync('python3', ['-c', py], { maxBuffer: 8 * 1024 * 1024 }).toString('utf8').trim();
}

function panelDataUrl(): string {
  const candidates = ['images/multiframe-panel-transparent.png'];
  for (const n of candidates) {
    try {
      const raw = readFileSync(resolve(root, 'public', n));
      const mime = n.endsWith('.jpg') ? 'image/jpeg' : 'image/png';
      return `data:${mime};base64,${raw.toString('base64')}`;
    } catch { /* next */ }
  }
  // 1x1 gray
  return 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAASAAAAECAYAAADsffnhAAAAD0lEQVR42mP8z8BQz0AEYBxVSF+FAB5uA/2+XqWwAAAAAElFTkSuQmCC';
}

const org = buildLocalDemoOrgs().find((o) => o.id === 'org_demo')!.settings as OrgSettings;
const all = buildLocalDemoObjects();
const chernov = all.filter((o) => o.id.startsWith('obj_a11'));
const oneRoom = [chernov[0]!];
const manager = { name: 'Елена Крылова', phone: '+7 900 123-45-67' };
const logos = { stp: logoDataUrl('logo-stp.png'), mf: logoDataUrl('logo-multiframe.png') };
const panel = panelDataUrl();
const qr = { result: null as string | null, site: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', calc: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==' };

async function makeQr() {
  const QRCode = (await import('qrcode')).default;
  const opts = { errorCorrectionLevel: 'L' as const, margin: 4, width: 360, color: { dark: '#0f1c16', light: '#ffffff' } };
  qr.site = await QRCode.toDataURL('https://stp-multiframe.ru', opts);
  qr.calc = await QRCode.toDataURL('https://stp-multiframe.ru/calculator', opts);
  qr.result = await QRCode.toDataURL('https://example.com/result', opts);
}

await makeQr();

function write(name: string, rooms: typeof chernov, projectId: string) {
  const project = { id: projectId, name: 'Чернов А.', clientName: 'Чернов А.', address: 'ул. Бауманская, 33', city: 'Москва' };
  const model = buildKpModel({ project, rooms, org, manager, demo: true, date: new Date('2026-11-09T12:00:00+03:00') });
  const about = model.effectAnswers ? [...productAbout(model.effectAnswers, 'mixed').paragraphs] : ['MultiFrame — система звукоизоляции.'];
  const html = buildKpHtml(model, { logos, panel, qr, pillars: PILLARS, about });
  const file = resolve(outDir, `${name}.html`);
  writeFileSync(file, html, 'utf8');
  console.log(file, 'number=', model.number, 'rooms=', rooms.length, 'demo=', model.demo);
  return file;
}

const f3 = write('after-chernov-3rooms', chernov, 'prj_chernov');
const f1 = write('after-one-room', oneRoom, 'prj_kitchen');
