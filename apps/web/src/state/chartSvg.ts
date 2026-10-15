/** Inline SVG for PDF/HTML reports — dashboard-quality spectrum charts. */
import type { SpectrumSeries } from './types';

type Pt = { x: number; y: number };

function xAt(hz: number, hzMin: number, hzMax: number, x0: number, w: number): number {
  const t =
    (Math.log10(hz) - Math.log10(hzMin)) / Math.max(1e-6, Math.log10(hzMax) - Math.log10(hzMin));
  return x0 + t * w;
}

function yAt(v: number, yMin: number, yMax: number, y0: number, h: number): number {
  const t = (v - yMin) / Math.max(1e-6, yMax - yMin);
  return y0 + h - t * h;
}

function niceRange(min: number, max: number): { yMin: number; yMax: number; ticks: number[] } {
  const lo = Math.floor(min / 10) * 10;
  const hiRaw = Math.ceil(max / 10) * 10;
  const span = Math.max(10, hiRaw - lo);
  const step = span > 40 ? 20 : 10;
  const steps = Math.max(2, Math.ceil((hiRaw - lo) / step));
  const hi = lo + steps * step;
  const ticks = Array.from({ length: steps + 1 }, (_, i) => lo + i * step);
  return { yMin: lo, yMax: hi, ticks };
}

function formatHz(hz: number): string {
  if (hz >= 1000) {
    const k = hz / 1000;
    return Number.isInteger(k) ? `${k}k` : `${k.toFixed(1)}k`;
  }
  return String(Math.round(hz));
}

function toPts(
  hz: readonly number[],
  values: number[],
  x0: number,
  y0: number,
  w: number,
  h: number,
  yMin: number,
  yMax: number,
): Pt[] {
  const hzMin = hz[0] ?? 100;
  const hzMax = hz[hz.length - 1] ?? 5000;
  return values.map((v, i) => ({
    x: xAt(hz[i] ?? hzMin, hzMin, hzMax, x0, w),
    y: yAt(v, yMin, yMax, y0, h),
  }));
}

/** Catmull-Rom → cubic Bezier (same as SpectrumChart). */
function smoothPath(pts: Pt[]): string {
  if (!pts.length) return '';
  if (pts.length === 1) return `M${pts[0]!.x.toFixed(1)},${pts[0]!.y.toFixed(1)}`;
  let d = `M${pts[0]!.x.toFixed(1)},${pts[0]!.y.toFixed(1)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i]!;
    const p1 = pts[i]!;
    const p2 = pts[i + 1]!;
    const p3 = pts[i + 2] ?? p2;
    const c1x = p1.x + (p2.x - p0.x) / 6;
    const c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6;
    const c2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C${c1x.toFixed(1)},${c1y.toFixed(1)} ${c2x.toFixed(1)},${c2y.toFixed(1)} ${p2.x.toFixed(1)},${p2.y.toFixed(1)}`;
  }
  return d;
}

function areaUnder(pts: Pt[], yBase: number): string {
  if (!pts.length) return '';
  const first = pts[0]!;
  const last = pts[pts.length - 1]!;
  return `${smoothPath(pts)} L${last.x.toFixed(1)},${yBase.toFixed(1)} L${first.x.toFixed(1)},${yBase.toFixed(1)} Z`;
}

function gainBand(beforePts: Pt[], afterPts: Pt[]): string {
  if (!beforePts.length || !afterPts.length) return '';
  const beforeRev = [...beforePts].reverse();
  return `M${afterPts.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' L')} L${beforeRev
    .map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`)
    .join(' L')} Z`;
}

export function spectrumChartSvg(
  series: SpectrumSeries,
  opts: {
    title: string;
    subtitle: string;
    indexKind: 'Rw' | 'Lnw';
    indexBefore: number;
    indexAfter: number;
    quieterPct?: number;
    /** SVG canvas height in user units (default 280). */
    height?: number;
  },
): string {
  const padL = 42;
  const padR = 14;
  const padT = 16;
  const padB = 30;
  const W = 700;
  const H = opts.height ?? 280;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;
  const all = [...series.before, ...series.after];
  const { yMin, yMax, ticks } = niceRange(Math.min(...all), Math.max(...all));
  const hzMin = series.hz[0] ?? 100;
  const hzMax = series.hz[series.hz.length - 1] ?? 5000;
  const beforePts = toPts(series.hz, series.before, padL, padT, plotW, plotH, yMin, yMax);
  const afterPts = toPts(series.hz, series.after, padL, padT, plotW, plotH, yMin, yMax);
  const beforePath = smoothPath(beforePts);
  const afterPath = smoothPath(afterPts);
  const fillPath = areaUnder(afterPts, padT + plotH);
  const band = gainBand(beforePts, afterPts);
  const xLabels = [100, 250, 500, 1000, 2000, 5000];
  const gradId = `af-${opts.indexKind}-${Math.round(opts.indexAfter)}`;

  const grid = ticks
    .map((tick) => {
      const y = yAt(tick, yMin, yMax, padT, plotH);
      return `<line x1="${padL}" x2="${W - padR}" y1="${y}" y2="${y}" stroke="#e4ebe7" stroke-width="1"/>
        <text x="${padL - 8}" y="${y + 3.5}" text-anchor="end" fill="#68757e" font-size="11" font-weight="600" font-family="Segoe UI, system-ui, sans-serif">${tick}</text>`;
    })
    .join('');

  const xTicks = xLabels
    .map((hz) => {
      const x = xAt(hz, hzMin, hzMax, padL, plotW);
      return `<text x="${x}" y="${H - 8}" text-anchor="middle" fill="#68757e" font-size="11" font-weight="600" font-family="Segoe UI, system-ui, sans-serif">${formatHz(hz)}</text>`;
    })
    .join('');

  const quieter =
    opts.quieterPct != null && opts.quieterPct > 0
      ? (() => {
          const text = `−${opts.quieterPct}%`;
          const fontSize = 10;
          const padX = 8;
          const height = 20;
          const width = Math.max(36, Math.ceil(text.length * fontSize * 0.72 + padX * 2));
          const radius = height / 2;
          return `<svg class="pill-svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><rect width="${width}" height="${height}" rx="${radius}" ry="${radius}" fill="#dceee8"/><text x="${(width / 2).toFixed(1)}" y="${(height / 2).toFixed(1)}" text-anchor="middle" dominant-baseline="central" fill="#01644f" font-size="${fontSize}" font-weight="750" font-family="Segoe UI, system-ui, sans-serif">${text}</text></svg>`;
        })()
      : '';

  return `<figure class="chart">
  <figcaption>
    <div>
      <strong>${opts.title}</strong>
      <span>${opts.subtitle}</span>
    </div>
    <div class="badge">
      <b>${opts.indexKind}</b>
      <span class="badge-nums">${Math.round(opts.indexBefore)} → ${Math.round(opts.indexAfter)}</span>
      ${quieter}
    </div>
  </figcaption>
  <svg viewBox="0 0 ${W} ${H}" width="100%" xmlns="http://www.w3.org/2000/svg" role="img">
    <defs>
      <linearGradient id="${gradId}" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#01644f" stop-opacity="0.32"/>
        <stop offset="100%" stop-color="#01644f" stop-opacity="0.03"/>
      </linearGradient>
    </defs>
    ${grid}
    ${xTicks}
    <text x="13" y="${padT + plotH / 2}" fill="#68757e" font-size="11" font-weight="650" text-anchor="middle" font-family="Segoe UI, system-ui, sans-serif" transform="rotate(-90 13 ${padT + plotH / 2})">дБ</text>
    <path d="${fillPath}" fill="url(#${gradId})"/>
    <path d="${band}" fill="#01644f" opacity="0.12"/>
    <path d="${beforePath}" fill="none" stroke="#7a8790" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round"/>
    <path d="${afterPath}" fill="none" stroke="#01644f" stroke-width="2.7" stroke-linejoin="round" stroke-linecap="round"/>
  </svg>
  <ul class="legend"><li><i class="sw-b"></i>Сейчас</li><li><i class="sw-a"></i>MultiFrame</li></ul>
</figure>`;
}

/** Compact SVG comfort ring for PDF KPI cards. */
export function comfortRingSvg(pct: number, label: string, accent: boolean): string {
  const clamped = Math.max(0, Math.min(100, Math.round(pct)));
  const size = 92;
  const r = 36;
  const c = 2 * Math.PI * r;
  const offset = c * (1 - clamped / 100);
  const stroke = accent ? '#01644f' : '#7a8790';
  const color = accent ? '#01644f' : '#152018';
  const mid = size / 2;
  return `<div class="ring">
    <svg viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
      <circle cx="${mid}" cy="${mid}" r="${r}" fill="none" stroke="#e1e8e4" stroke-width="8"/>
      <circle cx="${mid}" cy="${mid}" r="${r}" fill="none" stroke="${stroke}" stroke-width="8" stroke-linecap="round"
        stroke-dasharray="${c.toFixed(2)}" stroke-dashoffset="${offset.toFixed(2)}"
        transform="rotate(-90 ${mid} ${mid})"/>
    </svg>
    <div class="ring-center" style="color:${color}"><b>${clamped}%</b><span>${label}</span></div>
  </div>`;
}
