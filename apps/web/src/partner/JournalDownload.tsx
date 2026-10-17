import { useState } from 'react';
import type { OrgSettings } from '../../../../packages/shared/partner';
import { fetchAnalyticsDashboard, formatPeriodLabel, rangeFromYmd } from './analytics';
import { downloadJournalWorkbook } from './journalExport';
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

  const partners: PartnerOption[] = mode === 'admin' ? api.adminListPartners() : [];
  const period = formatPeriodLabel(fromYmd, toYmd);
  const company =
    mode !== 'admin'
      ? api.user?.org?.companyName || api.user?.displayName || 'Компания'
      : orgId
        ? partners.find((p) => p.user.orgId === orgId)?.org?.settings.companyName ||
          partners.find((p) => p.user.orgId === orgId)?.user.displayName ||
          'Компания'
        : 'Все компании';

  async function run() {
    setBusy(true);
    setErr(null);
    try {
      const range = rangeFromYmd(fromYmd, toYmd);
      const dash = await fetchAnalyticsDashboard({
        mode,
        from: range.from,
        to: range.to,
        orgId,
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

  return (
    <div className={styles.exportBox}>
      <p className={styles.lead}>
        {company} · {period}
      </p>
      <button type="button" className={styles.primary} disabled={busy} onClick={() => void run()}>
        {busy ? 'Готовим файл…' : 'Скачать журнал (Excel)'}
      </button>
      {err ? (
        <p className={styles.error} role="alert">
          {err}
        </p>
      ) : null}
    </div>
  );
}
