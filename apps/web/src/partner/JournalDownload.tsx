import { useState } from 'react';
import type { OrgSettings } from '../../../../packages/shared/partner';
import { fetchAnalyticsDashboard, rangeFromYmd, ymdShift } from './analytics';
import { downloadJournalWorkbook } from './journalExport';
import { PeriodCalendar } from './PeriodCalendar';
import { usePartner } from './PartnerContext';
import styles from './partner.module.css';

type PartnerOption = {
  user: { id: string; orgId: string | null; displayName: string };
  org?: { settings: OrgSettings };
};

export function JournalDownload({
  mode,
  fromYmd,
  toYmd,
  orgId,
}: {
  mode: 'admin' | 'partner';
  fromYmd: string | null;
  toYmd: string | null;
  orgId: string | null;
}) {
  const api = usePartner();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [orgChoice, setOrgChoice] = useState<string | null>(null);
  const [exportFrom, setExportFrom] = useState<string | null>(null);
  const [exportTo, setExportTo] = useState<string | null>(null);
  const [datesReady, setDatesReady] = useState(false);

  const partners: PartnerOption[] = mode === 'admin' ? api.adminListPartners() : [];

  async function run(from: string | null, to: string | null, companyId: string | null) {
    setBusy(true);
    setErr(null);
    try {
      const range = rangeFromYmd(from, to);
      const dash = await fetchAnalyticsDashboard({
        mode,
        from: range.from,
        to: range.to,
        orgId: companyId,
        partnerLogin: api.user?.login,
        journal: true,
      });
      const rows = dash.recentObjects?.length ? dash.recentObjects : dash.events;
      await downloadJournalWorkbook(rows);
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : 'Не удалось собрать файл');
    } finally {
      setBusy(false);
    }
  }

  if (mode !== 'admin') {
    return (
      <div className={styles.exportBox}>
        <button
          type="button"
          className={styles.primary}
          disabled={busy}
          onClick={() => void run(fromYmd, toYmd, orgId)}
        >
          {busy ? 'Готовим файл…' : 'Скачать журнал'}
        </button>
        <p className={styles.hint}>Excel с учётом периода на экране. Даты в файле — по Москве.</p>
        {err ? (
          <p className={styles.error} role="alert">
            {err}
          </p>
        ) : null}
      </div>
    );
  }

  const companyReady = orgChoice !== null;
  const companyId = orgChoice === 'all' ? null : orgChoice;

  return (
    <div className={styles.exportBox}>
      <p className={styles.lead}>Выгрузка журнала — три шага.</p>
      <div className={styles.exportStep}>
        <span className={styles.exportNum}>1</span>
        <label className={styles.field}>
          Компания
          <select
            value={orgChoice ?? ''}
            onChange={(e) => {
              setOrgChoice(e.target.value);
              setDatesReady(false);
              setExportFrom(null);
              setExportTo(null);
            }}
          >
            <option value="" disabled>
              Выберите компанию
            </option>
            <option value="all">Все компании</option>
            {partners.map((p) => (
              <option key={p.user.id} value={p.user.orgId || ''}>
                {p.org?.settings.companyName || p.user.displayName}
              </option>
            ))}
          </select>
        </label>
      </div>
      {companyReady ? (
        <div className={styles.exportStep}>
          <span className={styles.exportNum}>2</span>
          <div className={styles.field}>
            Диапазон дат
            <PeriodCalendar
              fromYmd={exportFrom}
              toYmd={exportTo}
              onChange={(from, to) => {
                setExportFrom(from);
                setExportTo(to);
                setDatesReady(true);
              }}
            />
            {!datesReady ? (
              <span className={styles.hint}>
                Откройте календарь. Быстрый период: 7 дней с {ymdShift(-6)}.
              </span>
            ) : null}
          </div>
        </div>
      ) : null}
      {companyReady && datesReady ? (
        <div className={styles.exportStep}>
          <span className={styles.exportNum}>3</span>
          <button
            type="button"
            className={styles.primary}
            disabled={busy}
            onClick={() => void run(exportFrom, exportTo, companyId)}
          >
            {busy ? 'Готовим файл…' : 'Скачать журнал'}
          </button>
        </div>
      ) : null}
      {err ? (
        <p className={styles.error} role="alert">
          {err}
        </p>
      ) : null}
    </div>
  );
}
