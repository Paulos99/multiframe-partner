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
import {
  armFieldCalc,
  clearFieldOutcome,
  disarmFieldCalc,
  readFieldOutcome,
  readPlace,
  rememberPlace,
} from './fieldCalcGate';
import {
  calcKindLabel,
  conflictSummary,
  createIdempotencyKey,
  fieldErrorText,
  fieldSync,
  formatRub,
  isCalcConflict,
  readinessGaps,
  sortMeasurements,
  measurementStatusLabel,
  type Blocker,
  type MeasureRoom,
} from './fieldModel';
import styles from './field.module.css';

type DealCard = { id: string; projectId: string; rooms: MeasureRoom[] };

function textOf(body: Record<string, unknown>, fallback: string): string {
  return typeof body.message === 'string' && body.message ? body.message : fallback;
}

export function MeasurerDesk({ onOpenScheme }: { onOpenScheme: () => void }) {
  const api = usePartner();
  const [deals, setDeals] = useState<DealCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [fromCache, setFromCache] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [roomId, setRoomId] = useState<string | null>(() => readPlace());
  const [busy, setBusy] = useState<string | null>(null);
  const [conflict, setConflict] = useState<Record<string, unknown> | null>(null);
  const [pending, setPending] = useState(() => readOutbox().length);
  const [materials, setMaterials] = useState(false);
  const [crewId, setCrewId] = useState('');
  const [profile, setProfile] = useState(false);

  const rooms = useMemo(() => sortMeasurements(deals.flatMap((deal) => deal.rooms)), [deals]);
  const room = rooms.find((item) => item.id === roomId) || null;
  const crews = api
    .partnerListStaff()
    .filter((member) => member.role === 'crew')
    .map((member) => ({ id: member.id, label: member.displayName || 'Бригада' }));
  const sync = fieldSync({ online: api.online, pending, failed });

  const reload = useCallback(async () => {
    await flushFieldOutbox();
    setPending(readOutbox().length);
    const result = await fieldGet('/deals');
    if (result.ok) {
      const list = Array.isArray(result.body.deals) ? (result.body.deals as DealCard[]) : [];
      setDeals(list);
      writeFieldCache({ deals: list });
      setFromCache(false);
      setFailed(false);
    } else {
      const cache = readFieldCache();
      setFailed(true);
      setFromCache(Boolean(cache?.deals?.length));
      if (cache?.deals) setDeals(cache.deals);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    const outcome = readFieldOutcome();
    if (!outcome) return;
    clearFieldOutcome();
    setRoomId(outcome.roomId);
    rememberPlace(outcome.roomId);
    if (outcome.kind === 'conflict') setConflict(outcome.body);
    if (outcome.kind === 'saved') setNotice('Сохранено в комнату.');
    if (outcome.kind === 'queued' || outcome.kind === 'error') setNotice(outcome.message);
    if (outcome.kind === 'needs-scheme') {
      setNotice('Без схемы это не расчёт по замеру. Предварительный ориентир не заменяет схему.');
    }
  }, []);

  useEffect(() => {
    if (!room) return;
    setMaterials(room.materialsComplete);
    setCrewId(room.crewUserId || '');
    setProfile(room.profileUsable);
  }, [room]);

  async function run(key: string, task: () => Promise<void>) {
    if (busy) return;
    setBusy(key);
    try {
      await task();
    } finally {
      setBusy(null);
    }
  }

  function back() {
    disarmFieldCalc();
    setRoomId(null);
    rememberPlace(null);
    setConflict(null);
    setNotice(null);
  }

  async function postRoom(path: string, body: unknown, key: string) {
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
        setNotice(fieldErrorText(result.status, textOf(result.body, '')));
        return;
      }
      const ready = result.body.techReady;
      setNotice(
        typeof ready === 'boolean'
          ? ready
            ? 'Технически готово.'
            : 'Отметка сохранена. К монтажу комната ещё не готова.'
          : 'Сохранено в комнату.',
      );
      await reload();
    });
  }

  if (loading) return <Skeleton kind="rows" count={3} label="Загрузка замеров" />;

  if (!room) {
    return (
      <FadeRise>
      <div className={styles.stack}>
        <section className={styles.card}>
          <h2>Мои замеры</h2>
          <p className={styles.status} role="status">
            {sync.label}. {fromCache ? 'Показаны данные с устройства, это не подтверждение сервера.' : sync.hint}
          </p>
          {rooms.length === 0 ? (
            <p className={styles.muted}>Нет назначенных замеров. Назначение приходит от менеджера или владельца.</p>
          ) : (
            <div className={styles.stack}>
              {rooms.map((item, index) => (
                <article key={item.id} className={styles.slot}>
                  <strong>{item.roomName || 'Комната'}</strong>
                  <span className={styles.muted}>{[item.projectName, item.place].filter(Boolean).join(' · ') || 'Адрес не указан'}</span>
                  <span>{item.detailed ? 'Есть расчёт по замеру' : 'Нет расчёта по замеру'}</span>
                  <span className={styles.muted}>{measurementStatusLabel(item)}</span>
                  <div className={styles.actions}>
                    <Button onClick={() => {
                      setNotice(null);
                      setRoomId(item.id);
                      rememberPlace(item.id);
                    }}>
                      {index === 0 ? 'Продолжить комнату' : 'Открыть замер'}
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

  const gaps = readinessGaps(room);
  const summary = conflict && isCalcConflict(conflict) ? conflictSummary(conflict) : null;
  const openBlockers = room.blockers.filter((item) => item.status === 'open');

  return (
    <FadeRise>
      <div className={styles.stack}>
        <div className={styles.actions}>
          <Button variant="secondary" onClick={back}>Назад</Button>
        </div>
        <section className={styles.card}>
          <h2>{room.roomName || 'Комната'}</h2>
          <p className={styles.muted}>{[room.projectName, room.place].filter(Boolean).join(' · ') || 'Адрес не указан'}</p>
          <p className={styles.status} role="status">{sync.label}. {sync.hint}</p>
          {notice ? <p className={styles.warn} role="status">{notice}</p> : null}
          <div className={styles.slots}>
            <div className={styles.slot}>
              <strong>Предварительный расчёт</strong>
              <span>{room.preliminary ? formatRub(room.preliminary.amount) : 'Нет'}</span>
              <span className={styles.muted}>Не схема и не готовность к монтажу.</span>
            </div>
            <div className={styles.slot}>
              <strong>Расчёт по замеру</strong>
              <span>{room.detailed ? formatRub(room.detailed.amount) : 'Ещё не сохранён'}</span>
              <span className={styles.muted}>Отдельная версия, со схемой.</span>
            </div>
            <div className={styles.slot}>
              <strong>Итог комнаты</strong>
              <span>{room.contribution ? formatRub(room.contribution.amount) : 'Нет'}</span>
              <span className={styles.muted}>
                {room.preliminary && room.detailed
                  ? 'В итоге расчёт по замеру. Предварительный не прибавляется.'
                  : room.contribution
                    ? calcKindLabel(room.contribution.calcType)
                    : 'Сохраните один расчёт.'}
              </span>
            </div>
          </div>
          {summary ? (
            <div className={styles.stack}>
              <p className={styles.warn}>Две версии расчёта. Выберите, какая учитывается. Обе остаются в истории.</p>
              <div className={styles.slots}>
                <div className={styles.slot}>
                  <strong>На сервере</strong>
                  <span>{formatRub(summary.serverAmount)}</span>
                </div>
                <div className={styles.slot}>
                  <strong>Ваша версия</strong>
                  <span>{formatRub(summary.mineAmount)}</span>
                </div>
                <div className={styles.slot}>
                  <strong>Сейчас в итоге</strong>
                  <span>{summary.countedAmount == null ? 'Нет' : formatRub(summary.countedAmount)}</span>
                  <span className={styles.muted}>{summary.countedLabel}</span>
                </div>
              </div>
              <div className={styles.actions}>
                <Button
                  variant="secondary"
                  loading={busy === 'keep'}
                  onClick={() => {
                    setConflict(null);
                    setNotice('В итоге остаётся версия на сервере. Ваша копия её не подменяет.');
                  }}
                >
                  Оставить версию на сервере
                </Button>
                <Button
                  loading={busy === 'adopt'}
                  onClick={() => {
                    if (!isCalcConflict(conflict)) return;
                    void run('adopt', async () => {
                      const result = await fieldPost(
                        `/rooms/${encodeURIComponent(room.id)}/calculations`,
                        {
                          type: 'detailed',
                          amount: conflict.saved.amount,
                          expectedRevision: conflict.current.revisionSeq ?? 0,
                        },
                        { idempotencyKey: createIdempotencyKey(), roomId: room.id },
                      );
                      if (isCalcConflict(result.body)) {
                        setConflict(result.body);
                        return;
                      }
                      if (!result.ok) {
                        setNotice(result.queued
                          ? 'Сохранено на устройстве. На сервере ещё нет.'
                          : fieldErrorText(result.status, textOf(result.body, '')));
                        return;
                      }
                      setConflict(null);
                      setNotice('Ваша версия стала расчётом по замеру.');
                      await reload();
                    });
                  }}
                >
                  Принять мою версию
                </Button>
              </div>
            </div>
          ) : null}
          {room.quoteSent ? (
            <p className={styles.warn}>Предложение уже отправлено. Новый расчёт сохранится в комнату и не изменит отправленную цену.</p>
          ) : null}
          <div className={styles.actions}>
            <Button
              loading={busy === 'scheme'}
              onClick={() => {
                armFieldCalc(room.id, room.detailed?.revisionSeq ?? 0);
                rememberPlace(room.id);
                onOpenScheme();
              }}
            >
              Открыть расчёт по замеру
            </Button>
          </div>
        </section>
        <section className={styles.card}>
          <h3>Профиль комнаты</h3>
          <label className={styles.check}>
            <input type="checkbox" checked={profile} onChange={(event) => setProfile(event.target.checked)} />
            Профиль консультации пригоден
          </label>
          <div className={styles.actions}>
            <Button
              variant="secondary"
              loading={busy === 'profile'}
              onClick={() => void postRoom(`/rooms/${encodeURIComponent(room.id)}/profile`, { usable: profile }, 'profile')}
            >
              Сохранить профиль
            </Button>
          </div>
        </section>
        <section className={styles.card}>
          <h3>Готовность к монтажу</h3>
          <p className={styles.muted}>
            {room.techReady ? 'Технически готово.' : `Ещё не готово: ${gaps.join(', ') || 'проверьте состав'}.`}
          </p>
          <label className={styles.check}>
            <input type="checkbox" checked={materials} onChange={(event) => setMaterials(event.target.checked)} />
            Материалы укомплектованы
          </label>
          <label className={styles.field}>
            Бригада
            <select value={crewId} onChange={(event) => setCrewId(event.target.value)}>
              <option value="">Не назначена</option>
              {crewId && !crews.some((item) => item.id === crewId) ? (
                <option value={crewId}>Назначенная бригада</option>
              ) : null}
              {crews.map((item) => (
                <option key={item.id} value={item.id}>{item.label}</option>
              ))}
            </select>
          </label>
          <div className={styles.actions}>
            <Button
              loading={busy === 'ready'}
              onClick={() => void postRoom(
                `/rooms/${encodeURIComponent(room.id)}/readiness`,
                { materialsComplete: materials, crewUserId: crewId || null },
                'ready',
              )}
            >
              Отметить готовность
            </Button>
          </div>
        </section>
        {openBlockers.length ? (
          <section className={styles.card}>
            <h3>Препятствия</h3>
            {openBlockers.map((item: Blocker) => (
              <div key={item.id} className={styles.item}>
                <p className={styles.muted}>{item.text}</p>
                <div className={styles.actions}>
                  <Button
                    variant="secondary"
                    loading={busy === item.id}
                    onClick={() => void postRoom(
                      `/rooms/${encodeURIComponent(room.id)}/blockers/${encodeURIComponent(item.id)}/resolve`,
                      {},
                      item.id,
                    )}
                  >
                    Снять препятствие
                  </Button>
                </div>
              </div>
            ))}
          </section>
        ) : null}
      </div>
    </FadeRise>
  );
}
