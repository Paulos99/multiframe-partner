import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button } from '../../ui/Button';
import { Skeleton } from '../Skeleton';
import { usePartner } from '../PartnerContext';
import { FadeRise } from '../motionBits';
import {
  fieldGet,
  fieldPost,
  flushFieldOutbox,
  readFieldCache,
  readOutbox,
  writeFieldCache,
} from './fieldClient';
import { readPlace, rememberPlace } from './fieldCalcGate';
import {
  BLOCKER_PRESETS,
  checklistOrTemplate,
  closeBlockedReason,
  createIdempotencyKey,
  fieldErrorText,
  fieldSync,
  nextCrewAction,
  sortTasks,
  type CheckItem,
  type CrewRoom,
} from './fieldModel';
import styles from './field.module.css';

function textOf(body: Record<string, unknown>): string {
  return typeof body.message === 'string' ? body.message : '';
}

export function CrewDesk() {
  const api = usePartner();
  const [rooms, setRooms] = useState<CrewRoom[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [fromCache, setFromCache] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [roomId, setRoomId] = useState<string | null>(() => readPlace());
  const [busy, setBusy] = useState<string | null>(null);
  const [pending, setPending] = useState(() => readOutbox().length);
  const [checks, setChecks] = useState<CheckItem[]>([]);
  const [preset, setPreset] = useState<string>(BLOCKER_PRESETS[0]);
  const [note, setNote] = useState('');
  const [schemeOpen, setSchemeOpen] = useState(false);

  const ordered = useMemo(() => sortTasks(rooms), [rooms]);
  const room = ordered.find((item) => item.id === roomId) || null;
  const sync = fieldSync({ online: api.online, pending, failed });
  const savedClose = room ? closeBlockedReason(room.checklist, room.blockers) : null;
  const checksDirty = room
    ? JSON.stringify(checks) !== JSON.stringify(checklistOrTemplate(room.checklist).items)
    : false;
  const closeReason = checksDirty ? 'Сначала сохраните список проверки.' : savedClose;

  const reload = useCallback(async () => {
    await flushFieldOutbox();
    setPending(readOutbox().length);
    const result = await fieldGet('/install/inbox');
    if (result.ok) {
      const list = Array.isArray(result.body.rooms) ? (result.body.rooms as CrewRoom[]) : [];
      setRooms(list);
      writeFieldCache({ rooms: list });
      setFromCache(false);
      setFailed(false);
    } else {
      const cache = readFieldCache();
      setFailed(true);
      setFromCache(Boolean(cache?.rooms?.length));
      if (cache?.rooms) setRooms(cache.rooms);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    if (!room) return;
    setChecks(checklistOrTemplate(room.checklist).items);
  }, [room]);

  useEffect(() => {
    setSchemeOpen(false);
  }, [roomId]);

  async function run(key: string, task: () => Promise<void>) {
    if (busy) return;
    setBusy(key);
    try {
      await task();
    } finally {
      setBusy(null);
    }
  }

  async function post(path: string, body: unknown, key: string, done: string) {
    if (!room) return;
    await run(key, async () => {
      const result = await fieldPost(path, body, {
        ifMatch: String(room.recordVersion),
        idempotencyKey: createIdempotencyKey(),
        roomId: room.id,
      });
      if (result.queued) {
        setNotice('Сохранено на устройстве. На сервере ещё нет.');
        setPending(readOutbox().length);
        return;
      }
      if (!result.ok) {
        setNotice(fieldErrorText(result.status, textOf(result.body)));
        return;
      }
      setNotice(done);
      await reload();
    });
  }

  function patchCheck(id: string, patch: Partial<CheckItem>) {
    setChecks((items) => items.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  }

  if (loading) return <Skeleton kind="rows" count={3} label="Загрузка заданий" />;

  if (!room) {
    return (
      <FadeRise>
      <div className={styles.stack}>
        <section className={styles.card}>
          <h2>Мои задания</h2>
          <p className={styles.status} role="status">
            {sync.label}. {fromCache ? 'Показаны данные с устройства, это не подтверждение сервера.' : sync.hint}
          </p>
          {notice ? <p className={styles.ok} role="status">{notice}</p> : null}
          {ordered.length === 0 ? (
            <p className={styles.muted}>Нет назначенных работ.</p>
          ) : (
            <div className={styles.stack}>
              {ordered.map((item, index) => (
                <article key={item.id} className={styles.slot}>
                  <strong>{item.roomName || 'Комната'}</strong>
                  <span className={styles.muted}>{[item.projectName, item.place].filter(Boolean).join(' · ') || 'Адрес не указан'}</span>
                  <span>{nextCrewAction(item)}</span>
                  <span className={styles.muted}>{item.materialsComplete ? 'Материалы подтверждены' : 'Комплект не отмечен'}</span>
                  <div className={styles.actions}>
                    <Button onClick={() => {
                      setNotice(null);
                      setRoomId(item.id);
                      rememberPlace(item.id);
                    }}>
                      {index === 0 ? 'Открыть монтаж' : 'Открыть задание'}
                    </Button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      </div>
      </FadeRise>
    );
  }

  const openBlockers = room.blockers.filter((item) => item.status === 'open');

  return (
    <FadeRise>
      <div className={styles.stack}>
        <div className={styles.actions}>
          <Button variant="secondary" onClick={() => {
            setRoomId(null);
            rememberPlace(null);
            setNotice(null);
          }}>
            Назад
          </Button>
        </div>
        <section className={styles.card}>
          <h2>{room.roomName || 'Комната'}</h2>
          <p className={styles.muted}>{[room.projectName, room.place].filter(Boolean).join(' · ') || 'Адрес не указан'}</p>
          <p className={styles.status} role="status">{sync.label}. {sync.hint}</p>
          <p className={styles.muted}>Суммы и коммерческое предложение здесь не показываются.</p>
          {notice ? <p className={notice.startsWith('Комната закрыта') ? styles.ok : styles.warn} role="status">{notice}</p> : null}
          <div className={styles.actions}>
            <Button variant="secondary" aria-expanded={schemeOpen} onClick={() => setSchemeOpen((open) => !open)}>
              Схема и состав
            </Button>
          </div>
          {schemeOpen ? (
            <div className={styles.slot}>
              {room.composition ? (
                <>
                  <strong>{room.composition.hasScheme ? 'Схема есть в расчёте по замеру' : 'Схемы в расчёте нет'}</strong>
                  <span>Площадь: {room.composition.areaM2 == null ? '—' : `${room.composition.areaM2} м²`}</span>
                  <span>Панели: {room.composition.panels ?? '—'}</span>
                  <span>Дюбели: {room.composition.dowels ?? '—'}</span>
                </>
              ) : (
                <span>В расчёте по замеру нет состава. Попросите замерщика сохранить схему ещё раз.</span>
              )}
            </div>
          ) : null}
        </section>
        <section className={styles.card}>
          <h3>Список проверки</h3>
          {checks.map((item) => (
            <div key={item.id} className={styles.item}>
              <button
                type="button"
                className={styles.checkRow}
                aria-pressed={item.state === 'done'}
                onClick={() => patchCheck(item.id, item.state === 'done'
                  ? { state: 'pending', reason: null }
                  : { state: 'done', reason: null })}
              >
                <span className={styles.checkMark} aria-hidden="true">
                  {item.state === 'done' ? '✓' : ''}
                </span>
                <span>{item.title}</span>
              </button>
              <div className={styles.actions}>
                <Button variant={item.state === 'na' ? 'primary' : 'secondary'} onClick={() => patchCheck(item.id, { state: item.state === 'na' ? 'pending' : 'na', reason: item.state === 'na' ? null : item.reason })}>
                  Не применимо
                </Button>
              </div>
              {item.state === 'na' ? (
                <label className={styles.field}>
                  Почему не применимо
                  <input
                    value={item.reason || ''}
                    onChange={(event) => patchCheck(item.id, { reason: event.target.value })}
                  />
                </label>
              ) : null}
            </div>
          ))}
          <div className={styles.actions}>
            <Button
              loading={busy === 'list'}
              onClick={() => {
                const reason = checks.find((item) => item.state === 'na' && !String(item.reason || '').trim());
                if (reason) {
                  setNotice(`Для пункта «${reason.title}» укажите, почему он не применим.`);
                  return;
                }
                void post(
                  `/rooms/${encodeURIComponent(room.id)}/checklist`,
                  { items: checks },
                  'list',
                  'Список проверки сохранён.',
                );
              }}
            >
              Сохранить список
            </Button>
          </div>
        </section>
        <section className={styles.card}>
          <h3>Препятствие</h3>
          <label className={styles.field}>
            Тип
            <select value={preset} onChange={(event) => setPreset(event.target.value)}>
              {BLOCKER_PRESETS.map((item) => (
                <option key={item} value={item}>{item}</option>
              ))}
            </select>
          </label>
          <label className={styles.field}>
            Уточнение
            <textarea value={note} onChange={(event) => setNote(event.target.value)} rows={3} />
          </label>
          <div className={styles.actions}>
            <Button
              variant="secondary"
              loading={busy === 'block'}
              onClick={() => {
                const text = [preset, note.trim()].filter(Boolean).join('. ');
                void post(
                  `/rooms/${encodeURIComponent(room.id)}/blockers`,
                  { text },
                  'block',
                  'Препятствие зафиксировано.',
                );
              }}
            >
              Зафиксировать препятствие
            </Button>
          </div>
          {openBlockers.map((item) => (
            <div key={item.id} className={styles.item}>
              <p className={styles.muted}>{item.text}</p>
              <p className={styles.muted}>Снять препятствие может замерщик, менеджер или владелец.</p>
            </div>
          ))}
        </section>
        <section className={styles.card}>
          <h3>Закрытие комнаты</h3>
          {closeReason ? <p className={styles.warn}>{closeReason}</p> : <p className={styles.muted}>Список заполнен, открытых препятствий нет.</p>}
          <div className={styles.actions}>
            <Button
              loading={busy === 'close'}
              disabled={Boolean(closeReason)}
              onClick={() => {
                if (closeBlockedReason(checks, room.blockers)) return;
                void run('close', async () => {
                  const result = await fieldPost(
                    `/rooms/${encodeURIComponent(room.id)}/close`,
                    {},
                    { ifMatch: String(room.recordVersion), idempotencyKey: createIdempotencyKey(), roomId: room.id },
                  );
                  if (result.queued) {
                    setNotice('Сохранено на устройстве. На сервере ещё нет.');
                    setPending(readOutbox().length);
                    return;
                  }
                  if (!result.ok) {
                    setNotice(fieldErrorText(result.status, textOf(result.body)));
                    return;
                  }
                  setNotice(result.body.dealClosed
                    ? 'Комната закрыта.'
                    : 'Комната закрыта. Сделка остаётся открытой, пока её не закроет менеджер или владелец.');
                  setRoomId(null);
                  rememberPlace(null);
                  await reload();
                });
              }}
            >
              Закрыть комнату
            </Button>
          </div>
        </section>
      </div>
    </FadeRise>
  );
}
