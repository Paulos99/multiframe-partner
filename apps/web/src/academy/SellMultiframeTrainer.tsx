import { useState } from 'react';
import {
  RUBRIC_CRITERIA_LABELS,
  SELL_MULTIFRAME_NODES,
  SELL_MULTIFRAME_SCENARIO,
  evaluateSellMultiframeAttempt,
  type DialogueChoice,
} from './scenarios/sellMultiframe.ts';
import styles from './academy.module.css';

export type TrainerCompletePayload = {
  score: number;
  errorTypes: string[];
  hasFalsePromise: boolean;
};

export function SellMultiframeTrainer({
  onStartAttempt,
  onCompleteAttempt,
}: {
  onStartAttempt?: () => void;
  onCompleteAttempt?: (payload: TrainerCompletePayload) => void;
}) {
  const [currentNodeId, setCurrentNodeId] = useState<string>('start');
  const [pickedIds, setPickedIds] = useState<string[]>([]);
  const [pendingChoice, setPendingChoice] = useState<DialogueChoice | null>(null);
  const [customNote, setCustomNote] = useState<string>('');
  const [finished, setFinished] = useState<boolean>(false);

  const node = SELL_MULTIFRAME_NODES[currentNodeId] ?? SELL_MULTIFRAME_NODES.start;

  const handleSelectChoice = (choice: DialogueChoice) => {
    if (pickedIds.length === 0 && !pendingChoice) {
      onStartAttempt?.();
    }
    setPendingChoice(choice);
  };

  const handleAdvance = () => {
    if (!pendingChoice) return;
    const nextPicked = [...pickedIds, pendingChoice.id];
    setPickedIds(nextPicked);
    const nextId = pendingChoice.nextNodeId;
    setPendingChoice(null);

    if (nextId && SELL_MULTIFRAME_NODES[nextId]) {
      setCurrentNodeId(nextId);
    } else {
      const evaluation = evaluateSellMultiframeAttempt(nextPicked, customNote);
      setFinished(true);
      onCompleteAttempt?.({
        score: evaluation.finalScore,
        errorTypes: evaluation.errorTypes,
        hasFalsePromise: evaluation.hasFalsePromise,
      });
    }
  };

  const handleRestart = () => {
    setCurrentNodeId('start');
    setPickedIds([]);
    setPendingChoice(null);
    setCustomNote('');
    setFinished(false);
    onStartAttempt?.();
  };

  if (finished) {
    const evaluation = evaluateSellMultiframeAttempt(pickedIds, customNote);
    return (
      <div className={styles.card}>
        <div className={styles.cardHead}>
          <h4>Итог сценария «{SELL_MULTIFRAME_SCENARIO.title}»</h4>
          <span className={evaluation.passed ? styles.badgeOk : styles.badgeWarn}>
            {evaluation.passed ? 'Зачтено' : 'Нужна доработка'} · {evaluation.finalScore}/100
          </span>
        </div>

        <div className={evaluation.hasFalsePromise ? styles.feedbackWarn : styles.feedbackBox}>
          <strong className={styles.scoreNumber}>Итоговый балл: {evaluation.finalScore} из 100</strong>
          <p className={styles.lead}>{evaluation.summaryFeedback}</p>
        </div>

        <div>
          <strong>Чек-лист критериев рубрики:</strong>
          <ul className={styles.rubricList}>
            {SELL_MULTIFRAME_SCENARIO.rubric.criteria.map((criterion) => {
              const met = evaluation.criteriaMet.includes(criterion);
              return (
                <li key={criterion}>
                  {met ? '✓' : '—'} {RUBRIC_CRITERIA_LABELS[criterion]}
                </li>
              );
            })}
          </ul>
        </div>

        <div className={styles.actionsRow}>
          <button type="button" className={styles.primaryBtn} onClick={handleRestart}>
            Пройти диалог заново
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.card}>
      <div className={styles.cardHead}>
        <h4>{node.stepTitle}</h4>
        <span className={styles.badge}>Шаг {pickedIds.length + 1} из 4</span>
      </div>

      <blockquote className={styles.clientQuote}>{node.clientLine}</blockquote>
      <p className={styles.hint}>{node.contextHint}</p>

      <div className={styles.choices}>
        {node.choices.map((choice) => {
          const isSelected = pendingChoice?.id === choice.id;
          return (
            <button
              key={choice.id}
              type="button"
              className={isSelected ? styles.choiceBtnSelected : styles.choiceBtn}
              onClick={() => handleSelectChoice(choice)}
            >
              {choice.text}
            </button>
          );
        })}
      </div>

      {pendingChoice ? (
        <div className={pendingChoice.hasFalsePromise ? styles.feedbackWarn : styles.feedbackBox}>
          <strong>Разбор реплики: </strong>
          {pendingChoice.feedback}
        </div>
      ) : null}

      <div className={styles.actionsRow}>
        <button
          type="button"
          className={styles.primaryBtn}
          disabled={!pendingChoice}
          onClick={handleAdvance}
        >
          {pendingChoice?.nextNodeId ? 'Далее' : 'Завершить и получить оценку'}
        </button>
      </div>
    </div>
  );
}
