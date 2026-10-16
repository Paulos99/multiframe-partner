import { useMemo, useState } from 'react';
import {
  JOB_OBJECT_STATUS_LABELS,
  ROLE_LABELS,
  canAssignObjects,
  canDeleteObjects,
  canSeePrices,
  type JobObject,
  type JobObjectStatus,
  type UserRole,
} from '../../../../packages/shared/partner';
import { formatRub } from './estimate';
import { usePartner } from './PartnerContext';
import styles from './partner.module.css';

const STATUSES: JobObjectStatus[] = [
  'draft',
  'measured',
  'quote_sent',
  'install',
  'closed',
];

export function ObjectsPanel({ compact }: { compact?: boolean }) {
  const api = usePartner();
  const user = api.user!;
  const seePrices = canSeePrices(user.role);
  const canAssign = canAssignObjects(user.role);
  const canDelete = canDeleteObjects(user.role);
  const staff = api.partnerListStaff();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const selected = useMemo(
    () => api.objects.find((o) => o.id === selectedId) || null,
    [api.objects, selectedId],
  );

  async function patch(obj: JobObject, patch: Partial<JobObject>) {
    setMsg(null);
    setErr(null);
    try {
      const next = await api.saveObject({ ...obj, ...patch, id: obj.id });
      setSelectedId(next.id);
      setMsg('Сохранено');
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Ошибка');
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

  return (
    <div className={`${styles.card} ${styles.panelCard}`}>
      <h2>{user.role === 'crew' ? 'Задания на монтаж' : 'Объекты'}</h2>
      <p className={styles.lead}>
        {user.role === 'crew'
          ? 'Количество панелей и крепежа без цен. Отметьте статус монтажа.'
          : 'Замеры, КП и монтаж в одной карточке. Работает офлайн — синхронизация при появлении сети.'}
      </p>
      {api.pendingSyncCount > 0 ? (
        <p className={styles.ok}>
          Ожидают отправки: {api.pendingSyncCount}.{' '}
          <button type="button" className={styles.ghost} onClick={() => void api.flushObjectQueue()}>
            Синхронизировать
          </button>
        </p>
      ) : null}

      <div className={styles.table}>
        {api.objects.map((obj) => (
          <button
            key={obj.id}
            type="button"
            className={styles.tableRow}
            style={{
              textAlign: 'left',
              cursor: 'pointer',
              border:
                selectedId === obj.id ? '1px solid var(--mf-green, #2ab38b)' : undefined,
            }}
            onClick={() => setSelectedId(obj.id)}
          >
            <div>
              <strong>
                {obj.clientName || 'Без имени'}
                {obj.pendingSync ? ' · ↻' : ''}
              </strong>
              <div className={styles.hint}>
                {obj.address || 'Адрес не указан'}
                {obj.city ? ` · ${obj.city}` : ''}
                {obj.room.areaM2 ? ` · ${obj.room.areaM2} м²` : ''}
              </div>
            </div>
            <div className={styles.hint}>{JOB_OBJECT_STATUS_LABELS[obj.status]}</div>
          </button>
        ))}
        {!api.objects.length ? (
          <p className={styles.lead}>
            {api.objectsLoading
              ? 'Загрузка…'
              : compact
                ? 'Пока нет объектов. Сохраните замер из проблемомера.'
                : 'Пока нет объектов'}
          </p>
        ) : null}
      </div>

      {selected ? (
        <div className={styles.objectDetail}>
          <h3>
            {selected.clientName || 'Объект'} · {JOB_OBJECT_STATUS_LABELS[selected.status]}
          </h3>
          <p className={styles.lead}>
            {[selected.address, selected.city, selected.clientPhone].filter(Boolean).join(' · ') ||
              'Контакты не заполнены'}
          </p>
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

          <label className={styles.field}>
            Статус
            <select
              value={selected.status}
              onChange={(e) =>
                void patch(selected, { status: e.target.value as JobObjectStatus })
              }
            >
              {STATUSES.filter((s) => {
                if (user.role === 'crew') return s === 'install' || s === 'closed' || s === selected.status;
                return true;
              }).map((s) => (
                <option key={s} value={s}>
                  {JOB_OBJECT_STATUS_LABELS[s]}
                </option>
              ))}
            </select>
          </label>

          {canAssign && staff.length ? (
            <label className={styles.field}>
              Исполнитель
              <select
                value={selected.assignedTo || ''}
                onChange={(e) =>
                  void patch(selected, { assignedTo: e.target.value || null })
                }
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
                  void navigator.clipboard?.writeText(selected.clientSummary);
                  setMsg('Сводка скопирована');
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
            <div className={styles.navRow} style={{ marginTop: 12 }}>
              <button type="button" className={styles.ghost} onClick={() => void remove(selected)}>
                Удалить объект
              </button>
            </div>
          ) : null}

          {msg ? <p className={styles.ok}>{msg}</p> : null}
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
