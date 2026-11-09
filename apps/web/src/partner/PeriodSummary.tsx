import { useEffect, useMemo, useState } from 'react';
import {
  buildPartnerComparison,
  buildPeriodSummary,
  formatRub,
  type PartnerComparisonRow,
  type PartnerTrend,
  type SummaryConclusion,
} from '../../../../packages/shared/periodSummary';
import { fetchPeriodSummary, formatPeriodLabel, ymdLocal, type ServerPeriodSummary } from './analytics';
import styles from './partner.module.css';

/** Что показываем: собранная сводка, откуда она и с чем сравнивали. */
export type PeriodSummaryView = {
  conclusions: SummaryConclusion[];
  previousLabel: string | null;
  partners: { rows: PartnerComparisonRow[]; conclusions: SummaryConclusion[] } | null;
  source: 'server' | 'local';
};

const TONE_LABEL: Record<SummaryConclusion['tone'], string> = {
  bad: 'Требует внимания',
  neutral: 'К сведению',
  good: 'Хорошо',
  info: 'Мало данных',
};

function prevLabel(range: { from: string; to: string } | null): string | null {
  if (!range) return null;
  return formatPeriodLabel(ymdLocal(new Date(range.from)), ymdLocal(new Date(range.to)));
}

/**
 * Сводка за период. Если данные пришли с сервера, сводку тоже считает сервер (там проверяются права).
 * Иначе (демо, сервер недоступен) — тот же набор правил прямо в браузере по уже загруженным данным.
 */
export function usePeriodSummary(input: {
  mode: 'admin' | 'partner';
  rooms: ReadonlyArray<object>;
  events: ReadonlyArray<object>;
  users: ReadonlyArray<object>;
  from: string | null;
  to: string | null;
  orgId: string | null;
  orgs: ReadonlyArray<{ id: string; name: string; city?: string }>;
  preferServer: boolean;
}): PeriodSummaryView | null {
  const { mode, rooms, events, users, from, to, orgId, orgs, preferServer } = input;
  const local = useMemo<PeriodSummaryView>(() => {
    const summary = buildPeriodSummary({ rooms, events, users, from, to });
    const partners =
      mode === 'admin'
        ? buildPartnerComparison({
            orgs: orgId ? orgs.filter((o) => o.id === orgId) : orgs,
            rooms,
            events,
            from,
            to,
          })
        : null;
    return { conclusions: summary.conclusions, previousLabel: prevLabel(summary.previousRange), partners, source: 'local' };
  }, [mode, rooms, events, users, from, to, orgId, orgs]);

  const [server, setServer] = useState<{ key: string; data: ServerPeriodSummary | null } | null>(null);
  const key = `${from}|${to}|${orgId || ''}`;
  useEffect(() => {
    if (!preferServer) return undefined;
    let cancelled = false;
    void fetchPeriodSummary({ from, to, orgId }).then((data) => {
      if (!cancelled) setServer({ key, data });
    });
    return () => {
      cancelled = true;
    };
  }, [preferServer, from, to, orgId, key]);

  if (preferServer && server?.key === key && server.data) {
    return {
      conclusions: server.data.conclusions,
      previousLabel: prevLabel(server.data.previousRange),
      partners: server.data.partners,
      source: 'server',
    };
  }
  return local;
}

function ConclusionList({ items, kind }: { items: SummaryConclusion[]; kind: string }) {
  return (
    <ol className={styles.summaryList} data-summary-list={kind}>
      {items.map((c) => (
        <li key={c.id} className={styles.summaryItem} data-conclusion={c.id} data-tone={c.tone}>
          <span className={styles.summaryTone} data-tone={c.tone}>
            {TONE_LABEL[c.tone]}
          </span>
          <p className={styles.summaryText}>{c.text}</p>
          <p className={styles.summaryAction}>
            <strong>Что сделать:</strong> {c.action}
          </p>
        </li>
      ))}
    </ol>
  );
}

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch] || ch);
}

const TREND_TEXT: Record<'up' | 'down' | 'flat', { arrow: string; label: string }> = {
  up: { arrow: '↑', label: 'растёт' },
  down: { arrow: '↓', label: 'падает' },
  flat: { arrow: '→', label: 'без изменений' },
};

function trendArrow(trend: PartnerTrend): string {
  return trend ? TREND_TEXT[trend].arrow : '';
}

function daysText(days: number | null): string {
  if (days == null) return '—';
  return String(days).replace('.', ',');
}

function activityText(row: PartnerComparisonRow): string {
  if (row.inactiveDays == null) return 'нет данных';
  if (row.inactiveDays <= 0) return 'сегодня';
  return `${row.inactiveDays} дн. назад`;
}

/** Страница для печати: без меню и кнопок, её же можно сохранить в PDF из окна печати. */
export function summaryPrintHtml(opts: {
  title: string;
  periodLabel: string;
  view: PeriodSummaryView;
}): string {
  const { title, periodLabel, view } = opts;
  const list = (items: SummaryConclusion[]) =>
    `<ol>${items
      .map(
        (c) =>
          `<li class="${c.tone}"><b>${escapeHtml(TONE_LABEL[c.tone])}.</b> ${escapeHtml(c.text)}<br><i>Что сделать:</i> ${escapeHtml(c.action)}</li>`,
      )
      .join('')}</ol>`;
  const table = view.partners?.rows.length
    ? `<h2>Сравнение партнёров</h2><table><thead><tr><th>Партнёр</th><th>Комнаты</th><th>До КП</th><th>Завершено</th><th>Сумма</th><th>Срок сделки, дн.</th><th>Отказы</th><th>Активность</th></tr></thead><tbody>${view.partners.rows
        .map(
          (r) =>
            `<tr><td>${escapeHtml(r.name)}</td><td>${r.rooms} ${trendArrow(r.trendRooms)}</td><td>${r.quotePct == null ? '—' : `${r.quotePct}%`}</td><td>${r.completed}</td><td>${escapeHtml(formatRub(r.salesSum))} ${trendArrow(r.trendSales)}</td><td>${daysText(r.avgCycleDays)}</td><td>${r.refusedPct == null ? '—' : `${r.refusedPct}%`}</td><td>${escapeHtml(activityText(r))}</td></tr>`,
        )
        .join('')}</tbody></table>`
    : '';
  return `<!doctype html><html lang="ru"><head><meta charset="utf-8"><title>${escapeHtml(title)}</title><style>
body{font:14px/1.45 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color:#111;margin:24px;max-width:900px}
h1{font-size:20px;margin:0 0 4px}h2{font-size:16px;margin:20px 0 8px}p.meta{color:#555;margin:0 0 16px}
ol{padding-left:20px}li{margin:0 0 10px}li.bad b{color:#9f2c24}li.good b{color:#0d5c45}
table{border-collapse:collapse;width:100%;font-size:12px}th,td{border:1px solid #ccc;padding:4px 6px;text-align:left}
@media print{body{margin:12mm}}
</style></head><body><h1>${escapeHtml(title)}</h1><p class="meta">${escapeHtml(periodLabel)}${
    view.previousLabel ? ` · сравнение с периодом ${escapeHtml(view.previousLabel)}` : ''
  }</p>${list(view.conclusions)}${
    view.partners ? `<h2>Партнёры</h2>${list(view.partners.conclusions)}` : ''
  }${table}</body></html>`;
}

function openPrint(html: string) {
  const win = window.open('', '_blank');
  if (!win) return;
  win.document.open();
  win.document.write(html);
  win.document.close();
  win.focus();
  // Печать после отрисовки; в окне печати можно выбрать «Сохранить как PDF».
  win.setTimeout(() => win.print(), 300);
}

export function PeriodSummaryBlock({
  view,
  periodLabel,
  mode,
  onOpenPartners,
}: {
  view: PeriodSummaryView;
  periodLabel: string;
  mode: 'admin' | 'partner';
  onOpenPartners?: () => void;
}) {
  const title = mode === 'admin' ? 'Сводка по сети за период' : 'Сводка за период';
  return (
    <section className={styles.summaryBlock} aria-labelledby="period-summary-title" data-period-summary data-source={view.source}>
      <div className={styles.summaryHead}>
        <div>
          <h3 id="period-summary-title" className={styles.summaryTitle}>
            {title}
          </h3>
          <p className={styles.hint}>
            {periodLabel}
            {view.previousLabel ? ` · сравнение с периодом ${view.previousLabel}` : ' · без сравнения: выбрано всё время'}
          </p>
        </div>
        <button
          type="button"
          className={styles.ghost}
          onClick={() => openPrint(summaryPrintHtml({ title, periodLabel, view }))}
          aria-label="Распечатать сводку или сохранить в PDF"
        >
          Печать
        </button>
      </div>
      <ConclusionList items={view.conclusions} kind="main" />
      {view.partners ? (
        <>
          <h4 className={styles.funnelTitle}>Партнёры</h4>
          <ConclusionList items={view.partners.conclusions} kind="partners" />
          {onOpenPartners ? (
            <button type="button" className={`${styles.ghost} ${styles.summaryLinkBtn}`} onClick={onOpenPartners}>
              Сравнение партнёров
            </button>
          ) : null}
        </>
      ) : null}
    </section>
  );
}

function TrendCell({ value, trend }: { value: string; trend: PartnerTrend }) {
  return (
    <>
      {value}
      {trend ? (
        <span
          className={trend === 'up' ? styles.kpiUp : trend === 'down' ? styles.kpiDown : styles.kpiFlat}
          aria-label={`к прошлому периоду: ${TREND_TEXT[trend].label}`}
          title={`к прошлому периоду: ${TREND_TEXT[trend].label}`}
        >
          {' '}
          {TREND_TEXT[trend].arrow}
        </span>
      ) : null}
    </>
  );
}

/** Таблица сравнения партнёров у админа StP. Стрелки — к прошлому периоду той же длины. */
export function PartnerComparisonTable({ rows }: { rows: PartnerComparisonRow[] }) {
  if (!rows.length) return <p className={styles.lead}>Партнёров пока нет</p>;
  return (
    <div className={styles.dashTableScroll} data-partner-comparison>
      <table className={styles.dashTable}>
        <thead>
          <tr>
            <th>Партнёр</th>
            <th>Комнаты</th>
            <th>Проблемомер</th>
            <th>До КП</th>
            <th>Завершено</th>
            <th>Сумма</th>
            <th>Срок сделки, дн.</th>
            <th>Отказы</th>
            <th>Активность</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.orgId} data-partner-row={r.orgId}>
              <td data-label="Партнёр">
                {r.name}
                {r.city ? <span className={styles.hint}> · {r.city}</span> : null}
              </td>
              <td data-label="Комнаты">
                <TrendCell value={String(r.rooms)} trend={r.trendRooms} />
              </td>
              <td data-label="Проблемомер">
                <TrendCell value={String(r.problemomer)} trend={r.trendActivity} />
              </td>
              <td data-label="До КП">{r.quotePct == null ? '—' : `${r.quotePct}%`}</td>
              <td data-label="Завершено">{r.completed}</td>
              <td data-label="Сумма">
                <TrendCell value={formatRub(r.salesSum)} trend={r.trendSales} />
              </td>
              <td data-label="Срок сделки, дн.">{daysText(r.avgCycleDays)}</td>
              <td data-label="Отказы">{r.refusedPct == null ? '—' : `${r.refusedPct}%`}</td>
              <td data-label="Активность">{activityText(r)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
