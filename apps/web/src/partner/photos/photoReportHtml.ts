/**
 * Страницы PDF «Фотоотчёт»: HTML формата А4, по которому браузер собирает PDF (как «Профиль» Проблемомера).
 * Здесь только название комнаты, даты и снимки по этапам. Цен, подписей, имён сотрудников и клиента нет.
 */
import { PHOTO_STAGES, PHOTO_STAGE_LABELS, type PhotoStage } from '../../../../../packages/shared/roomPhotos.js';

export const REPORT_PAGE_W = 794;
export const REPORT_PAGE_H = 1123;

export type ReportPhoto = {
  stage: PhotoStage;
  createdAt: string;
  /** Снимок как data: адрес, чтобы он точно попал в PDF. */
  dataUrl: string;
};

const PAD_TOP = 40;
const PAD_BOTTOM = 56;
const HEAD_FIRST = 132;
const HEAD_NEXT = 28;
const STAGE_HEAD = 46;
const ROW_H = 300;

const MONTHS = [
  'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
  'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря',
];

function esc(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function parts(iso: string): { d: number; m: number; y: number } | null {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return { d: date.getDate(), m: date.getMonth(), y: date.getFullYear() };
}

/** «12 марта 2026». */
export function reportDate(iso: string): string {
  const p = parts(iso);
  return p ? `${p.d} ${MONTHS[p.m]} ${p.y}` : '';
}

/** Дата или период съёмки: «12 марта 2026» или «12 марта – 14 апреля 2026». */
export function reportPeriod(photos: ReadonlyArray<{ createdAt: string }>): string {
  const dates = photos.map((p) => p.createdAt).filter((iso) => parts(iso)).sort();
  if (!dates.length) return '';
  const first = parts(dates[0]!)!;
  const last = parts(dates[dates.length - 1]!)!;
  if (first.d === last.d && first.m === last.m && first.y === last.y) return reportDate(dates[0]!);
  if (first.y === last.y) return `${first.d} ${MONTHS[first.m]} – ${last.d} ${MONTHS[last.m]} ${last.y}`;
  return `${reportDate(dates[0]!)} – ${reportDate(dates[dates.length - 1]!)}`;
}

type Block =
  | { kind: 'stage'; stage: PhotoStage; count: number; continued: boolean }
  | { kind: 'row'; photos: ReportPhoto[] };

/** Раскладка по страницам: заголовок этапа не остаётся в конце страницы без снимков. */
export function paginatePhotos(photos: readonly ReportPhoto[]): Block[][] {
  const pages: Block[][] = [[]];
  let left = REPORT_PAGE_H - PAD_TOP - PAD_BOTTOM - HEAD_FIRST;
  const next = () => {
    pages.push([]);
    left = REPORT_PAGE_H - PAD_TOP - PAD_BOTTOM - HEAD_NEXT;
  };
  for (const stage of PHOTO_STAGES) {
    const own = photos.filter((p) => p.stage === stage).sort((a, b) => (a.createdAt > b.createdAt ? 1 : -1));
    if (!own.length) continue;
    if (left < STAGE_HEAD + ROW_H) next();
    pages[pages.length - 1]!.push({ kind: 'stage', stage, count: own.length, continued: false });
    left -= STAGE_HEAD;
    for (let i = 0; i < own.length; i += 2) {
      if (left < ROW_H) {
        next();
        pages[pages.length - 1]!.push({ kind: 'stage', stage, count: own.length, continued: true });
        left -= STAGE_HEAD;
      }
      pages[pages.length - 1]!.push({ kind: 'row', photos: own.slice(i, i + 2) });
      left -= ROW_H;
    }
  }
  return pages;
}

export function buildPhotoReportHtml(input: { roomName: string; photos: readonly ReportPhoto[] }): string {
  const name = input.roomName.trim() || 'Комната';
  const period = reportPeriod(input.photos);
  const pages = paginatePhotos(input.photos);
  const total = pages.length;
  const counts = PHOTO_STAGES.map((stage) => ({ stage, n: input.photos.filter((p) => p.stage === stage).length }))
    .filter((item) => item.n > 0)
    .map((item) => `${PHOTO_STAGE_LABELS[item.stage]}: ${item.n}`)
    .join(' · ');

  const body = pages
    .map((blocks, index) => {
      const head =
        index === 0
          ? `<header class="head">
  <div class="brand">MultiFrame</div>
  <h1>Фотоотчёт</h1>
  <p class="room">${esc(name)}</p>
  <p class="meta">${period ? `Дата съёмки: ${esc(period)}` : ''}${period && counts ? ' · ' : ''}${esc(counts)}</p>
</header>`
          : `<header class="head small"><span class="brand">MultiFrame</span><span>Фотоотчёт · ${esc(name)}</span></header>`;
      const content = blocks
        .map((block) => {
          if (block.kind === 'stage') {
            return `<h2 class="stage">${esc(PHOTO_STAGE_LABELS[block.stage])}<span>${block.count}${block.continued ? ' · продолжение' : ''}</span></h2>`;
          }
          return `<div class="row">${block.photos
            .map(
              (photo) =>
                `<figure><div class="frame"><img src="${photo.dataUrl}" alt="" /></div><figcaption>${esc(reportDate(photo.createdAt))}</figcaption></figure>`,
            )
            .join('')}</div>`;
        })
        .join('');
      return `<section class="page">${head}${content}<footer class="foot"><span>MultiFrame · Фотоотчёт</span><span>Страница ${index + 1} из ${total}</span></footer></section>`;
    })
    .join('');

  return `<!DOCTYPE html>
<html lang="ru"><head><meta charset="utf-8" />
<style>
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; background: #f4f7f6; }
  body { font-family: "Segoe UI", system-ui, -apple-system, Roboto, Arial, sans-serif; color: #152018; -webkit-font-smoothing: antialiased; }
  .page { width: ${REPORT_PAGE_W}px; height: ${REPORT_PAGE_H}px; padding: ${PAD_TOP}px 36px ${PAD_BOTTOM}px; position: relative; background: #f4f7f6; overflow: hidden; }
  .page::before { content: ""; position: absolute; left: 0; top: 0; right: 0; height: 6px; background: linear-gradient(90deg, #0c332c 0%, #01644f 45%, #2ab38b 100%); }
  .head { height: ${HEAD_FIRST}px; }
  .head .brand { font-size: 12px; font-weight: 800; letter-spacing: .14em; text-transform: uppercase; color: #01644f; }
  .head h1 { margin: 6px 0 4px; font-size: 32px; line-height: 1.1; font-weight: 800; color: #0c332c; }
  .head .room { margin: 0; font-size: 18px; font-weight: 700; }
  .head .meta { margin: 6px 0 0; font-size: 12px; color: #55645b; }
  .head.small { height: ${HEAD_NEXT}px; display: flex; justify-content: space-between; font-size: 11px; color: #55645b; }
  .head.small .brand { font-size: 11px; }
  .stage { height: ${STAGE_HEAD}px; margin: 0; padding-top: 12px; font-size: 18px; font-weight: 800; color: #0c332c; border-bottom: 2px solid #dceee8; display: flex; align-items: baseline; gap: 10px; }
  .stage span { font-size: 12px; font-weight: 600; color: #55645b; }
  .row { height: ${ROW_H}px; display: flex; gap: 16px; padding-top: 14px; }
  figure { margin: 0; width: 349px; }
  .frame { width: 349px; height: 252px; background: #e6ece9; border-radius: 10px; overflow: hidden; display: flex; align-items: center; justify-content: center; }
  .frame img { max-width: 100%; max-height: 100%; display: block; }
  figcaption { margin-top: 6px; font-size: 11px; color: #55645b; }
  .foot { position: absolute; left: 36px; right: 36px; bottom: 22px; display: flex; justify-content: space-between; font-size: 10px; color: #7a8790; }
</style></head><body><div class="sheet">${body}</div></body></html>`;
}
