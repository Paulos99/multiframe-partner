/**
 * Writes a sample acoustic-profile HTML (same as PDF pages) for visual QA.
 * Usage: npx tsx scripts/preview-pdf.mts
 */
import { execFileSync } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createInitialSession, withDerived } from '../src/state/session.ts';
import { buildAcousticProfileHtml } from '../src/state/reportPdf.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const outDir = resolve(root, 'tmp');
const outFile = resolve(outDir, 'pdf-preview.html');

/** Bake site light-header look: brightness(0) on near-white logo PNGs. */
function logoDataUrl(name: string): string {
  const src = resolve(root, 'public', name).replace(/\\/g, '/');
  const py = `
from pathlib import Path
import io, base64, sys
try:
    from PIL import Image
except ImportError:
    raw = Path(r"${src}").read_bytes()
    sys.stdout.buffer.write(b"data:image/png;base64," + base64.b64encode(raw))
    raise SystemExit
im = Image.open(r"${src}").convert("RGBA")
px = im.load()
w, h = im.size
for y in range(h):
    for x in range(w):
        r,g,b,a = px[x,y]
        if a < 8: continue
        px[x,y] = (0,0,0,a)
buf = io.BytesIO()
im.save(buf, format="PNG")
sys.stdout.buffer.write(b"data:image/png;base64," + base64.b64encode(buf.getvalue()))
`;
  return execFileSync('python', ['-c', py], { maxBuffer: 8 * 1024 * 1024 })
    .toString('utf8')
    .trim();
}

const logos = {
  stp: logoDataUrl('logo-stp.png'),
  mf: logoDataUrl('logo-multiframe.png'),
};

const base = createInitialSession();
const session = withDerived({
  ...base,
  step: 'result',
  answers: {
    ...base.answers,
    room: {
      ...base.answers.room,
      slabType: 'wood',
      slabThickness: 'about_160_200',
      floorAbove: 'ordinary',
      houseType: 'wood',
      objectStage: 'renovation',
      plannedCeiling: 'stretch_planned',
      noisyNeighbors: 'sometimes_noisy',
      roomType: 'kids',
      ceilingAreaM2: 22,
      roomWish: 'general',
    },
  },
});

const html = await buildAcousticProfileHtml(session, logos);
mkdirSync(outDir, { recursive: true });
writeFileSync(outFile, html, 'utf8');
console.log(outFile);
