import { useEffect, useMemo, useState } from 'react';
import type { AnalyticsDashboard, SupportCase } from '../../../../packages/shared/partner';
import { INSUFFICIENT_OBSERVATIONS_LABEL } from '../../../../packages/shared/events';
import { SUPPORT_CATEGORY_LABELS } from '../../../../packages/shared/support';
import { apiListDeals, apiListSupportCases, hasRemoteApi, type ApiDeal } from './apiClient';
import { fetchAnalyticsDashboard } from './analytics';
import { SupportRequestButton } from './SupportRequestButton';
import { SignalsList } from './signals/SignalsList';
import {
  MIN_RELIABLE_SAMPLE,
  dealsToFunnel,
  diagnose,
  toolCountsFromAnalytics,
} from './signals/diagnose';
import { loadLocalSupportCases } from './signals/supportRequest';
import styles from './partner.module.css';

export type PartnerCardPartner = {
  orgId: string | null;
  companyName: string;
  city?: string;
  /** Логин владельца партнёра — контакт партнёра, не клиента. */
  login?: string;
  lastLogin?: string | null;
  executorCount?: number;
};

export type PartnerCardTab = 'overview' | 'stages' | 'tools' | 'training' | 'support' | 'dynamics';

const TABS: ReadonlyArray<{ id: PartnerCardTab; label: string }> = [
  { id: 'overview', label: 'Обзор' },
  { id: 'stages', label: 'Этапы' },
  { id: 'tools', label: 'Инструменты' },
  { id: 'training', label: 'Обучение' },
  { id: 'support', label: 'Поддержка' },
  { id: 'dynamics', label: 'Динамика' },
];

const STAGE_ROWS: ReadonlyArray<{ id: string; label: string }> = [
  { id: 'contact', label: 'Контакт' },
  { id: 'offered', label: 'Предложено' },
  { id: 'assessed', label: 'Замер / оценка' },
  { id: 'calculated', label: 'Расчёт' },
  { id: 'quote_created', label: 'КП создано' },
  { id: 'quote_shared', label: 'КП передано' },
  { id: 'quote_sent_confirmed', label: 'Отправка подтверждена' },
  { id: 'quote_accepted', label: 'Принято' },
  { id: 'quote_declined', label: 'Отказ' },
  { id: 'quote_postponed', label: 'Отложено' },
  { id: 'install', label: 'Монтаж' },
  { id: 'closed', label: 'Закрыто' },
];

function Insufficient({ sample }: { sample: number }) {
  return (
    <p className={styles.hint}>
      {INSUFFICIENT_OBSERVATIONS_LABEL} ({sample} из {MIN_RELIABLE_SAMPLE} нужных)
    </p>
  );
}

export function PartnerCard({
  partner,
  training = null,
  onClose,
}: {
  partner: PartnerCardPartner;
  training?: { assigned: number; completed: number } | null;
  onClose?: () => void;
}) {
  const [tab, setTab] = useState<PartnerCardTab>('overview');
  const [showContacts, setShowContacts] = useState(false);
  const [dash, setDash] = useState<AnalyticsDashboard | null>(null);
  const [deals, setDeals] = useState<ApiDeal[] | null>(null);
  const [cases, setCases] = useState<SupportCase[]>([]);

  useEffect(() => {
    let live = true;
    setShowContacts(false);
    setDash(null);
    setDeals(null);
    void fetchAnalyticsDashboard({ mode: 'admin', orgId: partner.orgId })
      .then((d) => live && setDash(d))
      .catch(() => undefined);
    if (hasRemoteApi()) {
      void apiListDeals()
        .then((list) => live && setDeals(list.filter((d) => d.orgId === partner.orgId)))
        .catch(() => undefined);
      void apiListSupportCases()
        .then((list) => live && setCases(list.filter((c) => c.orgId === partner.orgId)))
        .catch(() => live && setCases(loadLocalSupportCases().filter((c) => c.orgId === partner.orgId)));
    } else {
      setCases(loadLocalSupportCases().filter((c) => c.orgId === partner.orgId));
    }
    return () => {
      live = false;
    };
  }, [partner.orgId]);

  const funnel = useMemo(() => (deals ? dealsToFunnel(deals) : null), [deals]);
  const tools = useMemo(
    () => (dash ? toolCountsFromAnalytics(dash.funnel, dash.events) : null),
    [dash],
  );
  const signals = useMemo(() => diagnose({ funnel, tools }), [funnel, tools]);

  const stageCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const d of deals || []) m.set(d.stage, (m.get(d.stage) || 0) + 1);
    return m;
  }, [deals]);
  const dealTotal = deals?.length ?? 0;

  return (
    <section className={`${styles.card} ${styles.panelCard}`} aria-label={`Карточка партнёра ${partner.companyName}`}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}>
        <div>
          <h2>{partner.companyName}</h2>
          <p className={styles.lead}>
            {partner.city || 'город не указан'}
            {partner.executorCount != null ? ` · сотрудников: ${partner.executorCount}` : ''}
          </p>
        </div>
        {onClose ? (
          <button type="button" className={styles.ghost} onClick={onClose}>
            Закрыть
          </button>
        ) : null}
      </div>

      <div className={styles.tabs} role="tablist" aria-label="Разделы карточки партнёра">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            className={tab === t.id ? styles.tabActive : styles.tab}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'overview' ? (
        <div className={styles.dashSection}>
          <div className={styles.hint}>
            {showContacts ? (
              <>Контакт партнёра: {partner.login || '—'}</>
            ) : (
              <>Контакты скрыты</>
            )}
            {' · '}
            <button type="button" className={styles.ghost} onClick={() => setShowContacts((v) => !v)}>
              {showContacts ? 'Скрыть' : 'Показать контакт партнёра'}
            </button>
          </div>
          <p className={styles.hint}>Данные конечных клиентов в карточке партнёра не отображаются.</p>
          {partner.lastLogin ? (
            <p className={styles.hint}>Последний вход: {new Date(partner.lastLogin).toLocaleDateString('ru-RU')}</p>
          ) : null}
          <SignalsList signals={signals} />
        </div>
      ) : null}

      {tab === 'stages' ? (
        <div className={styles.dashSection}>
          {deals && dealTotal > 0 ? (
            <>
              {dealTotal < MIN_RELIABLE_SAMPLE ? <Insufficient sample={dealTotal} /> : null}
              <ol className={styles.funnelSteps}>
                {STAGE_ROWS.filter((r) => stageCounts.has(r.id)).map((r) => (
                  <li key={r.id}>
                    <span className={styles.funnelLabel}>{r.label}</span>
                    <strong>{stageCounts.get(r.id)}</strong>
                  </li>
                ))}
              </ol>
            </>
          ) : (
            <p className={styles.lead}>Нет данных по сделкам: {INSUFFICIENT_OBSERVATIONS_LABEL}.</p>
          )}
        </div>
      ) : null}

      {tab === 'tools' ? (
        <div className={styles.dashSection}>
          {tools ? (
            <ul className={styles.funnelSteps}>
              <li>
                <span className={styles.funnelLabel}>Проблемомер: открытия / результаты</span>
                <strong>
                  {tools.problemomerStarted} / {tools.problemomerCompleted}
                </strong>
              </li>
              <li>
                <span className={styles.funnelLabel}>Калькулятор: открытия / расчёты</span>
                <strong>
                  {tools.calculatorStarted} / {tools.calculatorCompleted}
                </strong>
              </li>
            </ul>
          ) : (
            <p className={styles.lead}>Загрузка…</p>
          )}
          {tools && (tools.problemomerStarted || 0) + (tools.calculatorStarted || 0) < MIN_RELIABLE_SAMPLE ? (
            <Insufficient sample={(tools.problemomerStarted || 0) + (tools.calculatorStarted || 0)} />
          ) : null}
        </div>
      ) : null}

      {tab === 'training' ? (
        <div className={styles.dashSection}>
          {training && training.assigned > 0 ? (
            <>
              <p className={styles.lead}>
                Пройдено {training.completed} из {training.assigned}
              </p>
              {training.assigned < MIN_RELIABLE_SAMPLE ? <Insufficient sample={training.assigned} /> : null}
            </>
          ) : (
            <p className={styles.lead}>Нет данных об обучении: {INSUFFICIENT_OBSERVATIONS_LABEL}.</p>
          )}
          <p className={styles.hint}>Учебные действия не входят в боевые показатели продаж.</p>
        </div>
      ) : null}

      {tab === 'support' ? (
        <div className={styles.dashSection}>
          {cases.length ? (
            <ul className={styles.funnelSteps}>
              {cases.map((c) => (
                <li key={c.id}>
                  <span className={styles.funnelLabel}>
                    {SUPPORT_CATEGORY_LABELS[c.category]}
                    {c.module ? ` · ${c.module}` : ''}
                  </span>
                  <strong>{c.status}</strong>
                </li>
              ))}
            </ul>
          ) : (
            <p className={styles.lead}>Обращений нет.</p>
          )}
          <SupportRequestButton module="partner_card" orgId={partner.orgId} />
        </div>
      ) : null}

      {tab === 'dynamics' ? (
        <div className={styles.dashSection}>
          {dash && dash.series.length ? (
            <ul className={styles.funnelSteps}>
              {dash.series.slice(-14).map((p) => (
                <li key={p.day}>
                  <span className={styles.funnelLabel}>{p.day}</span>
                  <strong>
                    PM {p.problemomer} · расчёты {p.calculator} · PDF {p.pdf}
                  </strong>
                </li>
              ))}
            </ul>
          ) : (
            <p className={styles.lead}>Нет точек для динамики: {INSUFFICIENT_OBSERVATIONS_LABEL}.</p>
          )}
        </div>
      ) : null}
    </section>
  );
}
