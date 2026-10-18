import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { AnalyticsDashboard } from '../../../../../packages/shared/partner';
import {
  fetchAnalyticsDashboard,
  getAnalyticsFocusOrg,
  getAnalyticsPeriod,
  rangeFromYmd,
  setAnalyticsFocusOrg,
  setAnalyticsPeriod,
  subscribeAnalyticsFocusOrg,
  subscribeAnalyticsPeriod,
} from '../analytics';
import { PeriodCalendar } from '../PeriodCalendar';
import { usePartner } from '../PartnerContext';
import {
  ACTIVITY_METRICS,
  buildCompanyCards,
  companyCountLabel,
  formatActivityWhen,
  objectCountLabel,
  staffLabel,
  type CompanyCardModel,
  type NetworkObject,
} from './companyCards';
import styles from './PartnerNetwork.module.css';

export type NetworkCompanyLink = {
  orgId: string | null;
  userId: string;
  companyName: string;
};

type BoardProps = {
  count: number;
  companies: CompanyCardModel[];
  fromYmd: string | null;
  toYmd: string | null;
  onPeriodChange: (fromYmd: string | null, toYmd: string | null) => void;
  selectedOrgId: string;
  activityCaption: string;
  onOpenCompany: (company: CompanyCardModel) => void;
  onPartners: () => void;
  onAdd: () => void;
  onLearning: () => void;
};

function chipLabel(label: string): string {
  const head = label.split(' / ')[0];
  return head || label;
}

function StageList({ rows }: { rows: Array<{ key: string; label: string; count: number }> }) {
  return (
    <span className={styles.chips} role="list">
      {rows.map((row) => {
        const short = chipLabel(row.label);
        return (
          <span key={row.key} className={styles.chip} role="listitem" title={short === row.label ? undefined : row.label}>
            <span>{short}</span>
            <strong>{row.count}</strong>
          </span>
        );
      })}
    </span>
  );
}

function CompanyCard({
  company,
  selected,
  onOpen,
}: {
  company: CompanyCardModel;
  selected: boolean;
  onOpen: (company: CompanyCardModel) => void;
}) {
  const objects = company.objects;
  const activity = company.activity;
  const when = activity.state === 'ready' ? formatActivityWhen(activity.lastActiveAt) : null;
  return (
    <button
      type="button"
      className={styles.company}
      aria-pressed={selected}
      onClick={() => onOpen(company)}
    >
      <span className={styles.head}>
        <span className={styles.name}>{company.companyName}</span>
        <span className={styles.open}>{selected ? 'Открыта' : 'Открыть →'}</span>
      </span>
      <span className={styles.facts}>
        <span className={styles.city}>{company.city || 'Город не указан'}</span>
        <span className={styles.pill}>
          {company.staffCount == null ? 'Сотрудники не указаны' : staffLabel(company.staffCount)}
        </span>
      </span>
      <span className={styles.section}>
        {objects.state === 'unknown' ? <span className={styles.quiet}>Считаем объекты…</span> : null}
        {objects.state === 'unlinked' ? <span className={styles.quiet}>Объекты компании недоступны</span> : null}
        {objects.state === 'empty' ? <span className={styles.quiet}>Объектов нет</span> : null}
        {objects.state === 'ready' ? (
          <>
            <span className={styles.blockLabel}>По этапам · {objectCountLabel(objects.total)}</span>
            {objects.stages.length ? <StageList rows={objects.stages} /> : (
              <span className={styles.quiet}>Этап в списке объектов не указан</span>
            )}
            {objects.siteStages.length ? (
              <>
                <span className={`${styles.blockLabel} ${styles.laterLabel}`}>Стадия объекта</span>
                <StageList rows={objects.siteStages} />
              </>
            ) : null}
          </>
        ) : null}
      </span>
      <span className={styles.section}>
        <span className={styles.blockLabel}>Активность за период</span>
        {activity.state === 'unknown' ? <span className={styles.quiet}>Считаем активность…</span> : null}
        {activity.state === 'empty' ? (
          <span className={styles.quiet}>За период нет входов, расчётов и PDF</span>
        ) : null}
        {activity.state === 'ready' ? (
          <>
            <span className={styles.stats}>
              {ACTIVITY_METRICS.map((metric) => (
                <span key={metric.key} className={styles.stat}>
                  <span>{metric.label}</span>
                  <strong>{activity[metric.key]}</strong>
                </span>
              ))}
            </span>
            {when ? <span className={styles.when}>Последнее событие · {when}</span> : null}
          </>
        ) : null}
      </span>
    </button>
  );
}

export function PartnerNetworkBoard({
  count,
  companies,
  fromYmd,
  toYmd,
  onPeriodChange,
  selectedOrgId,
  activityCaption,
  onOpenCompany,
  onPartners,
  onAdd,
  onLearning,
}: BoardProps) {
  return (
    <section className={styles.board} aria-label="Управление партнёрской сетью">
      <div className={styles.intro}>
        <div className={styles.copy}>
          <p className={styles.eyebrow}>STP MultiFrame</p>
          <h2>Партнёры и поддержка команды</h2>
          <p className={styles.lead}>
            Город, сотрудники, объекты и активность за выбранный период.
          </p>
        </div>
        <div className={styles.period}>
          <PeriodCalendar
            fromYmd={fromYmd}
            toYmd={toYmd}
            onChange={onPeriodChange}
            triggerClassName={styles.periodTrigger}
          />
        </div>
      </div>
      <p className={styles.metaLine}>
        <span>{companyCountLabel(companies.length)}</span>
        <span>{activityCaption}</span>
      </p>
      {companies.length ? (
        <ul className={styles.companies}>
          {companies.map((company) => (
            <li key={company.key}>
              <CompanyCard
                company={company}
                selected={Boolean(selectedOrgId) && company.orgId === selectedOrgId}
                onOpen={onOpenCompany}
              />
            </li>
          ))}
        </ul>
      ) : (
        <div className={styles.empty}>
          <h3>В сети пока нет компаний</h3>
          <p>
            Здесь появятся город, сотрудники, объекты по этапам и активность за период.
            Пока данных нет — числа не подставляются.
          </p>
          <button type="button" className={styles.emptyButton} onClick={onAdd}>
            Создать компанию
          </button>
        </div>
      )}
      <div className={styles.actions}>
        <button type="button" className={styles.action} onClick={onPartners}>
          Партнёры · {count}
        </button>
        <button type="button" className={styles.action} onClick={onAdd}>
          Новый партнёр
        </button>
        <button type="button" className={styles.action} onClick={onLearning}>
          Обучение и материалы
        </button>
      </div>
    </section>
  );
}

function periodKey(fromYmd: string | null, toYmd: string | null): string {
  return `${fromYmd ?? ''}::${toYmd ?? ''}`;
}

export function PartnerNetworkOverview({
  count,
  onPartners,
  onAdd,
  onLearning,
  onOpenCompany,
}: {
  count: number;
  onPartners: () => void;
  onAdd: () => void;
  onLearning: () => void;
  onOpenCompany?: (company: NetworkCompanyLink) => void;
}) {
  const api = usePartner();
  const period = useSyncExternalStore(subscribeAnalyticsPeriod, getAnalyticsPeriod, getAnalyticsPeriod);
  const focusOrg = useSyncExternalStore(subscribeAnalyticsFocusOrg, getAnalyticsFocusOrg, getAnalyticsFocusOrg);
  const partners = api.adminListPartners();
  const [dash, setDash] = useState<AnalyticsDashboard | null>(null);
  const [dashKey, setDashKey] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [objectsKnown, setObjectsKnown] = useState(api.objects.length > 0);
  const objectsLoadSeen = useRef(false);

  useEffect(() => {
    if (api.objectsLoading) {
      objectsLoadSeen.current = true;
      return;
    }
    if (objectsLoadSeen.current || api.objects.length > 0) setObjectsKnown(true);
  }, [api.objectsLoading, api.objects.length]);

  useEffect(() => {
    let cancelled = false;
    const key = periodKey(period.fromYmd, period.toYmd);
    setFailed(false);
    const { from, to } = rangeFromYmd(period.fromYmd, period.toYmd);
    void fetchAnalyticsDashboard({
      mode: 'admin',
      from,
      to,
      partnerLogin: api.user?.login || null,
    }).then((next) => {
      if (cancelled) return;
      setDash(next);
      setDashKey(key);
    }).catch(() => {
      if (!cancelled) setFailed(true);
    });
    return () => {
      cancelled = true;
    };
  }, [period.fromYmd, period.toYmd, api.user?.login]);

  const fresh = dash && dashKey === periodKey(period.fromYmd, period.toYmd) ? dash : null;
  const objects: NetworkObject[] | null = !objectsKnown && api.objects.length === 0
    ? null
    : api.objects.map((object) => ({
      orgId: object.orgId,
      status: object.status,
      objectStage: object.room?.objectStage ?? null,
    }));
  const companies = buildCompanyCards({
    partners,
    objects,
    activity: fresh ? fresh.partners : null,
  });
  const activityCaption = failed
    ? 'Активность за период недоступна'
    : !fresh
      ? 'Считаем активность за период…'
      : fresh.source === 'api'
        ? 'Активность с сервера'
        : 'Активность только из этого браузера';

  return (
    <PartnerNetworkBoard
      count={count}
      companies={companies}
      fromYmd={period.fromYmd}
      toYmd={period.toYmd}
      onPeriodChange={setAnalyticsPeriod}
      selectedOrgId={focusOrg}
      activityCaption={activityCaption}
      onOpenCompany={(company) => {
        setAnalyticsFocusOrg(company.orgId);
        onOpenCompany?.({
          orgId: company.orgId,
          userId: company.userId,
          companyName: company.companyName,
        });
      }}
      onPartners={onPartners}
      onAdd={onAdd}
      onLearning={onLearning}
    />
  );
}
