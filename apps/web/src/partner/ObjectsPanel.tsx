import { useEffect, useMemo, useRef, useState } from 'react';
import {
  JOB_OBJECT_STATUS_LABELS,
  ROLE_LABELS,
  canAssignObjects,
  canCreateObjects,
  canDeleteObjects,
  canSeePrices,
  type JobObject,
  type JobObjectStatus,
  type UserRole,
} from '../../../../packages/shared/partner';
import { formatRub } from './estimate';
import { RiseItem, StatusSwap, usePrefersReducedMotion } from './motionBits';
import { usePartner } from './PartnerContext';
import styles from './partner.module.css';

const STATUSES: JobObjectStatus[] = ['draft', 'measured', 'quote_sent', 'install', 'closed'];

function telHref(phone: string): string {
  return `tel:${phone.replace(/[^\d+]/g, '')}`;
}

function StatusBadge({ status }: { status: JobObjectStatus }) {
  return (
    <StatusSwap statusKey={status} className={styles.badge}>
      {JOB_OBJECT_STATUS_LABELS[status]}
    </StatusSwap>
  );
}

export function ObjectsPanel({
  compact,
  onCreate,
}: {
  compact?: boolean;
  onCreate?: () => void;
}) {
  const api = usePartner();
  const user = api.user!;
  const reduce = usePrefersReducedMotion();
  const seePrices = canSeePrices(user.role);
  const canAssign = canAssignObjects(user.role);
  const canDelete = canDeleteObjects(user.role);
  const canCreate = canCreateObjects(user.role);
  const staff = api.partnerListStaff();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<JobObjectStatus | 'all'>(
    user.role === 'crew' ? 'install' : 'all',
  );
  const [pendingId, setPendingId] = useState<string | null>(null);
  const detailRef = useRef<HTMLDivElement>(null);

  const counts = useMemo(() => {
    const map = Object.fromEntries(STATUSES.map((s) => [s, 0])) as Record<JobObjectStatus, number>;
    for (const obj of api.objects) map[obj.status] += 1;
    return map;
  }, [api.objects]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return api.objects.filter((obj) => {
      if (statusFilter !== 'all' && obj.status !== statusFilter) return false;
      if (!q) return true;
      const hay = [obj.clientName, obj.address, obj.city, obj.clientPhone, JOB_OBJECT_STATUS_LABELS[obj.status]]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return hay.includes(q);
    });
  }, [api.objects, query, statusFilter]);

  const selected = useMemo(
    () => api.objects.find((o) => o.id === selectedId) || null,
    [api.objects, selectedId],
  );

  useEffect(() => {
    if (!selectedId || !detailRef.current) return;
    detailRef.current.scrollIntoView({
      behavior: reduce ? 'auto' : 'smooth',
      block: 'nearest',
    });
  }, [selectedId, reduce]);

  async function patch(obj: JobObject, next: Partial<JobObject>) {
    setMsg(null);
    setErr(null);
    setPendingId(obj.id);
    try {
      const saved = await api.saveObject({ ...obj, ...next, id: obj.id });
      setSelectedId(saved.id);
      setMsg('Сохранено');
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Ошибка');
    } finally {
      setPendingId(null);
    }
  }

  async function remove(obj: JobObject) {
    const label = obj.clientName || obj.address || 'объект';
    if (!window.confirm(`Удалить «${label}»? Это действие нельзя отменить.`)) return;
    setMsg(null);
    setErr(null);
    try {
      await api.deleteObject(obj.id);
      setSelectedId(null);
      setMsg('Объект удалён');
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Не удалось удалить');
    }
  }

  const reminder =
    user.role === 'crew'
      ? counts.install
        ? `${counts.install} в монтаже — закройте объект, когда потолок готов`
        : 'Нет объектов в монтаже'
      : counts.quote_sent
        ? `${counts.quote_sent} КП ждут следующего шага`
        : counts.draft
          ? `${counts.draft} ещё в черновике`
          : null;

  const allowedStatuses = (current: JobObjectStatus) =>
    STATUSES.filter((s) => {
      if (user.role === 'crew') return s === 'install' || s === 'closed' || s === current;
      return true;
    });

  const filters: Array<JobObjectStatus | 'all'> =
    user.role === 'crew' ? ['install', 'closed', 'all'] : ['all', ...STATUSES];

  return (
    <div className={`${styles.card} ${styles.panelCard}`}>
      <h2>{user.role === 'crew' ? 'Задания на монтаж' : 'Объекты'}</h2>
      <p className={styles.lead}>
        {user.role === 'crew'
          ? 'Количество панелей и крепежа без цен. Статус меняется крупными кнопками.'
          : 'Замеры, КП и монтаж в одной карточке. Работает офлайн — синхронизация при появлении сети.'}
      </p>
      {reminder ? (
        <p className={styles.reminder} role="status">
          {reminder}
        </p>
      ) : null}
      {api.pendingSyncCount > 0 ? (
        <p className={styles.flash} role="status">
          Ожидают отправки: {api.pendingSyncCount}.{' '}
          <button type="button" className={styles.ghost} onClick={() => void api.flushObjectQueue()}>
            Синхронизировать
          </button>
        </p>
      ) : null}

      <label className={styles.searchField}>
        <span className={styles.srOnly}>Поиск объекта</span>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Имя, адрес или телефон"
          inputMode="search"
          enterKeyHint="search"
        />
      </label>

      <div className={styles.chipRow} role="toolbar" aria-label="Фильтр по статусу">
        {filters.map((id) => {
          const on = statusFilter === id;
          const label = id === 'all' ? 'Все' : JOB_OBJECT_STATUS_LABELS[id];
          const n = id === 'all' ? api.objects.length : counts[id];
          return (
            <button
              key={id}
              type="button"
              className={on ? styles.chipOn : styles.chip}
              aria-pressed={on}
              onClick={() => setStatusFilter(id)}
            >
              {label} · {n}
            </button>
          );
        })}
      </div>

      {api.objectsLoading && !api.objects.length ? (
        <div className={styles.objectList} aria-busy="true" aria-label="Загрузка объектов">
          <div className={`${styles.skeleton} ${styles.skeletonRow}`} />
          <div className={`${styles.skeleton} ${styles.skeletonRow}`} />
          <div className={`${styles.skeleton} ${styles.skeletonRow}`} />
        </div>
      ) : (
        <div className={styles.objectList}>
          {visible.map((obj, index) => (
            <RiseItem key={obj.id} index={index}>
              <button
                type="button"
                className={selectedId === obj.id ? styles.objectRowOn : styles.objectRow}
                onClick={() => setSelectedId(obj.id)}
              >
                <span className={styles.objectMain}>
                  <strong>
                    {obj.clientName || 'Без имени'}
                    {obj.pendingSync ? ' · ↻' : ''}
                  </strong>
                  <span className={styles.hint}>
                    {obj.address || 'Адрес не указан'}
                    {obj.city ? ` · ${obj.city}` : ''}
                    {obj.room.areaM2 ? ` · ${obj.room.areaM2} м²` : ''}
                  </span>
                </span>
                <StatusBadge status={obj.status} />
              </button>
            </RiseItem>
          ))}
          {!visible.length ? (
            <div className={styles.emptyState}>
              <p className={styles.lead}>
                {api.objects.length
                  ? 'Ничего не нашлось по этому фильтру.'
                  : compact
                    ? 'Пока нет объектов. Сохраните замер из проблемомера.'
                    : user.role === 'crew'
                      ? 'Пока нет заданий.'
                      : 'Пока нет объектов.'}
              </p>
              {api.objects.length ? (
                <button
                  type="button"
                  className={styles.ghost}
                  onClick={() => {
                    setQuery('');
                    setStatusFilter(user.role === 'crew' ? 'install' : 'all');
                  }}
                >
                  Сбросить фильтр
                </button>
              ) : canCreate && onCreate ? (
                <button type="button" className={styles.primary} onClick={onCreate}>
                  Открыть проблемомер
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
      )}

      {selected ? (
        <div className={styles.objectDetail} ref={detailRef}>
          <h3>
            {selected.clientName || 'Объект'} · {JOB_OBJECT_STATUS_LABELS[selected.status]}
          </h3>
          <p className={styles.lead}>
            {[selected.address, selected.city].filter(Boolean).join(' · ') || 'Адрес не заполнен'}
          </p>
          {selected.clientPhone ? (
            <a className={styles.callLink} href={telHref(selected.clientPhone)}>
              Позвонить {selected.clientPhone}
            </a>
          ) : (
            <p className={styles.hint}>Телефон не указан</p>
          )}
          {selected.estimate ? (
            <div className={styles.grid2}>
              <div className={styles.field}>
                Панели
                <strong>{selected.estimate.panels} шт.</strong>
              </div>
              <div className={styles.field}>
                Дюбели
                <strong>{selected.estimate.dowels} шт.</strong>
              </div>
              {seePrices && selected.estimate.totalCost != null ? (
                <div className={styles.field}>
                  Итого КП
                  <strong>{formatRub(selected.estimate.totalCost)}</strong>
                </div>
              ) : null}
            </div>
          ) : (
            <p className={styles.hint}>Смета ещё не посчитана</p>
          )}

          <div className={styles.field}>
            Статус
            <div className={styles.chipRow} role="group" aria-label="Сменить статус">
              {allowedStatuses(selected.status).map((s) => (
                <button
                  key={s}
                  type="button"
                  className={selected.status === s ? styles.chipOn : styles.chip}
                  aria-pressed={selected.status === s}
                  disabled={pendingId === selected.id}
                  onClick={() => {
                    if (s !== selected.status) void patch(selected, { status: s });
                  }}
                >
                  {JOB_OBJECT_STATUS_LABELS[s]}
                </button>
              ))}
            </div>
          </div>

          {canAssign && staff.length ? (
            <label className={styles.field}>
              Исполнитель
              <select
                value={selected.assignedTo || ''}
                disabled={pendingId === selected.id}
                onChange={(e) => void patch(selected, { assignedTo: e.target.value || null })}
              >
                <option value="">Не назначен</option>
                {staff.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.displayName} · {ROLE_LABELS[s.role as UserRole] || s.role}
                  </option>
                ))}
              </select>
            </label>
          ) : null}

          {selected.clientSummary && seePrices ? (
            <div className={styles.field}>
              Сводка для клиента
              <pre className={styles.summaryBox}>{selected.clientSummary}</pre>
              <button
                type="button"
                className={styles.ghost}
                onClick={() => {
                  const clip = navigator.clipboard;
                  if (!clip) {
                    setErr('Не удалось скопировать');
                    return;
                  }
                  void clip.writeText(selected.clientSummary).then(
                    () => setMsg('Сводка скопирована'),
                    () => setErr('Не удалось скопировать'),
                  );
                }}
              >
                Скопировать сводку
              </button>
            </div>
          ) : null}

          {selected.history?.length ? (
            <div className={styles.hint}>
              История:{' '}
              {selected.history
                .slice(0, 3)
                .map((h) => `${h.login}: ${h.action}${h.detail ? ` (${h.detail})` : ''}`)
                .join(' · ')}
            </div>
          ) : null}

          {canDelete ? (
            <div className={styles.navRow}>
              <button type="button" className={styles.danger} onClick={() => void remove(selected)}>
                Удалить объект
              </button>
            </div>
          ) : null}

          {msg ? (
            <p className={styles.flash} role="status">
              {msg}
            </p>
          ) : null}
          {err ? (
            <p className={styles.error} role="alert">
              {err}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
