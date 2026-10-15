import { useEffect, useMemo, useState } from 'react';
import type { AnalyticsDashboard as DashData } from '../../../../packages/shared/partner';
import { fetchAnalyticsDashboard, periodFromDays } from './analytics';
import { usePartner } from './PartnerContext';
import styles from './partner.module.css';

type Period = 7 | 30 | null;

function formatWhen(iso: string | null): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('ru-RU');
  } catch {
    return iso;
  }
}

function objectLabel(ev: DashData['recentObjects'][number]): string {
  const o = ev.object;
  if (!o) return ev.action;
  const parts: string[] = [];
  if (o.label) parts.push(String(o.label));
  else if (o.roomType) parts.push(String(o.roomType));
  if (o.areaM2 != null) parts.push(`${o.areaM2} м²`);
  if (o.classBefore && o.classAfter) parts.push(`${o.classBefore}→${o.classAfter}`);
  if (o.panels != null) parts.push(`${o.panels} пан.`);
  if (o.mode) parts.push(String(o.mode));
  return parts.join(' · ') || ev.action;
}

export function AnalyticsDashboard({ mode }: { mode: 'admin' | 'partner' }) {
  const api = usePartner();
  const user = api.user!;
  const [period, setPeriod] = useState<Period>(7);
  const [orgFilter, setOrgFilter] = useState<string>('');
  const [data, setData] = useState<DashData | null>(null);
  const [loading, setLoading] = useState(true);

  const partnersList = useMemo(
    () => (mode === 'admin' ? api.adminListPartners() : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [mode, api, data],
  );

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const { from, to } = periodFromDays(period);
    const orgId =
      mode === 'partner'
        ? user.orgId
        : orgFilter || null;
    void fetchAnalyticsDashboard({
      mode,
      from,
      to,
      orgId,
      partnerLogin: user.login,
    }).then((dash) => {
      if (!cancelled) {
        setData(dash);
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [mode, period, orgFilter, user.orgId, user.login]);

  if (loading && !data) {
    return (
      <div className={styles.card} style={{ width: '100%' }}>
        <h2>{mode === 'admin' ? 'Дашборд' : 'Аналитика сотрудников'}</h2>
        <p className={styles.lead}>Загрузка…</p>
      </div>
    );
  }

  const dash = data!;

  return (
    <div className={styles.card} style={{ width: '100%' }}>
      <div className={styles.dashHead}>
        <div>
          <h2>{mode === 'admin' ? 'Дашборд аналитики' : 'Аналитика сотрудников'}</h2>
          <p className={styles.lead}>
            {dash.source === 'api'
              ? 'Данные с сервера'
              : 'Только этот браузер (API недоступен)'}
            {period != null ? ` · ${period} дн.` : ' · всё время'}
          </p>
        </div>
        <div className={styles.dashFilters}>
          {([7, 30, null] as Period[]).map((p) => (
            <button
              key={String(p)}
              type="button"
              className={period === p ? styles.primary : styles.ghost}
              onClick={() => setPeriod(p)}
            >
              {p == null ? 'Всё' : `${p} дн.`}
            </button>
          ))}
        </div>
      </div>

      {mode === 'admin' ? (
        <label className={styles.field}>
          Партнёр
          <select
            value={orgFilter}
            onChange={(e) => setOrgFilter(e.target.value)}
          >
            <option value="">Все</option>
            {partnersList.map((p) => (
              <option key={p.user.id} value={p.user.orgId || ''}>
                {p.org?.settings.companyName || p.user.displayName}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      <div className={styles.kpiRow}>
        {mode === 'admin' ? (
          <div className={styles.kpi}>
            <span className={styles.kpiLabel}>Партнёры</span>
            <strong>{dash.kpi.partners}</strong>
          </div>
        ) : null}
        <div className={styles.kpi}>
          <span className={styles.kpiLabel}>Сотрудники</span>
          <strong>{dash.kpi.executors}</strong>
        </div>
        <div className={styles.kpi}>
          <span className={styles.kpiLabel}>Расчёты PM</span>
          <strong>{dash.kpi.problemomerResults}</strong>
        </div>
        <div className={styles.kpi}>
          <span className={styles.kpiLabel}>Расчёты кальк.</span>
          <strong>{dash.kpi.calculatorDone}</strong>
        </div>
        <div className={styles.kpi}>
          <span className={styles.kpiLabel}>PDF</span>
          <strong>{dash.kpi.pdf}</strong>
        </div>
        <div className={styles.kpi}>
          <span className={styles.kpiLabel}>Входы</span>
          <strong>{dash.kpi.logins}</strong>
        </div>
      </div>

      {mode === 'admin' ? (
        <>
          <h3 className={styles.dashSub}>Партнёры</h3>
          <div className={styles.table}>
            {dash.partners.map((p) => (
              <div key={p.orgId || p.companyName} className={styles.tableRow}>
                <div>
                  <strong>{p.companyName}</strong>
                  <div className={styles.hint}>
                    входы {p.logins} · расчёты PM {p.problemomer} · расчёты кальк.{' '}
                    {p.calculator} · PDF {p.pdf}
                  </div>
                </div>
                <span className={styles.hint}>{formatWhen(p.lastActiveAt)}</span>
              </div>
            ))}
            {!dash.partners.length ? <p className={styles.lead}>Пока нет данных</p> : null}
          </div>
        </>
      ) : (
        <>
          <h3 className={styles.dashSub}>Сотрудники</h3>
          <div className={styles.table}>
            {dash.executors.map((ex) => (
              <div key={ex.userId || ex.login} className={styles.tableRow}>
                <div>
                  <strong>{ex.displayName}</strong>
                  <div className={styles.hint}>
                    {ex.login} · входы {ex.logins} · расчёты PM {ex.problemomer} · расчёты
                    кальк. {ex.calculator} · PDF {ex.pdf} · объекты {ex.results}
                  </div>
                </div>
                <span className={styles.hint}>{formatWhen(ex.lastActiveAt)}</span>
              </div>
            ))}
            {!dash.executors.length ? (
              <p className={styles.lead}>Пока нет активности сотрудников</p>
            ) : null}
          </div>
        </>
      )}

      <h3 className={styles.dashSub}>
        {mode === 'admin' ? 'Последние объекты' : 'Объекты команды'}
      </h3>
      <ul className={styles.activity}>
        {dash.recentObjects.map((ev) => (
          <li key={ev.id}>
            <span>{formatWhen(ev.at)}</span> · {ev.companyName || '—'} · {ev.login} ·{' '}
            {ev.tool}/{ev.action}
            {ev.object ? ` — ${objectLabel(ev)}` : ''}
          </li>
        ))}
      </ul>
      {!dash.recentObjects.length ? <p className={styles.lead}>Объектов пока нет</p> : null}
    </div>
  );
}
