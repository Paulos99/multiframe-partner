import { useState } from 'react';
import {
  isAttemptCompleted,
  type LearningScenarioId,
} from '../../../../packages/shared/learning.ts';
import { ObjectionsTrainer } from './ObjectionsTrainer.tsx';
import { SellMultiframeTrainer, type TrainerCompletePayload } from './SellMultiframeTrainer.tsx';
import {
  ACADEMY_ATTEMPTS_STORAGE_KEY,
  MASTERY_SCORE_THRESHOLD,
  completeAcademyAttempt,
  isAttemptMastered,
  isScenarioMastered,
  loadAcademyAttempts,
  saveAcademyAttempts,
  startAcademyAttempt,
  type AcademyStoredAttempt,
} from './scenarios/sellMultiframe.ts';
import styles from './academy.module.css';

export {
  ACADEMY_ATTEMPTS_STORAGE_KEY,
  MASTERY_SCORE_THRESHOLD,
  completeAcademyAttempt,
  isAttemptMastered,
  isScenarioMastered,
  loadAcademyAttempts,
  saveAcademyAttempts,
  startAcademyAttempt,
  type AcademyStoredAttempt,
};

export type AcademyTab = 'library_note' | 'sell_multiframe' | 'objections';

export function AcademyScreen({ onClose }: { onClose?: () => void }) {
  const [tab, setTab] = useState<AcademyTab>('sell_multiframe');
  const [attempts, setAttempts] = useState<AcademyStoredAttempt[]>(() => loadAcademyAttempts());
  const [activeAttemptId, setActiveAttemptId] = useState<string | null>(null);

  const handleSelectTab = (nextTab: AcademyTab) => {
    setTab(nextTab);
    if (nextTab === 'sell_multiframe' || nextTab === 'objections') {
      const started = startAcademyAttempt(nextTab);
      setActiveAttemptId(started.id);
      setAttempts(loadAcademyAttempts());
    }
  };

  const handleStartScenario = (scenarioId: LearningScenarioId) => {
    const started = startAcademyAttempt(scenarioId);
    setActiveAttemptId(started.id);
    setAttempts(loadAcademyAttempts());
  };

  const handleCompleteScenario = (scenarioId: LearningScenarioId, payload: TrainerCompletePayload) => {
    let targetId = activeAttemptId;
    if (!targetId) {
      const started = startAcademyAttempt(scenarioId);
      targetId = started.id;
    }
    completeAcademyAttempt(targetId, {
      score: payload.score,
      hasFalsePromise: payload.hasFalsePromise,
      errorTypes: payload.errorTypes,
    });
    setActiveAttemptId(null);
    setAttempts(loadAcademyAttempts());
  };

  const sellMastered = isScenarioMastered(attempts, 'sell_multiframe');
  const objectionsMastered = isScenarioMastered(attempts, 'objections');
  const completedCount = attempts.filter((a) => isAttemptCompleted(a)).length;

  return (
    <section className={styles.academy} aria-label="Академия и тренажёры MultiFrame">
      <div className={styles.headerRow}>
        <div className={styles.headerTitle}>
          <h3>Академия и тренажёры MultiFrame</h3>
          <p className={styles.lead}>
            Практика аргументации без риска для рабочих сделок (контекст: training, в боевые KPI не входит).
          </p>
        </div>
        {onClose ? (
          <button type="button" className={styles.ghostBtn} onClick={onClose}>
            К библиотеке файлов
          </button>
        ) : null}
      </div>

      <div className={styles.tabs} role="tablist" aria-label="Разделы Академии">
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'library_note'}
          className={tab === 'library_note' ? styles.tabOn : styles.tab}
          onClick={() => handleSelectTab('library_note')}
        >
          Памятка и прогресс ({completedCount})
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'sell_multiframe'}
          className={tab === 'sell_multiframe' ? styles.tabOn : styles.tab}
          onClick={() => handleSelectTab('sell_multiframe')}
        >
          Продай MultiFrame {sellMastered ? '· Освоено' : ''}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'objections'}
          className={tab === 'objections' ? styles.tabOn : styles.tab}
          onClick={() => handleSelectTab('objections')}
        >
          Возражения {objectionsMastered ? '· Освоено' : ''}
        </button>
      </div>

      {tab === 'library_note' ? (
        <div className={styles.card}>
          <div className={styles.cardHead}>
            <h4>Как устроены библиотека и тренажёры</h4>
            <span className={styles.badge}>Открытие ≠ освоение</span>
          </div>
          <p className={styles.lead}>
            Методические файлы и презентации находятся ниже в разделе «Материалы». Чтобы навык считался освоенным,
            недостаточно просто открыть вкладку или документ — нужно пройти диалоговый тренажёр до конца без ложных
            обещаний («гарантированная тишина», выдуманные дБ) и набрать не менее {MASTERY_SCORE_THRESHOLD} баллов.
          </p>
          <ul className={styles.rubricList}>
            <li>
              <strong>Продай MultiFrame:</strong> {sellMastered ? 'Освоено' : 'Ещё не зачтено'}
            </li>
            <li>
              <strong>Возражения и переговоры:</strong> {objectionsMastered ? 'Освоено' : 'Ещё не зачтено'}
            </li>
            <li>
              <strong>Всего попыток в тренажёре:</strong> {attempts.length} (завершено: {completedCount})
            </li>
          </ul>
          <div className={styles.actionsRow}>
            <button
              type="button"
              className={styles.primaryBtn}
              onClick={() => handleSelectTab('sell_multiframe')}
            >
              Перейти к тренажёру «Продай MultiFrame»
            </button>
            <button
              type="button"
              className={styles.ghostBtn}
              onClick={() => handleSelectTab('objections')}
            >
              Отработать возражения (3–5 мин)
            </button>
          </div>
        </div>
      ) : null}

      {tab === 'sell_multiframe' ? (
        <SellMultiframeTrainer
          onStartAttempt={() => handleStartScenario('sell_multiframe')}
          onCompleteAttempt={(payload) => handleCompleteScenario('sell_multiframe', payload)}
        />
      ) : null}

      {tab === 'objections' ? (
        <ObjectionsTrainer
          onStartAttempt={() => handleStartScenario('objections')}
          onCompleteAttempt={(payload) => handleCompleteScenario('objections', payload)}
        />
      ) : null}
    </section>
  );
}
