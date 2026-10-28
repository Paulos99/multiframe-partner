import { useMemo } from 'react';
import { documentLabel, type JobObject, type JobObjectDocument } from '../../../../packages/shared/partner';
import { ResultDashboard } from '../screens/Result/ResultWideScreen';
import { deriveResultView } from '../screens/Result/resultShared';
import { createInitialSession, withDerived } from '../state/session';
import { formatRub } from './estimate';
import { usePageReveal } from './motionBits';
import { formatDocStamp } from './historyFormatting';
import { answersFromStoredRoom } from './roomLink';
import type { RoomResultView } from './projectRoute';
import styles from './partner.module.css';

/** Ответы комнаты из сохранения → сессия для показа. Без площади и типа комнаты результата нет. */
export function savedProfileSession(obj: Pick<JobObject, 'room' | 'roomName'>) {
  const answers = answersFromStoredRoom(obj.room, obj.roomName);
  if (!answers?.roomType || !answers.ceilingAreaM2) return null;
  const base = createInitialSession();
  const session = withDerived({
    ...base,
    step: 'result',
    answers: { ...base.answers, room: { ...base.answers.room, ...answers, plannedCeiling: 'stretch' } },
  });
  return session.derived ? session : null;
}

/**
 * Сохранённый расчёт комнаты как страница кабинета. Только чтение: ничего не сохраняет и не отправляет.
 * Данные берутся из комнаты, а не из PDF: показывается то, что сейчас сохранено в карточке.
 * Монтажник цен не видит.
 */
export function SavedResultPage({
  obj,
  view,
  doc,
  hidePrices,
  onBack,
  onOpenPdf,
  pdfBusy,
}: {
  obj: JobObject;
  view: RoomResultView;
  doc: JobObjectDocument | null;
  hidePrices: boolean;
  onBack: () => void;
  onOpenPdf: (() => void) | null;
  pdfBusy: boolean;
}) {
  usePageReveal(`${obj.id}:${view}`);
  const session = useMemo(() => (view === 'profile' ? savedProfileSession(obj) : null), [obj, view]);
  const profileView = useMemo(() => (session ? deriveResultView(session) : null), [session]);
  const label = view === 'profile' ? 'Результаты Проблемомера' : 'Результаты калькулятора';
  const when = doc ? formatDocStamp(doc.createdAt) : '';
  const est = obj.estimate;

  let body;
  if (view === 'profile') {
    body = profileView ? (
      <ResultDashboard p={profileView} title={`Акустический профиль: ${obj.roomName || 'комната'}`} />
    ) : (
      <p className={styles.hint} data-testid="saved-result-empty">
        В комнате нет сохранённых данных проблемомера. Пройдите проблемомер и нажмите «Сохранить».
      </p>
    );
  } else if (est) {
    body = (
      <div className={styles.grid2} data-testid="saved-estimate">
        {obj.room.areaM2 != null ? (
          <div className={styles.field}>
            <span>Площадь</span>
            <strong>{obj.room.areaM2} м²</strong>
          </div>
        ) : null}
        <div className={styles.field}>
          <span>Панели</span>
          <strong>{est.panels} шт.</strong>
        </div>
        <div className={styles.field}>
          <span>Дюбели</span>
          <strong>{est.dowels} шт.</strong>
        </div>
        <div className={styles.field}>
          <span>Схема раскладки</span>
          <strong>{doc ? (doc.hasScheme ? 'есть в PDF' : 'без схемы') : '—'}</strong>
        </div>
        {!hidePrices && est.panelsCost != null ? (
          <div className={styles.field}>
            <span>Панели, стоимость</span>
            <strong>{formatRub(est.panelsCost)}</strong>
          </div>
        ) : null}
        {!hidePrices && est.installCost != null ? (
          <div className={styles.field}>
            <span>Монтаж</span>
            <strong>{formatRub(est.installCost)}</strong>
          </div>
        ) : null}
        {!hidePrices && est.dowelsCost != null ? (
          <div className={styles.field}>
            <span>Дюбели, стоимость</span>
            <strong>{formatRub(est.dowelsCost)}</strong>
          </div>
        ) : null}
        {!hidePrices && est.totalCost != null ? (
          <div className={styles.field}>
            <span>Итого комнаты</span>
            <strong>{formatRub(est.totalCost)}</strong>
          </div>
        ) : null}
      </div>
    );
  } else {
    body = (
      <p className={styles.hint} data-testid="saved-result-empty">
        Расчёт калькулятора в комнате ещё не сохранён.
      </p>
    );
  }

  return (
    <section className={styles.roomPage} aria-label="Сохранённый результат" data-testid="saved-result-page">
      <div className={styles.blockHead}>
        <div>
          <p className={styles.eyebrow}>{doc ? documentLabel(doc.kind) : 'Расчёт'}</p>
          <h1>{label}</h1>
          <p className={styles.lead}>
            {[obj.roomName || obj.clientName, when ? `сохранён ${when}` : null].filter(Boolean).join(' · ')}
          </p>
          <p className={styles.hint}>Только просмотр. Показаны данные, которые сейчас сохранены в комнате.</p>
        </div>
        <div className={styles.docActions}>
          {onOpenPdf ? (
            <button type="button" className={styles.ghost} disabled={pdfBusy} onClick={onOpenPdf}>
              {pdfBusy ? 'Открываем…' : 'Открыть PDF'}
            </button>
          ) : null}
          <button type="button" className={styles.ghost} onClick={onBack}>
            К комнате
          </button>
        </div>
      </div>
      {body}
    </section>
  );
}
