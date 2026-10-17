import { useEffect, useMemo, useRef, useState } from 'react';
import {
  JOB_OBJECT_STATUS_LABELS,
  ROLE_LABELS,
  canAssignObjects,
  canCreateObjects,
  canDeleteObjects,
  canSeePrices,
  documentsForRole,
  type JobObject,
  type JobObjectDocument,
  type JobObjectStatus,
  type UserRole,
} from '../../../../packages/shared/partner';
import { apiFetchObjectDocument } from './apiClient';
import { buildDemoPdfBlob, openPdfBlob } from './demoDocuments';
import { formatRub } from './estimate';
import { loadLocalDocBytes } from './localStore';
import { RiseItem, StatusSwap, usePrefersReducedMotion } from './motionBits';
import { usePartner } from './PartnerContext';
import styles from './partner.module.css';

const STATUSES: JobObjectStatus[] = ['draft', 'measured', 'quote_sent', 'install', 'closed'];

function telHref(phone: string): string {
  return `tel:${phone.replace(/[^\d+]/g, '')}`;
}

function formatDocWhen(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function ObjectDocuments({
  obj,
  role,
  busyId,
  onOpen,
}: {
  obj: JobObject;
  role: UserRole;
  busyId: string | null;
  onOpen: (doc: JobObjectDocument, download: boolean) => void;
}) {
  const docs = documentsForRole(obj.documents, role);
  const seePrices = canSeePrices(role);
  return (
    <div className={styles.docBlock}>
      <div className={styles.field}>
        {seePrices ? 'Смета и схемы' : 'Спецификация и схемы'}
        <span className={styles.hint}>
          {docs.length
            ? seePrices
              ? 'Последний расчёт сверху. Предыдущие версии остаются.'
              : 'Без цен: панели, крепёж и схема раскладки, если её нарисовали.'
            : 'PDF появится после расчёта в калькуляторе.'}
        </span>
      </div>
      {docs.length ? (
        <ul className={styles.docList}>
          {docs.map((doc, index) => (
            <li key={doc.id} className={styles.docRow}>
              <div className={styles.docMeta}>
                <strong>{index === 0 ? 'Последний расчёт' : 'Предыдущая версия'}</strong>
                <span className={styles.hint}>
                  {formatDocWhen(doc.createdAt)}
                  {doc.areaM2 ? ` · ${doc.areaM2} м²` : ''}
                  {doc.panels ? ` · ${doc.panels} пан.` : ''}
                  {doc.hasScheme ? ' · схема раскладки' : ' · без схемы'}
                </span>
              </div>
              <div className={styles.docActions}>
                <button
                  type="button"
                  className={styles.ghost}
                  disabled={busyId === doc.id}
                  onClick={() => onOpen(doc, false)}
                >
                  {busyId === doc.id ? 'Открываем…' : 'Открыть'}
                </button>
                <button
                  type="button"
                  className={styles.ghost}
                  disabled={busyId === doc.id}
                  onClick={() => onOpen(doc, true)}
                >
                  Скачать
                </button>
              </div>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
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
  const [docBusy, setDocBusy] = useState<string | null>(null);
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

  useEffect(() => {
    if (!msg && !err) return;
    const t = window.setTimeout(() => {
      setMsg(null);
      setErr(null);
    }, 3200);
    return () => window.clearTimeout(t);
  }, [msg, err]);

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

  async function openDocument(obj: JobObject, doc: JobObjectDocument, download: boolean) {
    setDocBusy(doc.id);
    setErr(null);
    try {
      let blob: Blob;
      if (doc.demo) {
        blob = await buildDemoPdfBlob(obj, doc);
      } else {
        const local = doc.dataBase64 || loadLocalDocBytes(doc.id);
        if (local) {
          const bin = Uint8Array.from(atob(local), (c) => c.charCodeAt(0));
          blob = new Blob([bin], { type: 'application/pdf' });
        } else {
          const file = await apiFetchObjectDocument(obj.id, doc.id);
          const bin = Uint8Array.from(atob(file.pdfBase64), (c) => c.charCodeAt(0));
          blob = new Blob([bin], { type: 'application/pdf' });
        }
      }
      openPdfBlob(blob, doc.filename, download);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Не удалось открыть PDF');
    } finally {
      setDocBusy(null);
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
          ? 'Только ваши задания. PDF — спецификация для закупки и схема раскладки, без цен.'
          : 'Замеры, КП и монтаж в одной карточке. Расчёт в калькуляторе сам создаёт объект и прикладывает PDF.'}
      </p>
      {reminder ? (
        <p className={styles.reminder} role="status">
          {reminder}
        </p>
      ) : null}
      {!api.online ? (
        <p className={styles.flash} role="status">
          Нет сети — показаны замеры и расчёты, сохранённые на устройстве.
        </p>
      ) : null}
      {!api.online && api.calculations.length ? (
        <div className={styles.calcCache}>
          <h3>Расчёты на устройстве</h3>
          <ul>
            {api.calculations.map((calc) => (
              <li key={calc.id}>
                <strong>{calc.tool === 'calculator' ? 'Калькулятор' : 'Проблемомер'}</strong>
                <span>
                  {calc.label ? `${calc.label} · ` : ''}
                  {calc.areaM2 != null ? `${calc.areaM2} м² · ` : ''}
                  {calc.panels != null ? `${calc.panels} пан. · ` : ''}
                  {new Date(calc.at).toLocaleString('ru-RU')}
                </span>
              </li>
            ))}
          </ul>
        </div>
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
                <span className={styles.objectSide}>
                  {documentsForRole(obj.documents, user.role).length ? (
                    <span className={styles.docMark}>PDF</span>
                  ) : null}
                  <StatusBadge status={obj.status} />
                </span>
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

          <ObjectDocuments
            obj={selected}
            role={user.role}
            busyId={docBusy}
            onOpen={(doc, download) => void openDocument(selected, doc, download)}
          />

          {canCreate ? (
            <button
              type="button"
              className={styles.ghost}
              onClick={() => api.requestCalculator(selected.id)}
            >
              Пересчитать в калькуляторе
            </button>
          ) : null}

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
              <span className={styles.hint}>
                Монтажник видит только объекты, назначенные лично ему.
              </span>
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
        </div>
      ) : null}

      {msg ? (
        <p className={styles.toast} role="status">
          {msg}
        </p>
      ) : null}
      {err ? (
        <p className={`${styles.toast} ${styles.toastErr}`} role="alert">
          {err}
        </p>
      ) : null}
    </div>
  );
}
