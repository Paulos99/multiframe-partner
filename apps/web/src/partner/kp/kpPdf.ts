/** PDF коммерческого предложения: HTML образца → html2canvas → jsPDF, 2 страницы A4. */
import QRCode from 'qrcode';
import { buildLogoBundle, fetchPanelDataUrl, loadIframeDocument, PAGE_H, PAGE_W, PILLARS, waitFrames } from '../../state/reportPdf';
import { productAbout } from '../../state/recommendations';
import { CALCULATOR_URL } from '../../state/types';
import { buildKpHtml, type KpAssets } from './kpHtml';
import { kpShareToken, type KpModel } from './kpModel';

const SITE_URL = 'https://stp-multiframe.ru';

/** Ссылка в QR: короткая ссылка клиента, если есть, иначе ссылка с теми же ответами (?p=). */
export function kpResultUrl(m: KpModel, clientLink: string | null): string | null {
  if (clientLink) return clientLink;
  if (!m.effectAnswers) return null;
  const url = new URL(import.meta.env.BASE_URL || '/', window.location.origin);
  url.searchParams.set('p', kpShareToken(m.effectAnswers));
  return url.toString();
}

export async function kpAssets(m: KpModel, resultUrl: string | null): Promise<KpAssets> {
  const simple = { errorCorrectionLevel: 'L' as const, margin: 4, width: 360, color: { dark: '#0f1c16', light: '#ffffff' } };
  const calcUrl = new URL(CALCULATOR_URL, window.location.origin).href;
  const [logos, panel, site, calc, result] = await Promise.all([
    buildLogoBundle(),
    fetchPanelDataUrl(),
    QRCode.toDataURL(SITE_URL, simple),
    QRCode.toDataURL(calcUrl, simple),
    resultUrl ? QRCode.toDataURL(resultUrl, simple) : Promise.resolve(null),
  ]);
  const about = m.effectAnswers ? [...productAbout(m.effectAnswers, 'mixed').paragraphs] : [];
  return { logos, panel, qr: { site, calc, result }, pillars: PILLARS, about };
}

export function kpFilename(m: KpModel): string {
  const safe = m.clientName.replace(/[^\wа-яА-ЯёЁ\- .]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 40) || 'объект';
  return `Коммерческое предложение — ${safe} — ${m.number}.pdf`;
}

export async function renderKpPdf(
  m: KpModel,
  opts: { clientLink?: string | null; compact?: boolean } = {},
): Promise<{ blob: Blob; filename: string; html: string }> {
  const html = buildKpHtml(m, await kpAssets(m, kpResultUrl(m, opts.clientLink ?? null)));
  const iframe = document.createElement('iframe');
  iframe.setAttribute('aria-hidden', 'true');
  iframe.setAttribute('title', 'PDF');
  iframe.style.cssText = `position:fixed;left:0;top:0;width:${PAGE_W}px;height:${PAGE_H}px;border:0;opacity:0.01;pointer-events:none;z-index:2147483646;background:#f4f7f6`;
  document.body.appendChild(iframe);
  try {
    const idoc = await loadIframeDocument(iframe, html);
    const pages = Array.from(idoc.querySelectorAll('.page')) as HTMLElement[];
    await Promise.all(
      Array.from(idoc.images).map((img) =>
        img.complete ? Promise.resolve() : new Promise<void>((res) => ((img.onload = () => res()), (img.onerror = () => res()))),
      ),
    );
    const [{ default: html2canvas }, { jsPDF }] = await Promise.all([import('html2canvas'), import('jspdf')]);
    const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
    const w = pdf.internal.pageSize.getWidth();
    const h = pdf.internal.pageSize.getHeight();
    for (let i = 0; i < pages.length; i++) {
      pages.forEach((p, j) => (p.style.display = j === i ? 'block' : 'none'));
      await waitFrames(2);
      const canvas = await html2canvas(pages[i]!, {
        scale: opts.compact ? 1.5 : 2,
        backgroundColor: '#f4f7f6',
        useCORS: true,
        logging: false,
        windowWidth: PAGE_W,
        windowHeight: PAGE_H,
      });
      if (i > 0) pdf.addPage();
      const jpeg = opts.compact !== false;
      pdf.addImage(jpeg ? canvas.toDataURL('image/jpeg', 0.85) : canvas.toDataURL('image/png'), jpeg ? 'JPEG' : 'PNG', 0, 0, w, h, undefined, 'FAST');
    }
    return { blob: pdf.output('blob'), filename: kpFilename(m), html };
  } finally {
    iframe.remove();
  }
}
