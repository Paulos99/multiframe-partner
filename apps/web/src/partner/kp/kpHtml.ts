/** HTML коммерческого предложения: 2 страницы A4, разметка утверждённого образца. */
import { KP_CSS } from './kpStyles';
import { classLabel, type KpModel } from './kpModel';

export type KpAssets = {
  logos: { stp: string; mf: string };
  panel: string;
  qr: { result: string | null; site: string; calc: string };
  pillars: ReadonlyArray<{ title: string; text: string }>;
  about: string[];
};

function esc(s: string): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const rub = (n: number) => `${Math.round(n).toLocaleString('ru-RU')} ₽`;
const num = (n: number) => Math.round(n).toLocaleString('ru-RU');
const area = (n: number) => `${Number.isInteger(n) ? n : n.toLocaleString('ru-RU')} м²`;

function chrome(m: KpModel, a: KpAssets): string {
  return `
  <div class="top">
    <div class="lockup">
      <img class="stp" src="${a.logos.stp}" alt="StP" />
      <img class="mf" src="${a.logos.mf}" alt="MultiFrame" />
      <span class="doc-title">Коммерческое предложение</span>
    </div>
    <div class="badges">
      <span class="pill kind">КП № ${esc(m.number)}</span>
    </div>
  </div>
  <div class="meta">
    <div>Клиент: <b>${esc(m.clientName)}</b>${m.address ? ` · ${esc(m.address)}` : ''}</div>
    <div>${esc(m.dateLabel)}</div>
  </div>`;
}

function footer(page: number): string {
  return `<div class="footer">
    <span>stp-multiframe.ru · ориентир для коммерческого предложения, не инженерный расчёт</span>
    <span>${page} / 2</span>
  </div>`;
}

function beforeNote(cls: KpModel['effect']): string {
  if (!cls) return '';
  return cls.classBefore === 'below'
    ? 'Шаги и голоса сверху слышны. Натяжной потолок усиливает ударный шум.'
    : 'Шум сверху слышен, особенно шаги и удары.';
}

function effectBlock(m: KpModel, a: KpAssets): string {
  const e = m.effect;
  if (!e) return '<p class="hint">Для эффекта нужен результат Проблемомера хотя бы по одной комнате.</p>';
  const pct = (k: string, v: string) =>
    `<div class="pct"><span class="pk">${k}</span><span class="pv">${v}*</span><span class="po">*ориентировочно</span></div>`;
  return `<div class="effect">
    <div class="effect-card before">
      <span class="label">Сейчас</span>
      <p class="cls">«${esc(classLabel(e.classBefore))}»</p>
      <p class="note">${beforeNote(e)}</p>
    </div>
    <div class="effect-card after">
      <span class="label">С MultiFrame</span>
      <p class="cls">«${esc(classLabel(e.classAfter))}»</p>
      <p class="note">Шум сверху становится заметно тише, в комнате меньше эха.</p>
      <div class="pct-row">
        ${pct('Ударный шум', `тише ≈ на ${e.impactPct}%`)}
        ${pct('Воздушный шум', `тише ≈ на ${e.airPct}%`)}
        ${pct('Эхо', `меньше ≈ на ${e.echoPct}%`)}
      </div>
    </div>
    ${
      a.qr.result
        ? `<div class="qr-effect">
      <img src="${a.qr.result}" alt="QR результат Проблемомера" data-kp-qr />
      <div class="k">Результат</div>
      <div class="t">Послушайте «до» и «после» для этого объекта</div>
    </div>`
        : ''
    }
  </div>${m.effectNote ? `<p class="hint">${esc(m.effectNote)}</p>` : ''}`;
}

function roomsBlock(m: KpModel): string {
  const count = Math.min(Math.max(m.rooms.length, 1), 6);
  return `<div class="rooms" data-count="${count}">${m.rooms
    .map(
      (r) => `
      <div class="room" data-kp-room>
        <div class="room-head"><strong>${esc(r.title)}</strong><span>${area(r.areaM2)}</span></div>
        <div class="room-grid">
          <div><span class="k">Панели MultiFrame</span><span class="v">${num(r.panels)} шт.</span></div>
          <div><span class="k">Дюбели (запас 15%)</span><span class="v">${num(r.dowels)} шт.</span></div>
          ${r.installCost != null ? `<div><span class="k">Монтаж</span><span class="v">${rub(r.installCost)}</span></div>` : ''}
          <div><span class="k">Итого по комнате</span><span class="v accent">${rub(r.subtotal)}</span></div>
        </div>
      </div>`,
    )
    .join('')}</div>`;
}

function priceHint(m: KpModel): string {
  const parts = [`панели по РРЦ ${rub(m.prices.panel)}/шт.`];
  if (m.prices.dowel != null) parts.push(`дюбели ${rub(m.prices.dowel)}/шт. с запасом 15%`);
  if (m.prices.installPerM2 != null && m.totals.installCost > 0) parts.push(`монтаж ${rub(m.prices.installPerM2)}/м²`);
  return `<p class="hint">Цены: ${parts.join(', ')}.</p>`;
}

function estimateTable(m: KpModel): string {
  const t = m.totals;
  const install =
    t.installCost > 0
      ? `<tr class="group"><td colspan="4">Работы</td></tr>
      <tr>
        <td>Монтаж панелей<span class="muted"> · ${area(m.areaM2)}</span></td>
        <td class="num">${area(m.areaM2)}</td><td class="num">${m.prices.installPerM2 != null ? `${rub(m.prices.installPerM2)}/м²` : '—'}</td><td class="num">${rub(t.installCost)}</td>
      </tr>`
      : '';
  return `<table class="table">
    <thead>
      <tr><th>Позиция</th><th class="num">Кол-во</th><th class="num">Цена</th><th class="num">Сумма</th></tr>
    </thead>
    <tbody>
      <tr class="group"><td colspan="4">Материалы</td></tr>
      <tr>
        <td>Панели MultiFrame<span class="muted"> · РРЦ</span></td>
        <td class="num">${num(t.panels)} шт.</td><td class="num">${rub(m.prices.panel)}</td><td class="num">${rub(t.panelsCost)}</td>
      </tr>
      <tr>
        <td>Дюбели<span class="muted"> · запас 15%</span></td>
        <td class="num">${num(t.dowels)} шт.</td><td class="num">${m.prices.dowel != null ? rub(m.prices.dowel) : '—'}</td><td class="num">${rub(t.dowelsCost)}</td>
      </tr>
      ${install}
    </tbody>
  </table>
  <div class="total-bar">
    <span class="k">Итого по объекту</span>
    <span class="v" data-kp-total>${rub(t.total)}</span>
  </div>`;
}

export function buildKpHtml(m: KpModel, a: KpAssets): string {
  const managerName = m.manager?.name || '';
  const by = [m.companyName ? `<b>${esc(m.companyName)}</b>` : '', managerName ? `менеджер ${esc(managerName)}` : '']
    .filter(Boolean)
    .join(' · ');
  const contact = [managerName, m.companyName].filter(Boolean).join(' · ');
  const roomCount = m.rooms.length;
  // Одна комната: «О материале» на первую страницу — иначе снизу большая пустота.
  // При 2+ комнатах блоки 05–07 остаются на второй (иначе обрезаются).
  const page1HasAbout = roomCount <= 1;
  const page1HasPillars = false;
  const pageDensity = roomCount <= 1 ? 'balanced' : roomCount <= 3 ? 'comfortable' : 'dense';

  const aboutBlock = `<h2><span class="h2-idx">05</span>О материале</h2>
  <div class="about">
    <img src="${a.panel}" alt="Панель MultiFrame" />
    <div>
      <h3>Что такое MultiFrame</h3>
      ${a.about.map((p) => `<p>${esc(p)}</p>`).join('\n      ')}
    </div>
  </div>`;

  const pillarsBlock = `<h2><span class="h2-idx">06</span>Уникальность системы</h2>
  <ul class="pillars">${a.pillars.map((p) => `<li><span class="t">${esc(p.title)}</span><span class="d">${esc(p.text)}</span></li>`).join('')}</ul>`;

  const nextBlock = `<h2><span class="h2-idx">07</span>Что дальше</h2>
  <div class="next">
    <div class="next-card">
      <h3>Шаги</h3>
      <ol>
        <li>Замер на объекте и уточнение схемы.</li>
        <li>Согласование состава и сроков.</li>
        <li>Монтаж панелей и натяжного потолка.</li>
      </ol>
      ${contact ? `<div class="contact-line">${esc(contact)}</div>` : ''}
      ${m.manager?.phone ? `<p class="phone-line" data-kp-phone>${esc(m.manager.phone)}</p>` : ''}
    </div>
    <div class="next-card">
      <div class="qr-mini">
        <img src="${a.qr.site}" alt="QR сайта" />
        <div><div class="k">Сайт</div><div class="t">stp-multiframe.ru</div><div class="u">Официальный сайт MultiFrame</div></div>
      </div>
    </div>
    <div class="next-card">
      <div class="qr-mini">
        <img src="${a.qr.calc}" alt="QR калькулятора" />
        <div><div class="k">Калькулятор</div><div class="t">Рассчитать количество</div><div class="u">Подбор комплектации под объект</div></div>
      </div>
    </div>
  </div>`;

  const page2Lead = [
    page1HasAbout ? '' : aboutBlock,
    page1HasPillars ? '' : pillarsBlock,
    nextBlock,
  ]
    .filter(Boolean)
    .join('\n  ');

  return `<!DOCTYPE html>
<html lang="ru"><head><meta charset="utf-8" /><title>Коммерческое предложение · ${esc(m.number)}</title>
<style>${KP_CSS}</style></head><body>
<section class="page" data-page="1" data-density="${pageDensity}">
  ${chrome(m, a)}
  <div class="hero">
    <h1>Коммерческое предложение</h1>
    <p class="sub">${by ? `Подготовлено: ${by} · ` : ''}звукоизоляция потолка MultiFrame</p>
  </div>
  <h2><span class="h2-idx">01</span>Сводка по объекту</h2>
  <div class="summary">
    <div class="cell"><span class="k">Комнат</span><span class="v">${m.rooms.length}</span></div>
    <div class="cell"><span class="k">Площадь</span><span class="v">${area(m.areaM2)}</span></div>
    <div class="cell"><span class="k">Тип дома</span><span class="v">${esc(m.houseLabel)}</span></div>
    <div class="cell"><span class="k">Перекрытие</span><span class="v">${esc(m.slabLabel)}</span></div>
    <div class="cell"><span class="k">Потолок</span><span class="v">${esc(m.ceilingLabel)}</span></div>
  </div>
  <h2><span class="h2-idx">02</span>Эффект MultiFrame для объекта</h2>
  ${effectBlock(m, a)}
  <h2><span class="h2-idx">03</span>Состав по комнатам</h2>
  ${roomsBlock(m)}
  ${priceHint(m)}
  <h2><span class="h2-idx">04</span>Общая смета</h2>
  ${estimateTable(m)}
  ${page1HasAbout ? aboutBlock : ''}
  ${page1HasPillars ? pillarsBlock : ''}
  ${footer(1)}
</section>
<section class="page" data-page="2" data-density="${page1HasAbout ? 'airy' : 'comfortable'}">
  ${chrome(m, a)}
  ${page2Lead}
  <div class="disclaimer">
    Это <b>ориентир для коммерческого предложения</b>, не инженерный расчёт и не гарантия цифр.
    Эффект зависит от перекрытия, типа шума и качества монтажа. Проценты — ориентировочные.
  </div>
  ${footer(2)}
</section>
</body></html>`;
}
