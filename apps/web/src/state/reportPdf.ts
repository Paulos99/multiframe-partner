/**
 * Acoustic profile PDF — multi-page A4, dashboard-styled (not a Word dump).
 */
import QRCode from 'qrcode';
import {
  CALCULATOR_URL,
  HOUSE_TYPE_OPTIONS,
  NOISE_KIND_OPTIONS,
  NOISY_NEIGHBORS_OPTIONS,
  roomTypeLabel,
  SLAB_THICKNESS_OPTIONS,
  SLAB_TYPE_OPTIONS,
  shouldAskNoiseKind,
  type SessionState,
} from './types';
import { caseVerdictParts, productAbout } from './recommendations';
import {
  airClassFor,
  airFeltFromIndex,
  CLASS_CYR,
  comfortClassFor,
  FELT_STEP_LABELS,
  impactClassFor,
  impactFeltFromIndex,
  NORMS,
  officialComfortLabel,
} from './simulation';
import { noiseKpiLines } from './noiseKpi';
import { buildLeadHandoff, withDerived } from './session';
import { buildAirSpectrum, buildImpactSpectrum } from './spectrum';
import { comfortRingSvg, spectrumChartSvg } from './chartSvg';
import { type OrgSettings } from '../../../../packages/shared/partner';
import { buildEstimateFromOrg, formatRub } from '../partner/estimate';

/** Keep in sync with ResultWideScreen — hide frequency page until clients ask. */
const SHOW_FREQUENCY_CHARTS = false;
import {
  buildShareClipboardText,
  buildShareUrl,
  SHARE_MARKETING_BLURB,
} from './shareLink';
import type { ClassLabel } from './types';

/** A4 @ 96 CSS px */
const PAGE_W = 794;
const PAGE_H = 1123;

const SITE_URL = 'https://stp-multiframe.ru';

const PILLARS = [
  {
    title: 'Звукоизоляция и акустический комфорт',
    text: 'Снижает шум сверху и поглощает звук в комнате — меньше эха, спокойнее пространство.',
  },
  {
    title: 'Безопасность',
    text: 'Материалы безопасны для жилых помещений: спальня, детская, кухня и ванная.',
  },
  {
    title: 'Экологичность',
    text: 'Без минеральной ваты и строительной пыли на объекте.',
  },
  {
    title: 'Быстрый монтаж',
    text: 'Сначала панели, затем натяжное полотно — без долгой стройки.',
  },
  {
    title: 'Универсальность',
    text: 'Подходит к любому типу перекрытия на любой стадии ремонта.',
  },
] as const;

type QrBundle = { site: string; calc: string; share?: string };
type LogoBundle = { stp: string; mf: string };
type ReportAssets = { qr: QrBundle; logos: LogoBundle; panel: string };

function optLabel<T extends string>(
  options: { id: T; label: string }[],
  id: T | undefined,
): string {
  if (!id) return 'не указано';
  return options.find((o) => o.id === id)?.label ?? 'не указано';
}

function chipLabel(cls: ClassLabel): string {
  if (cls === 'below') return 'вне нормы';
  return CLASS_CYR[cls];
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatDateRu(d = new Date()): string {
  return d.toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

async function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('Не удалось прочитать логотип'));
    reader.readAsDataURL(blob);
  });
}

async function fetchDataUrl(url: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Не удалось загрузить ${url}`);
  return blobToDataUrl(await res.blob());
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Логотип не загрузился'));
    img.src = src;
  });
}

/** Match site light-header look: `filter: brightness(0)` baked into pixels. */
export async function darkenLogoDataUrl(src: string): Promise<string> {
  const img = await loadImage(src);
  const canvas = document.createElement('canvas');
  canvas.width = img.naturalWidth || img.width;
  canvas.height = img.naturalHeight || img.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return src;
  ctx.drawImage(img, 0, 0);
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const px = data.data;
  for (let i = 0; i < px.length; i += 4) {
    if ((px[i + 3] ?? 0) < 8) continue;
    px[i] = 0;
    px[i + 1] = 0;
    px[i + 2] = 0;
  }
  ctx.putImageData(data, 0, 0);
  return canvas.toDataURL('image/png');
}

/** Site logos from /public — darkened data URLs for iframe/html2canvas. */
export async function buildLogoBundle(logos?: LogoBundle): Promise<LogoBundle> {
  if (logos?.stp && logos?.mf) {
    if (typeof document === 'undefined') return logos;
    const [stp, mf] = await Promise.all([
      darkenLogoDataUrl(logos.stp),
      darkenLogoDataUrl(logos.mf),
    ]);
    return { stp, mf };
  }
  const base = new URL(import.meta.env.BASE_URL || '/', window.location.href);
  const [rawStp, rawMf] = await Promise.all([
    fetchDataUrl(new URL('logo-stp.png', base).href),
    fetchDataUrl(new URL('logo-multiframe.png', base).href),
  ]);
  const [stp, mf] = await Promise.all([
    darkenLogoDataUrl(rawStp),
    darkenLogoDataUrl(rawMf),
  ]);
  return { stp, mf };
}

/** SVG pill — html2canvas paints these without the CSS border-radius drift. */
function pillSvg(
  text: string,
  opts: { bg: string; fg: string; fontSize?: number; padX?: number; height?: number },
): string {
  const fontSize = opts.fontSize ?? 10;
  const padX = opts.padX ?? 10;
  const height = opts.height ?? 22;
  const width = Math.max(36, Math.ceil(text.length * fontSize * 0.72 + padX * 2));
  const radius = height / 2;
  return `<svg class="pill-svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <rect width="${width}" height="${height}" rx="${radius}" ry="${radius}" fill="${opts.bg}"/>
  <text x="${(width / 2).toFixed(1)}" y="${(height / 2).toFixed(1)}" text-anchor="middle" dominant-baseline="central" fill="${opts.fg}" font-size="${fontSize}" font-weight="750" font-family="Segoe UI, system-ui, sans-serif">${escapeHtml(text)}</text>
</svg>`;
}

async function buildQrBundle(shareUrl?: string | null): Promise<QrBundle> {
  const opts = {
    width: 160,
    margin: 1,
    color: { dark: '#0c332c', light: '#ffffff' },
    errorCorrectionLevel: 'M' as const,
  };
  // Ссылка клиента длиннее: QR крупнее и с запасом на помарки печати, чтобы телефон читал его с листа.
  const shareOpts = { ...opts, width: 400, margin: 2, errorCorrectionLevel: 'Q' as const };
  const [site, calc, share] = await Promise.all([
    QRCode.toDataURL(SITE_URL, opts),
    QRCode.toDataURL(CALCULATOR_URL, opts),
    shareUrl ? QRCode.toDataURL(shareUrl, shareOpts) : Promise.resolve(undefined),
  ]);
  return { site, calc, share };
}

function pageChrome(
  page: number,
  total: number,
  roomLine: string,
  logos: LogoBundle,
): string {
  return `
  <div class="page-top">
    <div class="brand-row">
      <div class="brand-lockup">
        <img class="logo-stp" src="${logos.stp}" alt="StP" width="40" height="40" />
        <img class="logo-mf" src="${logos.mf}" alt="MultiFrame" height="26" />
        <span class="brand-sub">Проблемомер</span>
      </div>
      ${pillSvg('Акустический профиль', { bg: '#dceee8', fg: '#01644f', fontSize: 11, padX: 12, height: 26 })}
    </div>
    <div class="meta-row">
      <span>${escapeHtml(roomLine)}</span>
      <span>${escapeHtml(formatDateRu())}</span>
    </div>
  </div>
  <div class="page-bottom">
    <span>stp-multiframe.ru · экспертная оценка, не инженерный расчёт</span>
    <span>${page} / ${total}</span>
  </div>`;
}

function buildReportDocument(
  session: SessionState,
  assets: ReportAssets,
  opts: { hidePrices?: boolean; shareUrl?: string | null } = {},
): string {
  const { qr, logos, panel } = assets;
  const handoff = buildLeadHandoff(session);
  const room = handoff.room;
  const sim = session.derived!.simulation;
  const rev = sim.reverb;
  const b = sim.before;
  const a = sim.after;
  const hybridBefore = comfortClassFor(b.Rw, b.Lnw);
  const hybridAfter = comfortClassFor(a.Rw, a.Lnw);
  const roomName = roomTypeLabel(room);
  const area = room.ceilingAreaM2 != null ? `${room.ceilingAreaM2} м²` : 'н/д';
  const roomLine = `${roomName} · ${area}`;
  const slabTypeLabel = optLabel(SLAB_TYPE_OPTIONS, room.slabType);
  const slabLabel =
    !room.slabThickness || room.slabThickness === 'unknown'
      ? room.slabType === 'unknown'
        ? 'типовая ~220 мм'
        : `${slabTypeLabel}, типовая ~220 мм`
      : `${slabTypeLabel}, ${optLabel(SLAB_THICKNESS_OPTIONS, room.slabThickness)}`;

  const airNow = airFeltFromIndex(b.Rw);
  const airAfter = airFeltFromIndex(a.Rw);
  const impactNow = impactFeltFromIndex(b.Lnw);
  const impactAfter = impactFeltFromIndex(a.Lnw);
  const noiseType = session.derived?.noiseType ?? 'mixed';
  const verdictHtml = caseVerdictParts(room, noiseType, {
    perceivedAirPct: sim.perceivedAirPct,
    perceivedImpactPct: sim.perceivedImpactPct,
  })
    .map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`)
    .join('');
  const about = productAbout(room, noiseType, { airDb: sim.delta.Rw, impactDb: sim.delta.Lnw });
  const productHtml = about.paragraphs.map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`).join('');
  const airSeries = buildAirSpectrum(session.answers);
  const impactSeries = buildImpactSpectrum(session.answers);

  const deltaRw = Math.abs(Math.round(sim.delta.Rw));
  const deltaLnw = Math.abs(Math.round(sim.delta.Lnw));
  const airKpi = noiseKpiLines('air', b.Rw, a.Rw, sim.perceivedAirPct);
  const impactKpi = noiseKpiLines('impact', b.Lnw, a.Lnw, sim.perceivedImpactPct);
  const noiseKindCell =
    shouldAskNoiseKind(room.noisyNeighbors) && room.noiseKind !== 'unknown'
      ? `<div><dt>Тип шума</dt><dd>${escapeHtml(optLabel(NOISE_KIND_OPTIONS, room.noiseKind))}</dd></div>`
      : '';
  const neighborsCell =
    room.noisyNeighbors !== 'unknown'
      ? `<div><dt>Шум сверху</dt><dd>${escapeHtml(optLabel(NOISY_NEIGHBORS_OPTIONS, room.noisyNeighbors))}</dd></div>`
      : '';
  const recProductHtml = `<section class="rec-product">
          <aside class="recs">
            <h2>Рекомендации:</h2>
            <div class="rec-copy">${verdictHtml}</div>
          </aside>
          <aside class="product">
            <h2>Что такое MultiFrame</h2>
            <div class="product-body">
              <img src="${panel}" alt="Панель MultiFrame" />
              <div class="product-copy">
                ${about.claim ? `<strong>${escapeHtml(about.claim)}</strong>` : ''}
                ${productHtml}
              </div>
            </div>
          </aside>
        </section>`;
  const comfortBefore = Math.max(0, Math.min(100, 100 - rev.echoInRoomBefore));
  const comfortAfter = Math.max(0, Math.min(100, 100 - rev.echoInRoomAfter));
  const echoDrop = Math.max(0, rev.echoInRoomBefore - rev.echoInRoomAfter);

  const airSvg = spectrumChartSvg(airSeries, {
    title: 'Воздушный шум (голоса и музыка)',
    subtitle: 'изоляция от голосов и музыки сверху',
    indexKind: 'Rw',
    indexBefore: b.Rw,
    indexAfter: a.Rw,
    quieterPct: sim.perceivedAirPct,
    height: 268,
  });
  const impactSvg = spectrumChartSvg(impactSeries, {
    title: 'Ударный шум (шаги и падения)',
    subtitle: 'изоляция от шагов и падений',
    indexKind: 'Lnw',
    indexBefore: b.Lnw,
    indexAfter: a.Lnw,
    quieterPct: sim.perceivedImpactPct,
    height: 268,
  });

  const pillars = PILLARS.map(
    (p) =>
      `<li class="pillar"><span class="pillar-mark"></span><div><strong>${escapeHtml(p.title)}</strong><p>${escapeHtml(p.text)}</p></div></li>`,
  ).join('');

  const normRow = (key: string, label: string, rw: string, lnw: string, muted?: boolean) => {
    const isNow = key === hybridBefore;
    const isMf = key === hybridAfter;
    const mark = isMf
      ? pillSvg('MultiFrame', { bg: '#01644f', fg: '#ffffff', fontSize: 9, padX: 8, height: 20 })
      : isNow
        ? pillSvg('Сейчас', { bg: '#68757e', fg: '#ffffff', fontSize: 9, padX: 8, height: 20 })
        : '';
    return `<tr class="${muted ? 'muted' : ''} ${isNow || isMf ? 'marked' : ''}">
      <td><span class="norm-name">${escapeHtml(label)}</span></td>
      <td>${rw}</td><td>${lnw}</td>
      <td>${mark}</td>
    </tr>`;
  };

  const normsTable = `
    <div class="norms-block">
      <h2>Нормы комфорта жилья</h2>
      <p class="muted" style="margin-bottom:8px">по СП 51.13330.2011 · Rw больше лучше · Lnw меньше лучше</p>
      <table class="norms">
        <thead><tr><th>Уровень</th><th>Rw</th><th>Lnw</th><th></th></tr></thead>
        <tbody>
          ${normRow('A', 'Высокий комфорт (А)', `≥ ${NORMS.A.Rw}`, `≤ ${NORMS.A.Lnw}`)}
          ${normRow('B', 'Комфорт (Б)', `≥ ${NORMS.B.Rw}`, `≤ ${NORMS.B.Lnw}`)}
          ${normRow('V', 'Допустимый (В)', `≥ ${NORMS.V.Rw}`, `≤ ${NORMS.V.Lnw}`)}
          ${normRow('below', 'Ниже допустимого', `&lt; ${NORMS.V.Rw}`, `&gt; ${NORMS.V.Lnw}`, true)}
        </tbody>
      </table>
    </div>`;

  const TOTAL = SHOW_FREQUENCY_CHARTS ? 4 : 3;

  const partnerOrg =
    typeof window !== 'undefined'
      ? ((window as Window & { __MF_PARTNER_ORG__?: OrgSettings | null }).__MF_PARTNER_ORG__ ??
        null)
      : null;
  const partnerCompany =
    typeof window !== 'undefined'
      ? (window as Window & { __MF_PARTNER_COMPANY__?: string }).__MF_PARTNER_COMPANY__ ||
        partnerOrg?.companyName ||
        ''
      : '';
  const estimate =
    room.ceilingAreaM2 != null ? buildEstimateFromOrg(room.ceilingAreaM2, partnerOrg) : null;
  const estimateHtml = estimate && !opts.hidePrices
    ? `<div class="card estimate-card">
      <h2><span class="sec-idx">КП</span>Смета для КП</h2>
      ${
        partnerCompany
          ? `<p class="muted" style="margin:0 0 10px">Подготовлено: <b style="color:#152018">${escapeHtml(partnerCompany)}</b> · площадь ${escapeHtml(String(estimate.areaM2))} м²</p>`
          : `<p class="muted" style="margin:0 0 10px">Площадь ${escapeHtml(String(estimate.areaM2))} м²</p>`
      }
      <table class="estimate">
        <tbody>
          <tr>
            <td>Панели MultiFrame</td>
            <td>${estimate.panels} шт. · РРЦ ${formatRub(estimate.panelPriceRub)}</td>
            <td class="num">${formatRub(estimate.panelsCost)}</td>
          </tr>
          <tr>
            <td>Дюбели (запас 15%)</td>
            <td>${estimate.dowels} шт.</td>
            <td class="num">${estimate.dowelsCost != null ? formatRub(estimate.dowelsCost) : '—'}</td>
          </tr>
          ${
            estimate.installCost != null
              ? `<tr>
            <td>Монтаж</td>
            <td>${escapeHtml(String(partnerOrg?.installPricePerM2 ?? ''))} ₽/м²</td>
            <td class="num">${formatRub(estimate.installCost)}</td>
          </tr>`
              : ''
          }
          <tr class="total">
            <td colspan="2"><strong>Итого</strong> · общая сумма по проекту</td>
            <td class="num"><strong>${formatRub(estimate.totalCost)}</strong></td>
          </tr>
        </tbody>
      </table>
      <p class="muted" style="margin:8px 0 0;font-size:10px">Ориентир для коммерческого предложения. Детальный расклад панелей — в калькуляторе комплектации.</p>
    </div>`
    : '';

  return `<!DOCTYPE html>
<html lang="ru"><head><meta charset="utf-8" />
<style>
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; background: #f4f7f6; }
  body {
    font-family: "Segoe UI", system-ui, -apple-system, Roboto, Arial, sans-serif;
    color: #152018;
    -webkit-font-smoothing: antialiased;
  }
  .sheet { width: ${PAGE_W}px; background: #f4f7f6; }

  .page {
    width: ${PAGE_W}px;
    height: ${PAGE_H}px;
    padding: 28px 36px 58px;
    position: relative;
    background:
      radial-gradient(120% 60% at 100% 0%, rgba(1,100,79,.06), transparent 55%),
      #f4f7f6;
    overflow: hidden;
  }
  .page::before {
    content: "";
    position: absolute; left: 0; top: 0; right: 0; height: 6px;
    background: linear-gradient(90deg, #0c332c 0%, #01644f 45%, #2ab38b 100%);
  }

  .page-top { margin-bottom: 18px; }
  .brand-row {
    display: flex; justify-content: space-between; align-items: center;
    gap: 16px; margin-bottom: 8px;
  }
  .brand-lockup { display: flex; align-items: center; gap: 10px; min-width: 0; }
  .logo-stp {
    width: 40px; height: 40px; object-fit: contain; flex: 0 0 auto;
    display: block;
  }
  .logo-mf {
    height: 26px; width: auto; max-width: 150px; object-fit: contain;
    flex: 0 0 auto; display: block;
  }
  .brand-sub {
    font-size: 13px; font-weight: 650; color: #5f6b73; white-space: nowrap;
    padding-left: 8px; border-left: 1px solid #dce6e1; line-height: 1.2;
  }
  .pill-svg { display: inline-block; vertical-align: middle; flex-shrink: 0; }
  .meta-row {
    display: flex; justify-content: space-between; gap: 12px;
    font-size: 11px; color: #5f6b73; padding-top: 8px;
    border-top: 1px solid #dce6e1;
  }

  .page-bottom {
    position: absolute; left: 36px; right: 36px; bottom: 14px;
    z-index: 2;
    display: flex; justify-content: space-between; gap: 12px;
    padding: 10px 0 0;
    border-top: 1px solid #dce6e1;
    background: #f4f7f6;
    font-size: 10px; color: #7a8790;
  }

  .hero-title {
    margin: 0 0 4px;
    font-size: 26px; font-weight: 800; letter-spacing: -.03em; line-height: 1.15;
    color: #0f1c16;
  }
  .hero-sub {
    margin: 0 0 16px;
    font-size: 13px; color: #5f6b73; line-height: 1.4;
  }
  .hero-sub b { color: #01644f; font-weight: 750; }

  .object {
    display: grid; grid-template-columns: 120px 1fr; gap: 0;
    border-radius: 18px; overflow: hidden; margin-bottom: 14px;
    background: linear-gradient(135deg, #0c332c 0%, #01644f 55%, #0f463c 100%);
    color: #e8f2ef; box-shadow: 0 10px 28px rgba(1,100,79,.22);
  }
  .object-label {
    display: flex; flex-direction: column; justify-content: center;
    gap: 4px; padding: 16px 14px 16px 18px;
    border-right: 1px solid rgba(255,255,255,.12);
  }
  .object-label span {
    font-size: 9px; font-weight: 750; letter-spacing: .14em; text-transform: uppercase; opacity: .7;
  }
  .object-label strong { font-size: 18px; font-weight: 800; letter-spacing: -.02em; }
  .object-grid {
    margin: 0; padding: 12px 12px 12px 8px;
    display: grid; grid-template-columns: 1fr 1fr; gap: 8px;
  }
  .object-grid div {
    padding: 10px 11px; border-radius: 12px;
    background: rgba(255,255,255,.08); border: 1px solid rgba(255,255,255,.1);
  }
  .object-grid dt {
    margin: 0 0 3px; font-size: 9px; font-weight: 650;
    letter-spacing: .04em; text-transform: uppercase; opacity: .65;
  }
  .object-grid dd {
    margin: 0; font-size: 12px; font-weight: 700; line-height: 1.3; color: #fff;
  }

  .kpi-row {
    display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px;
    margin-bottom: 16px;
  }
  .kpi {
    display: flex; flex-direction: column; gap: 8px;
    padding: 14px 13px 13px; border-radius: 16px;
    background: #fff; border: 1px solid #dce6e1;
    box-shadow: 0 1px 2px rgba(17,24,39,.04), 0 8px 18px rgba(17,24,39,.04);
    min-width: 0; min-height: 118px;
  }
  .kpi .k {
    font-size: 10.5px; font-weight: 650; color: #5f6b73; line-height: 1.25;
  }
  .kpi .v {
    font-size: 28px; font-weight: 850; letter-spacing: -.04em; line-height: 1;
    font-variant-numeric: tabular-nums; color: #0f1c16;
  }
  .kpi .v-phrase {
    font-size: 22px; font-weight: 850; letter-spacing: -.03em; line-height: 1.1;
    color: #0f1c16;
  }
  .kpi .v em {
    font-style: normal; font-size: 12px; font-weight: 700;
    color: #5f6b73; margin-left: 3px; vertical-align: .15em;
  }
  .kpi .pill-svg { align-self: flex-start; margin-top: 2px; }

  .card {
    padding: 14px 16px; border-radius: 16px;
    background: #fff; border: 1px solid #dce6e1;
    box-shadow: 0 1px 2px rgba(17,24,39,.04), 0 8px 18px rgba(17,24,39,.04);
    margin-bottom: 12px;
  }
  .card h2 {
    margin: 0 0 8px; font-size: 14px; font-weight: 800; letter-spacing: -.02em;
  }
  .sec-idx {
    display: inline-block; margin-right: 8px;
    font-size: 10px; font-weight: 800; letter-spacing: .1em;
    color: #01644f; text-transform: uppercase;
  }

  .compare {
    display: grid; grid-template-columns: 1fr 1fr; gap: 12px;
  }
  .cmp {
    padding: 18px 16px; border-radius: 14px; border: 1px solid #dce6e1; background: #f7faf8;
    min-height: 148px;
  }
  .cmp.after {
    background: linear-gradient(155deg, #01644f, #0c332c);
    border-color: #01644f; color: #fff;
  }
  .cmp .k {
    font-size: 11px; font-weight: 800; letter-spacing: .1em;
    text-transform: uppercase; opacity: .75; margin-bottom: 8px;
  }
  .cmp h3 { margin: 0 0 10px; font-size: 17px; font-weight: 800; line-height: 1.25; }
  .cmp .nums { font-size: 13px; font-variant-numeric: tabular-nums; opacity: .95; }
  .cmp .chips { margin-top: 8px; font-size: 12px; opacity: .85; }

  .lead { margin: 0 0 6px; font-size: 13px; line-height: 1.45; }
  .muted { margin: 0; font-size: 12px; line-height: 1.4; color: #5f6b73; }

  .felt { display: flex; flex-direction: column; gap: 10px; margin-top: 12px; }
  .felt-row {
    display: flex; justify-content: space-between; align-items: center; gap: 12px;
    padding: 14px 14px; border-radius: 12px; border: 1px solid #dce6e1; background: #f7faf8;
    font-size: 13px; line-height: 1.4;
  }
  .comfort-row {
    display: grid; grid-template-columns: 1fr; gap: 12px; margin-top: 14px;
  }
  .rings-card {
    display: block; text-align: center;
    padding: 16px 14px; border-radius: 14px; border: 1px solid #dce6e1;
    background: #f7faf8;
  }
  .rings-title {
    margin: 0 0 12px; font-size: 13px; font-weight: 800; letter-spacing: -.01em;
    color: #0f1c16; text-align: center;
  }
  .rings {
    display: block; text-align: center; margin: 0 auto 10px;
  }
  .ring {
    position: relative; width: 92px; height: 92px;
    display: inline-block; margin: 0 12px; vertical-align: top;
  }
  .ring-center {
    position: absolute; left: 0; right: 0; top: 28px; text-align: center;
    pointer-events: none;
  }
  .ring-center b {
    display: block; font-size: 18px; font-weight: 800; letter-spacing: -.03em; line-height: 1.1;
    font-variant-numeric: tabular-nums;
  }
  .ring-center span {
    display: block; margin-top: 2px; font-size: 10px; font-weight: 700; color: #5f6b73;
  }
  .norms-block { margin-top: 12px; }
  .norms-block h2 { margin: 0 0 6px; font-size: 13px; font-weight: 800; }
  .norms {
    width: 100%; border-collapse: collapse; font-size: 12px;
    border: 1px solid #dce6e1; background: #f7faf8;
  }
  .norms th, .norms td {
    padding: 9px 12px; border-bottom: 1px solid #e4ebe7; text-align: left;
    vertical-align: middle;
  }
  .norms tr:last-child td { border-bottom: none; }
  .norms th {
    background: #eef5f1; color: #5f6b73; font-size: 11px; font-weight: 700;
  }
  .norms td:nth-child(2), .norms td:nth-child(3),
  .norms th:nth-child(2), .norms th:nth-child(3) {
    text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; font-weight: 700;
  }
  .norms td:nth-child(4), .norms th:nth-child(4) {
    text-align: right; white-space: nowrap; width: 1%;
  }
  .norms tr.muted td { color: #7a8790; }
  .norms tr.marked td { background: #e7f3ef; }
  .norm-name { font-weight: 700; }

  .estimate-card { margin: 10px 0 0; padding: 12px 14px !important; }
  .estimate-card h2 { margin-bottom: 4px !important; }
  .estimate {
    width: 100%; border-collapse: collapse; font-size: 11px;
    border: 1px solid #dce6e1; background: #fff; border-radius: 10px; overflow: hidden;
  }
  .estimate td {
    padding: 7px 10px; border-bottom: 1px solid #e4ebe7;
    vertical-align: middle; color: #152018;
  }
  .estimate tr:last-child td { border-bottom: none; }
  .estimate td.num {
    text-align: right; white-space: nowrap;
    font-variant-numeric: tabular-nums; font-weight: 750;
  }
  .estimate tr.total td {
    background: #0c332c; color: #e8f2ef; font-size: 12px;
    padding-top: 9px; padding-bottom: 9px;
  }
  .estimate tr.total td.num { font-size: 14px; font-weight: 800; }

  .note {
    margin: 0 0 12px; font-size: 12px; color: #5f6b73; line-height: 1.4;
  }

  .delta-strip {
    display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin: 0 0 12px;
  }
  .delta-item {
    padding: 12px 14px; border-radius: 14px; border: 1px solid #dce6e1; background: #fff;
  }
  .delta-item .k {
    font-size: 10px; font-weight: 750; letter-spacing: .04em;
    text-transform: uppercase; color: #5f6b73;
  }
  .delta-item .v {
    margin-top: 4px; font-size: 14px; font-weight: 800; font-variant-numeric: tabular-nums;
  }
  .delta-item .d { margin-top: 3px; font-size: 12px; color: #01644f; font-weight: 750; }

  .chart {
    margin: 0 0 12px; padding: 12px 14px 10px; border-radius: 16px;
    border: 1px solid #dce6e1; background: #fff;
    box-shadow: 0 1px 2px rgba(17,24,39,.04), 0 8px 18px rgba(17,24,39,.04);
  }
  .chart:last-of-type { margin-bottom: 0; }
  .chart figcaption {
    display: flex; justify-content: space-between; gap: 10px;
    align-items: flex-start; margin-bottom: 6px;
  }
  .chart figcaption strong { display: block; font-size: 13px; font-weight: 800; letter-spacing: -.01em; }
  .chart figcaption span { display: block; font-size: 11px; color: #5f6b73; margin-top: 2px; }
  .badge {
    flex-shrink: 0;
    display: flex; flex-direction: column; align-items: flex-end; gap: 4px;
    text-align: right; background: #f7faf8; border: 1px solid #dce6e1;
    padding: 6px 9px; border-radius: 10px; font-size: 10.5px; color: #5f6b73;
  }
  .badge b { display: block; color: #152018; font-size: 12px; font-weight: 800; line-height: 1.2; }
  .badge-nums {
    display: block; font-size: 10.5px; color: #5f6b73; line-height: 1.25;
    font-variant-numeric: tabular-nums; white-space: nowrap;
  }
  .badge .pill-svg { display: block; margin: 0; }
  .legend {
    list-style: none; margin: 6px 0 0; padding: 0;
    display: flex; gap: 14px; font-size: 11px; color: #5f6b73; font-weight: 650;
  }
  .legend i {
    display: inline-block; width: 16px; height: 3px; border-radius: 999px;
    margin-right: 6px; vertical-align: middle;
  }
  .sw-b { background: #7a8790; } .sw-a { background: #01644f; }

  .pillars {
    list-style: none; margin: 0; padding: 0;
    display: grid; grid-template-columns: 1fr 1fr; gap: 8px;
  }
  .pillar {
    display: flex; gap: 10px; padding: 12px;
    border-radius: 12px; border: 1px solid #dce6e1; background: #f7faf8;
  }
  .pillar-mark {
    flex: 0 0 4px; border-radius: 999px; background: #01644f; align-self: stretch; min-height: 1.2em;
  }
  .pillar strong { display: block; font-size: 12.5px; font-weight: 800; margin-bottom: 3px; letter-spacing: -.01em; }
  .pillar p { margin: 0; font-size: 11.5px; color: #5f6b73; line-height: 1.4; }
  .pillars .pillar:last-child:nth-child(odd) { grid-column: 1 / -1; }

  .qr-row {
    display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-top: 12px;
  }
  .qr-card {
    display: flex; gap: 12px; align-items: center;
    padding: 14px 12px; border-radius: 14px;
    border: 1px solid rgba(1,100,79,.22);
    background: #eef7f3;
  }
  .qr-row-share { grid-template-columns: 1fr; }
  .qr-card-share img { width: 116px; height: 116px; }
  .qr-card-share .qr-url { font-size: 9.5px; }
  .qr-card img {
    width: 84px; height: 84px; border-radius: 10px;
    border: 1px solid #dce6e1; background: #fff; flex-shrink: 0;
  }
  .qr-card .qr-k {
    font-size: 10px; font-weight: 800; letter-spacing: .08em;
    text-transform: uppercase; color: #01644f; margin-bottom: 4px;
  }
  .qr-card strong {
    display: block; font-size: 14px; font-weight: 800; letter-spacing: -.02em; margin-bottom: 3px;
  }
  .qr-card p { margin: 0; font-size: 11.5px; color: #5f6b73; line-height: 1.35; }
  .qr-card .qr-url {
    display: block; margin-top: 5px; font-size: 10.5px; font-weight: 700;
    color: #0c332c; word-break: break-all;
  }

  .closing {
    margin-top: 12px; padding: 12px 14px; border-radius: 12px;
    border: 1px solid rgba(1,100,79,.2);
    background: #eef7f3;
    font-size: 12px; line-height: 1.45; color: #5f6b73;
  }
  .closing b { color: #152018; }
  .rec-product {
    display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px;
    margin: 0 0 14px;
  }
  .recs, .product {
    padding: 12px 14px; border-radius: 12px;
    border: 1px solid rgba(1,100,79,.18); background: #f7fbf9;
  }
  .recs h2, .product h2 { margin: 0 0 6px; font-size: 13px; color: #01644f; }
  .recs p, .product p { margin: 0; font-size: 10.5px; line-height: 1.4; color: #5f6b73; }
  .rec-copy { display: flex; flex-direction: column; gap: 2px; }
  .rec-copy p:first-child { color: #152018; font-weight: 600; }
  .product-body { display: grid; grid-template-columns: 88px 1fr; gap: 10px; align-items: start; }
  .product-body img { width: 88px; height: auto; border: 0; border-radius: 0; background: transparent; }
  .product-copy { display: flex; flex-direction: column; gap: 5px; min-width: 0; }
  .product-copy strong { font-size: 11.5px; line-height: 1.3; color: #152018; }
  .db-hint { display: block; margin-top: 6px; font-size: 10px; font-weight: 650; color: #68757e; }
</style></head><body>
<div class="sheet" id="mf-report-root">

  <!-- PAGE 1 -->
  <section class="page" data-page="1">
    ${pageChrome(1, TOTAL, roomLine, logos)}
    <h1 class="hero-title">Акустический профиль помещения</h1>
    <p class="hero-sub">Комната: <b>${escapeHtml(roomName)}</b>, ${escapeHtml(area)}. Эффект MultiFrame для этого помещения.</p>
    ${
      partnerCompany
        ? `<p class="hero-sub">Подготовлено: <b>${escapeHtml(partnerCompany)}</b></p>`
        : ''
    }

    <section class="object" aria-label="Комната">
      <div class="object-label">
        <strong>Параметры комнаты</strong>
      </div>
      <dl class="object-grid">
        <div><dt>Перекрытие</dt><dd>${escapeHtml(slabLabel)}</dd></div>
        <div><dt>Тип дома</dt><dd>${escapeHtml(optLabel(HOUSE_TYPE_OPTIONS, room.houseType))}</dd></div>
        <div><dt>Комната</dt><dd>${escapeHtml(roomName)} · ${escapeHtml(area)}</dd></div>
        <div><dt>Потолок</dt><dd>Натяжной</dd></div>
        ${neighborsCell}
        ${noiseKindCell}
      </dl>
    </section>

    <div class="kpi-row">
      <article class="kpi">
        <span class="k">Воздушный шум</span>
        <span class="v-phrase">${escapeHtml(airKpi.primary)}</span>
        <span class="db-hint">${escapeHtml(airKpi.secondary)}</span>
      </article>
      <article class="kpi">
        <span class="k">Ударный шум</span>
        <span class="v-phrase">${escapeHtml(impactKpi.primary)}</span>
        <span class="db-hint">${escapeHtml(impactKpi.secondary)}</span>
      </article>
      <article class="kpi">
        <span class="k">Акустический комфорт</span>
        <span class="v">${comfortBefore} → ${comfortAfter}<em>%</em></span>
        ${
          echoDrop > 0
            ? pillSvg(`≈ на ${echoDrop}% меньше эха`, { bg: '#dceee8', fg: '#01644f' })
            : pillSvg('комфорт комнаты', { bg: '#dceee8', fg: '#01644f' })
        }
      </article>
    </div>

    ${recProductHtml}

    <div class="card" style="margin-bottom:0">
      <h2><span class="sec-idx">01</span>Класс комфорта</h2>
      <div class="compare">
        <div class="cmp">
          <div class="k">Сейчас</div>
          <h3>«${escapeHtml(officialComfortLabel(hybridBefore))}»</h3>
          <div class="nums">изоляция воздуха ≈ ${Math.round(b.Rw)} дБ · удар сверху ≈ ${Math.round(b.Lnw)} дБ</div>
          <div class="chips">воздух ${chipLabel(airClassFor(b.Rw))} · удар ${chipLabel(impactClassFor(b.Lnw))}</div>
        </div>
        <div class="cmp after">
          <div class="k">С MultiFrame</div>
          <h3>«${escapeHtml(officialComfortLabel(hybridAfter))}»</h3>
          <div class="nums">изоляция воздуха ≈ ${Math.round(a.Rw)} дБ · удар сверху ≈ ${Math.round(a.Lnw)} дБ</div>
          <div class="chips">воздух ${chipLabel(airClassFor(a.Rw))} · удар ${chipLabel(impactClassFor(a.Lnw))}</div>
        </div>
      </div>
    </div>
  </section>

  <!-- PAGE 2 -->
  <section class="page" data-page="2">
    ${pageChrome(2, TOTAL, roomLine, logos)}
    <div class="card" style="margin-bottom:0">
      <h2><span class="sec-idx">02</span>Прогноз с MultiFrame</h2>
      <div class="felt">
        <div class="felt-row">
          <span>Воздух · ${FELT_STEP_LABELS[airNow]} → <b>${FELT_STEP_LABELS[airAfter]}</b> · изоляция ≈ ${Math.round(b.Rw)} → ≈ ${Math.round(a.Rw)} дБ</span>
          ${pillSvg(`≈ ${sim.perceivedAirPct}% тише`, { bg: '#dceee8', fg: '#01644f', fontSize: 11, height: 24 })}
        </div>
        <div class="felt-row">
          <span>Удар · ${FELT_STEP_LABELS[impactNow]} → <b>${FELT_STEP_LABELS[impactAfter]}</b> · удар сверху ≈ ${Math.round(b.Lnw)} → ≈ ${Math.round(a.Lnw)} дБ</span>
          ${pillSvg(`≈ ${sim.perceivedImpactPct}% тише`, { bg: '#dceee8', fg: '#01644f', fontSize: 11, height: 24 })}
        </div>
      </div>
      <div class="comfort-row">
        <div class="rings-card">
          <h3 class="rings-title">Акустический комфорт</h3>
          <div class="rings">
            ${comfortRingSvg(comfortBefore, 'Сейчас', false)}
            ${comfortRingSvg(comfortAfter, 'После', true)}
          </div>
          ${
            echoDrop > 0
              ? pillSvg(`≈ на ${echoDrop}% меньше эха`, {
                  bg: '#dceee8',
                  fg: '#01644f',
                  fontSize: 12,
                  height: 26,
                  padX: 12,
                })
              : ''
          }
          <p class="muted" style="text-align:center;margin-top:10px">MultiFrame — звукоизоляция и звукопоглощение в комнате</p>
        </div>
      </div>
      ${normsTable}
    </div>
  </section>

  ${
    SHOW_FREQUENCY_CHARTS
      ? `<!-- PAGE 3 -->
  <section class="page" data-page="3">
    ${pageChrome(3, TOTAL, roomLine, logos)}
    <h2 style="margin:0 0 6px;font-size:15px;font-weight:800"><span class="sec-idx">03</span>Изоляция по частотам</h2>
    <p class="note">Чем выше линия, тем лучше перекрытие изолирует шум на этой частоте.</p>

    <div class="delta-strip">
      <div class="delta-item">
        <div class="k">Изоляция воздушного шума · Rw</div>
        <div class="v">${Math.round(b.Rw)} → ${Math.round(a.Rw)} дБ</div>
        <div class="d">Δ +${deltaRw} дБ · ≈ на ${sim.perceivedAirPct}% тише</div>
      </div>
      <div class="delta-item">
        <div class="k">Уровень ударного шума · Lnw</div>
        <div class="v">${Math.round(b.Lnw)} → ${Math.round(a.Lnw)} дБ</div>
        <div class="d">Δ −${deltaLnw} дБ · ≈ на ${sim.perceivedImpactPct}% тише</div>
      </div>
    </div>

    ${airSvg}
    ${impactSvg}
  </section>`
      : ''
  }

  <!-- LAST PAGE -->
  <section class="page" data-page="${TOTAL}">
    ${pageChrome(TOTAL, TOTAL, roomLine, logos)}
    ${
      estimateHtml
        ? estimateHtml
        : `<div class="card">
      <h2><span class="sec-idx">${SHOW_FREQUENCY_CHARTS ? '04' : '03'}</span>Уникальность MultiFrame</h2>
      <ul class="pillars">${pillars}</ul>
    </div>`
    }
    ${
      estimateHtml
        ? `<div class="card" style="margin-top:10px;padding:12px 14px">
      <h2 style="margin:0 0 6px;font-size:13px"><span class="sec-idx">${SHOW_FREQUENCY_CHARTS ? '04' : '03'}</span>Уникальность MultiFrame</h2>
      <ul class="pillars" style="gap:6px">${pillars}</ul>
    </div>`
        : ''
    }

    <h2 style="margin:12px 0 4px;font-size:15px;font-weight:800">Продолжите с MultiFrame</h2>
    <p class="hero-sub" style="margin-bottom:0">${opts.shareUrl ? 'Отсканируйте QR — результаты комнаты, сайт бренда или калькулятор комплектации.' : 'Отсканируйте QR — сайт бренда или калькулятор комплектации.'}</p>

    ${
      qr.share && opts.shareUrl
        ? `<div class="qr-row qr-row-share">
      <div class="qr-card qr-card-share">
        <img src="${qr.share}" alt="QR код страницы с результатами комнаты" width="116" height="116" />
        <div>
          <div class="qr-k">Результаты комнаты</div>
          <strong>Послушайте сами</strong>
          <p>Отсканируйте QR: откроется страница с результатами по этой комнате и звуком до и после. Входить никуда не нужно.</p>
          <span class="qr-url">${escapeHtml(opts.shareUrl)}</span>
        </div>
      </div>
    </div>`
        : ''
    }
    <div class="qr-row">
      <div class="qr-card">
        <img src="${qr.site}" alt="QR код сайта MultiFrame" width="84" height="84" />
        <div>
          <div class="qr-k">Сайт</div>
          <strong>stp-multiframe.ru</strong>
          <p>Официальный сайт MultiFrame</p>
          <span class="qr-url">${escapeHtml(SITE_URL)}</span>
        </div>
      </div>
      <div class="qr-card">
        <img src="${qr.calc}" alt="QR код калькулятора MultiFrame" width="84" height="84" />
        <div>
          <div class="qr-k">Калькулятор</div>
          <strong>Рассчитать количество</strong>
          <p>Подбор комплектации под объект</p>
          <span class="qr-url">${escapeHtml(CALCULATOR_URL)}</span>
        </div>
      </div>
    </div>

    <div class="closing">
      Документ собран по ответам в Проблемомере для комнаты «${escapeHtml(roomName)}».
      Это <b>экспертная оценка</b>, не инженерный расчёт и не гарантия цифр.
    </div>
  </section>

</div>
</body></html>`;
}

/** HTML document used for PDF rasterization (also handy for visual preview). */
export async function buildAcousticProfileHtml(
  session: SessionState,
  logos?: LogoBundle,
): Promise<string> {
  const full = session.derived ? session : withDerived(session);
  if (!full.derived) {
    throw new Error('Нет расчёта для отчёта');
  }
  const [qr, logoBundle, panel] = await Promise.all([
    buildQrBundle(),
    buildLogoBundle(logos),
    fetchPanelDataUrl(),
  ]);
  return buildReportDocument(full, { qr, logos: logoBundle, panel });
}

async function fetchPanelDataUrl(): Promise<string> {
  const base = new URL(import.meta.env.BASE_URL || '/', window.location.href);
  return fetchDataUrl(new URL('images/multiframe-panel-transparent.png', base).href);
}

/** Prefetch pdf libs so the click is not waiting on the network. */
export function prefetchAcousticProfilePdf(): void {
  void Promise.all([import('html2canvas'), import('jspdf')]);
}

function waitFrames(n: number): Promise<void> {
  return new Promise((resolve) => {
    const step = (left: number) => {
      if (left <= 0) resolve();
      else requestAnimationFrame(() => step(left - 1));
    };
    step(n);
  });
}

function loadIframeDocument(iframe: HTMLIFrameElement, html: string): Promise<Document> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (err?: Error) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      if (err) reject(err);
      else {
        const doc = iframe.contentDocument;
        if (!doc?.body) reject(new Error('Не удалось собрать отчёт'));
        else resolve(doc);
      }
    };
    const timer = window.setTimeout(() => finish(new Error('Отчёт не открылся')), 12000);
    iframe.onload = () => finish();
    iframe.srcdoc = html;
    requestAnimationFrame(() => {
      if (iframe.contentDocument?.querySelector('.page')) finish();
    });
  });
}

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/** Render report as one A4 page image each → PDF blob («Профиль» объекта). */
export async function renderAcousticProfilePdf(
  session: SessionState,
  opts: { compact?: boolean; hidePrices?: boolean; shareUrl?: string | null } = {},
): Promise<{ blob: Blob; filename: string }> {
  const full = session.derived ? session : withDerived(session);
  if (!full.derived) {
    throw new Error('Нет расчёта для отчёта');
  }

  const shareUrl = opts.shareUrl || null;
  const [qr, logos, panel] = await Promise.all([
    buildQrBundle(shareUrl),
    buildLogoBundle(),
    fetchPanelDataUrl(),
  ]);
  const html = buildReportDocument(
    full,
    { qr, logos, panel },
    { hidePrices: opts.hidePrices === true, shareUrl },
  );
  const iframe = document.createElement('iframe');
  iframe.setAttribute('aria-hidden', 'true');
  iframe.setAttribute('title', 'PDF');
  iframe.style.cssText = [
    'position:fixed',
    'left:0',
    'top:0',
    `width:${PAGE_W}px`,
    `height:${PAGE_H}px`,
    'border:0',
    'opacity:0.01',
    'pointer-events:none',
    'z-index:2147483646',
    'background:#f4f7f6',
  ].join(';');
  document.body.appendChild(iframe);

  try {
    const idoc = await loadIframeDocument(iframe, html);
    const pages = Array.from(idoc.querySelectorAll('.page')) as HTMLElement[];
    if (pages.length === 0) {
      throw new Error('Не удалось собрать отчёт');
    }

    // Wait for QR images inside iframe to decode.
    const imgs = Array.from(idoc.images);
    await Promise.all(
      imgs.map(
        (img) =>
          img.complete
            ? Promise.resolve()
            : new Promise<void>((res) => {
                img.onload = () => res();
                img.onerror = () => res();
              }),
      ),
    );

    const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
      import('html2canvas'),
      import('jspdf'),
    ]);

    const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
    const pageW = pdf.internal.pageSize.getWidth();
    const pageH = pdf.internal.pageSize.getHeight();

    for (let i = 0; i < pages.length; i++) {
      pages.forEach((page, j) => {
        page.style.display = j === i ? 'block' : 'none';
      });
      await waitFrames(2);

      const pageEl = pages[i]!;
      const canvas = await html2canvas(pageEl, {
        // Компактный вариант уходит в объект: JPEG и меньше масштаб, чтобы влезть в лимит API.
        scale: opts.compact ? 1.5 : 2,
        backgroundColor: '#f4f7f6',
        useCORS: true,
        logging: false,
        foreignObjectRendering: false,
        windowWidth: PAGE_W,
        windowHeight: PAGE_H,
      });

      const imgData = opts.compact ? canvas.toDataURL('image/jpeg', 0.82) : canvas.toDataURL('image/png', 1);
      if (i > 0) pdf.addPage();
      pdf.addImage(imgData, opts.compact ? 'JPEG' : 'PNG', 0, 0, pageW, pageH, undefined, 'FAST');
    }

    const room = full.answers.room;
    const roomName = roomTypeLabel(room, 'komnata');
    const safe = roomName.replace(/[^\wа-яА-ЯёЁ\-]+/gi, '_').slice(0, 24);
    const filename = `MultiFrame_результаты_${safe}_${room.ceilingAreaM2 ?? 'area'}.pdf`;
    return { blob: pdf.output('blob'), filename };
  } finally {
    iframe.remove();
  }
}

/** Render report → PDF download. */
export async function downloadAcousticProfilePdf(session: SessionState): Promise<void> {
  const { blob, filename } = await renderAcousticProfilePdf(session);
  triggerDownload(blob, filename);
}

/** Copy deep-link (answer chain). Web Share when available. */
export async function shareAcousticProfile(
  session: SessionState,
): Promise<'shared' | 'copied' | 'failed'> {
  const url = buildShareUrl(session);
  const text = buildShareClipboardText(session);

  try {
    if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
      await navigator.share({
        title: 'Слышите соседей сверху? Проверьте комнату бесплатно',
        text: SHARE_MARKETING_BLURB,
        url,
      });
      return 'shared';
    }
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') return 'failed';
  }

  try {
    await navigator.clipboard.writeText(text);
    return 'copied';
  } catch {
    try {
      await navigator.clipboard.writeText(url);
      return 'copied';
    } catch {
      console.info('[share-fallback]', text);
      return 'failed';
    }
  }
}

export { buildShareUrl, SHARE_MARKETING_BLURB };
