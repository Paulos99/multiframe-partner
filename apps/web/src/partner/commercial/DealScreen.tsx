import { useEffect, useRef, useState } from 'react';
import type { UserRole } from '../../../../../packages/shared/partner';
import type { RoomAssent } from '../../../../../packages/shared/deal';
import type { QuoteRevision } from '../../../../../packages/shared/quote';
import { formatRub } from '../estimate';
import { Skeleton } from '../Skeleton';
import cab from '../partner.module.css';
import project from '../Projects.module.css';
import {
  commercialPort,
  type CommercialPort,
  type OpenedDeal,
} from './commercialPort';
import type { CommercialProject, CommercialRoom } from './demoBook';
import {
  assentComplete,
  hasDeferredRooms,
  latestQuote,
  nextDealStep,
  orderedAmount,
  sentQuote,
} from './dealSteps';
import { ASSENT_LABELS, assentLabel, calcLabel, isSent, outcomeLabel, quoteStatusLabel, REASONS, stageLabel } from './labels';
import { beginWrite, endWrite } from './writeGuard';
import styles from './DealScreen.module.css';

const STEPS = [
  'Комнаты',
  'Снимок цен',
  'Текст и файл',
  'Подтверждение отправки',
  'Новая версия',
  'Решение на сделке',
];

function humanize(err: unknown): string {
  const status = err && typeof err === 'object' && 'status' in err ? Number((err as { status: number }).status) : 0;
  if (status === 428) return 'Запись не сохранена: экран устарел. Обновите его и повторите.';
  if (status === 0) return 'Нет сети. На сервере ничего не изменилось.';
  if (err instanceof Error && err.message) return err.message;
  return 'Не удалось записать';
}

function sameIds(left: string[], right: string[]): boolean {
  return left.length > 0 && [...left].sort().join() === [...right].sort().join();
}

function quoteText(quote: QuoteRevision, rooms: CommercialRoom[]): string {
  const lines = (quote.snapshot?.lines || []).map((line) => {
    const name = rooms.find((room) => room.id === line.roomId)?.name || 'Комната';
    const money = line.amount == null ? 'сумма не указана' : formatRub(line.amount);
    return `${name} — ${calcLabel(line.calcType)} — ${money}`;
  });
  const total = quote.amount == null ? '' : `\nИтого ${formatRub(quote.amount)}`;
  return `Предложение, версия ${quote.version}\n${lines.join('\n')}${total}`;
}

function downloadText(quote: QuoteRevision, rooms: CommercialRoom[]) {
  const blob = new Blob([quoteText(quote, rooms)], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `предложение-v${quote.version}.txt`;
  link.click();
  URL.revokeObjectURL(url);
}

export function DealScreen({
  projectId,
  catalog,
  demo,
  role,
  onBack,
  onChanged,
}: {
  projectId: string;
  catalog: { projects: CommercialProject[]; rooms: CommercialRoom[] };
  demo: boolean;
  role: UserRole;
  onBack: () => void;
  onChanged?: () => void;
}) {
  const catalogRef = useRef(catalog);
  catalogRef.current = catalog;
  const lock = useRef(false);
  const keys = useRef(new Map<string, string>());
  const [bundle, setBundle] = useState<OpenedDeal | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'rooms' | 'deal' | 'history'>('deal');
  const [sheet, setSheet] = useState<'home' | 'wizard' | 'pause' | 'decline' | 'decision' | 'follow'>('home');
  const [step, setStep] = useState(1);
  const [picked, setPicked] = useState<string[]>([]);
  const [assent, setAssent] = useState<Record<string, RoomAssent>>({});
  const [reason, setReason] = useState('');
  const [comment, setComment] = useState('');
  const [when, setWhen] = useState('');
  const [followKind, setFollowKind] = useState<'postponed' | 'no_response'>('postponed');
  const [pending, setPending] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState('');
  const canWrite = role === 'sales' || role === 'owner';
  const hideMoney = role === 'crew';

  useEffect(() => {
    let live = true;
    setLoading(true);
    void commercialPort(demo, catalogRef.current)
      .open(projectId)
      .then((data) => {
        if (!live) return;
        setBundle(data);
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (!live) return;
        setError(humanize(err));
        setLoading(false);
      });
    return () => {
      live = false;
    };
  }, [demo, projectId]);

  function commit(
    intent: string,
    fn: (key: string, port: CommercialPort) => Promise<unknown>,
    done: string,
    after?: () => void,
  ) {
    const key = beginWrite(lock, keys.current, intent);
    if (!key) return;
    setPending(intent);
    setError('');
    void (async () => {
      let ok = false;
      try {
        const port = commercialPort(demo, catalogRef.current);
        await fn(key, port);
        setBundle(await port.open(projectId));
        setNotice(done);
        onChanged?.();
        ok = true;
        after?.();
      } catch (err) {
        setError(humanize(err));
      } finally {
        endWrite(lock, keys.current, intent, ok);
        setPending(null);
      }
    })();
  }

  const deals = bundle?.deals || [];
  const rooms = bundle?.rooms || [];
  const quotes = bundle?.quotes || [];
  const active = deals.find((deal) => !deal.closedAt) || null;
  const history = deals.filter((deal) => deal.closedAt);
  const focus = active || history[0] || null;
  const latest = active ? latestQuote(quotes, active.id) : null;
  const sent = active ? sentQuote(quotes, active.id) : null;
  const stepInfo = nextDealStep(active, quotes, hasDeferredRooms(deals));
  const busy = pending !== null;
  const nameOf = (id: string) => rooms.find((room) => room.id === id)?.name || 'Комната';

  function openWizard(nextStep: number) {
    setPicked(latest?.roomObjectIds?.length ? [...latest.roomObjectIds] : rooms.map((room) => room.id));
    setStep(nextStep);
    setSheet('wizard');
    setNotice(null);
    setError('');
  }

  function money(value: number | null | undefined) {
    if (hideMoney || value == null) return null;
    return formatRub(value);
  }

  return (
    <section className={`${project.panel} ${styles.screen}`} aria-label="Сделка">
      <button type="button" className={project.link} onClick={onBack}>
        ← Назад
      </button>
      <div className={project.header}>
        <div>
          <p className={project.caption}>Проект</p>
          <h2>{bundle?.project.name || 'Сделка'}</h2>
          <p className={project.muted}>{bundle?.project.place || 'Комнаты и коммерческое предложение'}</p>
        </div>
        {active ? <span className={project.badge}>{stageLabel(active.stage)}</span> : null}
      </div>
      {demo ? (
        <p className={styles.warn}>
          Демонстрационные данные. Обновление страницы возвращает начало сценария. На сервер ничего не записывается.
        </p>
      ) : null}
      {error ? (
        <p role="alert" className={project.error}>
          {error}
        </p>
      ) : null}
      {notice ? (
        <p role="status" className={project.muted}>
          {notice}
        </p>
      ) : null}
      {loading && !bundle ? <Skeleton kind="rows" count={3} label="Загрузка сделки" /> : null}

      <div className={cab.tabs} role="tablist" aria-label="Разделы проекта">
        {(
          [
            ['rooms', 'Комнаты'],
            ['deal', 'Сделка'],
            ['history', 'История'],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            className={tab === id ? cab.tabActive : cab.tab}
            onClick={() => setTab(id)}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'rooms' ? (
        <div className={styles.step}>
          {rooms.map((room) => (
            <article key={room.id} className={project.room}>
              <div>
                <h3>{room.name}</h3>
                <p className={project.muted}>{calcLabel(room.calcType)}</p>
              </div>
              {money(room.amount) ? <strong>{money(room.amount)}</strong> : null}
            </article>
          ))}
          {!rooms.length ? <p className={project.empty}>В проекте пока нет комнат с расчётом.</p> : null}
          <p className={project.muted}>В предложение берётся один расчёт комнаты: по замеру, если он есть, иначе ориентир.</p>
        </div>
      ) : null}

      {tab === 'history' ? (
        <div className={styles.step}>
          {history.length ? (
            history.map((deal) => (
              <article key={deal.id} className={project.room}>
                <div>
                  <h3>{outcomeLabel(deal.outcome)}</h3>
                  <p className={project.muted}>
                    {stageLabel(deal.stageAtOutcome || deal.stage)}
                    {money(deal.acceptedAmount) ? ` · сумма заказа ${money(deal.acceptedAmount)}` : ''}
                  </p>
                </div>
                <span className={project.badge}>В истории</span>
              </article>
            ))
          ) : (
            <p className={project.empty}>Завершённых сделок в этом проекте нет.</p>
          )}
        </div>
      ) : null}

      {tab === 'deal' && sheet === 'home' ? (
        <div className={styles.step}>
          <p className={project.muted}>
            {active ? outcomeLabel(active.outcome) : 'Активной сделки нет'}
            {active?.outcome === 'early_paused' && active.stageAtOutcome
              ? ` · пауза на стадии «${stageLabel(active.stageAtOutcome)}»`
              : ''}
          </p>
          <ul className={styles.lines}>
            {quotes
              .filter((quote) => (active ? quote.dealId === active.id : true))
              .sort((a, b) => a.version - b.version)
              .map((quote) => (
                <li key={quote.id}>
                  <span>
                    Версия {quote.version} · {quoteStatusLabel(quote)}
                    {isSent(quote) ? ' · версия заморожена' : ''}
                  </span>
                  {money(quote.amount) ? <strong>сумма предложения {money(quote.amount)}</strong> : null}
                </li>
              ))}
          </ul>
          {focus?.outcome === 'accepted' && money(focus.acceptedAmount) ? (
            <p>
              Сумма заказа <strong>{money(focus.acceptedAmount)}</strong>. В неё входят только комнаты «Заказано».
            </p>
          ) : null}
          {focus?.roomAssent && Object.keys(focus.roomAssent).length ? (
            <ul className={styles.lines}>
              {Object.entries(focus.roomAssent).map(([id, value]) => (
                <li key={id}>
                  <span>{nameOf(id)}</span>
                  <span>{assentLabel(value)}</span>
                </li>
              ))}
            </ul>
          ) : null}
          {canWrite ? (
            <div className={styles.row}>
              {stepInfo.kind === 'resume' && active ? (
                <button
                  type="button"
                  className={project.primary}
                  disabled={busy}
                  onClick={() =>
                    commit('resume:' + active.id, (key, port) => port.resume(active.id, active.recordVersion ?? null, key), 'Сделка возобновлена. Номер тот же.')
                  }
                >
                  Возобновить
                </button>
              ) : null}
              {stepInfo.kind === 'reorder' ? (
                <button
                  type="button"
                  className={project.primary}
                  disabled={busy}
                  onClick={() =>
                    commit(
                      'reorder:' + projectId,
                      (key, port) => port.createDeal(projectId, key),
                      'Открыта новая сделка. Прежняя история не изменилась.',
                    )
                  }
                >
                  Дозаказ
                </button>
              ) : null}
              {stepInfo.kind === 'open' ? (
                <button
                  type="button"
                  className={project.primary}
                  disabled={busy}
                  onClick={() =>
                    commit('open:' + projectId, (key, port) => port.createDeal(projectId, key), 'Сделка открыта.')
                  }
                >
                  Открыть сделку
                </button>
              ) : null}
              {stepInfo.kind === 'wizard' ? (
                <button type="button" className={project.primary} disabled={busy} onClick={() => openWizard(stepInfo.step)}>
                  {stepInfo.label}
                </button>
              ) : null}
              {stepInfo.kind === 'decision' ? (
                <button
                  type="button"
                  className={project.primary}
                  disabled={busy}
                  onClick={() => {
                    setAssent({});
                    setSheet('decision');
                  }}
                >
                  Зафиксировать решение
                </button>
              ) : null}
              {active && active.outcome !== 'accepted' ? (
                <button type="button" className={project.secondary} disabled={busy} onClick={() => setSheet('pause')}>
                  Пауза
                </button>
              ) : null}
              {active && active.outcome !== 'accepted' ? (
                <button type="button" className={project.secondary} disabled={busy} onClick={() => setSheet('decline')}>
                  Отказ
                </button>
              ) : null}
              {active && sent ? (
                <button type="button" className={project.secondary} disabled={busy} onClick={() => setSheet('follow')}>
                  Следующий контакт
                </button>
              ) : null}
              {active && sent && active.outcome !== 'accepted' ? (
                <button type="button" className={project.secondary} disabled={busy} onClick={() => openWizard(5)}>
                  Новая версия
                </button>
              ) : null}
            </div>
          ) : (
            <p className={project.muted}>Для этой роли коммерческие кнопки скрыты.</p>
          )}
        </div>
      ) : null}

      {tab === 'deal' && sheet === 'wizard' && active ? (
        <div className={styles.step} key={step}>
          <button type="button" className={project.link} onClick={() => setSheet('home')}>
            К обзору сделки
          </button>
          <p className={project.caption}>Шаг {step} из 6 · {STEPS[step - 1]}</p>
          <ol className={styles.steps}>
            {STEPS.map((title, index) => (
              <li key={title} className={index + 1 === step ? styles.on : undefined}>
                {index + 1}. {title}
              </li>
            ))}
          </ol>

          {step === 1 ? (
            <>
              {rooms.map((room) => (
                <label key={room.id} className={styles.pick}>
                  <input
                    type="checkbox"
                    checked={picked.includes(room.id)}
                    onChange={() =>
                      setPicked((current) =>
                        current.includes(room.id) ? current.filter((id) => id !== room.id) : [...current, room.id],
                      )
                    }
                  />
                  <span>
                    <strong>{room.name}</strong>
                    <span className={project.muted}>
                      {' '}
                      · {calcLabel(room.calcType)}
                      {money(room.amount) ? ` · ${money(room.amount)}` : ''}
                    </span>
                  </span>
                </label>
              ))}
              {rooms.some((room) => picked.includes(room.id) && room.calcType === 'preliminary') ? (
                <p className={styles.warn}>Есть ориентир без схемы. Это не готовность к монтажу.</p>
              ) : null}
            </>
          ) : null}

          {step === 2 ? (
            <>
              {(() => {
                const draft = latest && !isSent(latest) && sameIds(latest.roomObjectIds, picked) ? latest : null;
                return (
                  <>
                    {draft?.snapshot?.lines?.some((line) => line.calcType === 'preliminary') ? (
                      <p className={styles.warn}>В снимке есть ориентир без схемы. После отправки эта версия замораживается.</p>
                    ) : (
                      <p className={project.muted}>Снимок фиксирует состав и цены на момент сборки.</p>
                    )}
                    <ul className={styles.lines}>
                      {(draft?.snapshot?.lines || []).map((line) => (
                        <li key={line.roomId}>
                          <span>
                            {nameOf(line.roomId)} · {calcLabel(line.calcType)}
                          </span>
                          {money(line.amount) ? <strong>{money(line.amount)}</strong> : null}
                        </li>
                      ))}
                    </ul>
                    {canWrite ? (
                      <button
                        type="button"
                        className={project.primary}
                        disabled={busy || !picked.length || Boolean(draft)}
                        onClick={() =>
                          commit(
                            `quote:${active.id}:${[...picked].sort().join(',')}`,
                            (key, port) => port.createQuote({ projectId, dealId: active.id, roomObjectIds: picked }, key),
                            'Снимок собран. Это ещё не отправка.',
                          )
                        }
                      >
                        Собрать снимок
                      </button>
                    ) : null}
                  </>
                );
              })()}
            </>
          ) : null}

          {step === 3 && latest ? (
            <>
              <p className={project.muted}>Копирование, скачивание и показ клиенту не подтверждают отправку.</p>
              <div className={styles.row}>
                <button
                  type="button"
                  className={project.secondary}
                  disabled={busy}
                  onClick={() =>
                    commit(
                      'copy:' + latest.id,
                      async (key, port) => {
                        await port.quoteAction(latest.id, 'copy_text', latest.recordVersion ?? null, key);
                        try {
                          await navigator.clipboard.writeText(quoteText(latest, rooms));
                        } catch {
                          /* буфер обмена может быть недоступен */
                        }
                      },
                      'Текст скопирован. Это не отправка.',
                    )
                  }
                >
                  Скопировать текст
                </button>
                <button
                  type="button"
                  className={project.secondary}
                  disabled={busy}
                  onClick={() =>
                    commit(
                      'pdf:' + latest.id,
                      async (key, port) => {
                        await port.quoteAction(latest.id, 'generate_pdf', latest.recordVersion ?? null, key);
                        downloadText(latest, rooms);
                      },
                      'Файл подготовлен. Это не отправка.',
                    )
                  }
                >
                  Скачать
                </button>
                <button
                  type="button"
                  className={project.secondary}
                  disabled={busy}
                  onClick={() =>
                    commit(
                      'share:' + latest.id,
                      (key, port) => port.quoteAction(latest.id, 'share', latest.recordVersion ?? null, key),
                      'Можно показать клиенту. Это не отправка.',
                    )
                  }
                >
                  Поделиться
                </button>
              </div>
            </>
          ) : null}

          {step === 4 && latest ? (
            <>
              <p className={project.muted}>
                {isSent(latest)
                  ? 'Отправка уже подтверждена. Версия заморожена.'
                  : 'Подтвердите, что предложение действительно передано клиенту.'}
              </p>
              {!isSent(latest) ? (
                <label className={cab.field}>
                  Комментарий к отправке, если нужен
                  <input value={comment} onChange={(event) => setComment(event.target.value)} />
                </label>
              ) : null}
              {canWrite && !isSent(latest) ? (
                <button
                  type="button"
                  className={project.primary}
                  disabled={busy}
                  onClick={() =>
                    commit(
                      'confirm:' + latest.id,
                      (key, port) => port.quoteAction(latest.id, 'confirm_sent', latest.recordVersion ?? null, key, comment),
                      'Отправка подтверждена. Версия заморожена.',
                    )
                  }
                >
                  Подтвердить отправку
                </button>
              ) : null}
            </>
          ) : null}

          {step === 5 ? (
            <>
              <p className={project.muted}>
                Отправленную версию нельзя пересохранить. Изменение цен, состава или геометрии — только новая версия на этой же сделке.
              </p>
              <button type="button" className={project.primary} onClick={() => setStep(1)}>
                Собрать новую версию
              </button>
            </>
          ) : null}

          {step === 6 ? (
            <>
              <p className={project.muted}>Решение клиента записывается на сделке, а не в документе предложения.</p>
              <button
                type="button"
                className={project.primary}
                disabled={!sent}
                onClick={() => {
                  setAssent({});
                  setSheet('decision');
                }}
              >
                К решению клиента
              </button>
            </>
          ) : null}

          <div className={styles.row}>
            {step > 1 ? (
              <button type="button" className={project.secondary} onClick={() => setStep((value) => value - 1)}>
                К предыдущему шагу
              </button>
            ) : null}
            {step < 6 ? (
              <button
                type="button"
                className={project.secondary}
                disabled={step === 1 && !picked.length}
                onClick={() => setStep((value) => value + 1)}
              >
                Дальше
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      {tab === 'deal' && sheet === 'decision' && active && sent ? (
        <div className={styles.step}>
          <button type="button" className={project.link} onClick={() => setSheet('home')}>
            К обзору сделки
          </button>
          <h3>Решение по комнатам предложения</h3>
          {(sent.snapshot?.lines || []).map((line) => (
            <fieldset key={line.roomId} className={styles.block}>
              <legend>
                {nameOf(line.roomId)}
                {money(line.amount) ? ` · ${money(line.amount)}` : ''}
              </legend>
              <div className={styles.row}>
                {(Object.keys(ASSENT_LABELS) as Array<keyof typeof ASSENT_LABELS>).map((value) => (
                  <button
                    key={value}
                    type="button"
                    aria-pressed={assent[line.roomId] === value}
                    className={assent[line.roomId] === value ? project.primary : project.secondary}
                    onClick={() => setAssent((current) => ({ ...current, [line.roomId]: value }))}
                  >
                    {ASSENT_LABELS[value]}
                  </button>
                ))}
              </div>
            </fieldset>
          ))}
          <p>
            Сумма заказа:{' '}
            <strong>
              {orderedAmount(sent, assent) == null ? 'пока нет ни одной заказанной комнаты' : money(orderedAmount(sent, assent))}
            </strong>
          </p>
          <p className={project.muted}>Отложенные комнаты и комнаты вне сделки в сумму и в монтаж не входят.</p>
          {canWrite ? (
            <button
              type="button"
              className={project.primary}
              disabled={busy || !assentComplete(sent, assent) || orderedAmount(sent, assent) == null}
              onClick={() =>
                commit(
                  'accept:' + active.id,
                  (key, port) => port.accept(active.id, active.recordVersion ?? null, assent, key),
                  'Согласие записано. В сумму вошли только заказанные комнаты.',
                  () => setSheet('home'),
                )
              }
            >
              Зафиксировать согласие
            </button>
          ) : null}
        </div>
      ) : null}

      {tab === 'deal' && (sheet === 'pause' || sheet === 'decline') && active ? (
        <form
          className={styles.step}
          onSubmit={(event) => {
            event.preventDefault();
            if (!reason) {
              setError('Укажите причину');
              return;
            }
            if (sheet === 'pause') {
              commit(
                'pause:' + active.id,
                (key, port) =>
                  port.pause(active.id, active.recordVersion ?? null, { reason, comment: comment || null, nextActionAt: when || null }, key),
                'Сделка на паузе — её можно возобновить.',
                () => setSheet('home'),
              );
              return;
            }
            const early = !sent;
            commit(
              'decline:' + active.id,
              (key, port) =>
                port.decline(active.id, active.recordVersion ?? null, { reason, comment: comment || null, early }, key),
              'Сделка закрыта отказом.',
              () => setSheet('home'),
            );
          }}
        >
          <button type="button" className={project.link} onClick={() => setSheet('home')}>
            К обзору сделки
          </button>
          <h3>{sheet === 'pause' ? 'Пауза' : sent ? 'Отказ' : 'Ранний отказ'}</h3>
          <p className={project.muted}>
            {sheet === 'pause'
              ? 'Сделка остаётся открытой. Отказом пауза не считается.'
              : `Причина фиксируется на стадии «${stageLabel(active.stage)}».`}
          </p>
          <label className={cab.field}>
            Причина
            <select value={reason} onChange={(event) => setReason(event.target.value)}>
              <option value="">Выберите причину</option>
              {Object.entries(REASONS).map(([id, label]) => (
                <option key={id} value={id}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label className={cab.field}>
            Комментарий, если нужен
            <input value={comment} onChange={(event) => setComment(event.target.value)} />
          </label>
          {sheet === 'pause' ? (
            <label className={cab.field}>
              Следующий контакт
              <input type="date" value={when} onChange={(event) => setWhen(event.target.value)} />
            </label>
          ) : null}
          <button type="submit" className={project.primary} disabled={busy || !canWrite}>
            {sheet === 'pause' ? 'Поставить на паузу' : 'Зафиксировать отказ'}
          </button>
        </form>
      ) : null}

      {tab === 'deal' && sheet === 'follow' && active ? (
        <form
          className={styles.step}
          onSubmit={(event) => {
            event.preventDefault();
            commit(
              'follow:' + active.id + followKind,
              (key, port) =>
                port.followUp(active.id, active.recordVersion ?? null, { outcome: followKind, nextActionAt: when || null }, key),
              'Следующий контакт записан. Сделка не закрыта.',
              () => setSheet('home'),
            );
          }}
        >
          <button type="button" className={project.link} onClick={() => setSheet('home')}>
            К обзору сделки
          </button>
          <h3>Следующий контакт</h3>
          <p className={project.muted}>Это не дозаказ и не новая сделка. Дозаказ открывается отдельно, когда текущая уже завершена.</p>
          <div className={styles.row}>
            <button type="button" className={followKind === 'postponed' ? project.primary : project.secondary} onClick={() => setFollowKind('postponed')}>
              Решение отложено
            </button>
            <button type="button" className={followKind === 'no_response' ? project.primary : project.secondary} onClick={() => setFollowKind('no_response')}>
              Ответа пока нет
            </button>
          </div>
          <label className={cab.field}>
            Когда связаться
            <input type="date" value={when} onChange={(event) => setWhen(event.target.value)} />
          </label>
          <button type="submit" className={project.primary} disabled={busy || !canWrite}>
            Записать контакт
          </button>
        </form>
      ) : null}
    </section>
  );
}
