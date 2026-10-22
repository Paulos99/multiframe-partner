import { useState } from 'react';
import {
  OBJECTION_CASES,
  OBJECTION_CATEGORY_LABELS,
  evaluateObjectionCase,
  type ObjectionCase,
  type ObjectionOption,
} from './scenarios/objections.ts';
import type { TrainerCompletePayload } from './SellMultiframeTrainer.tsx';
import styles from './academy.module.css';

export function ObjectionsTrainer({
  onStartAttempt,
  onCompleteAttempt,
}: {
  onStartAttempt?: () => void;
  onCompleteAttempt?: (payload: TrainerCompletePayload) => void;
}) {
  const [caseIndex, setCaseIndex] = useState<number>(0);
  const [stepIndex, setStepIndex] = useState<0 | 1>(0);
  const [step1Option, setStep1Option] = useState<ObjectionOption | null>(null);
  const [step2Option, setStep2Option] = useState<ObjectionOption | null>(null);
  const [caseFinished, setCaseFinished] = useState<boolean>(false);

  const currentCase: ObjectionCase = OBJECTION_CASES[caseIndex] ?? OBJECTION_CASES[0];
  const currentStep = currentCase.steps[stepIndex];
  const selectedForStep = stepIndex === 0 ? step1Option : step2Option;

  const selectCase = (idx: number) => {
    setCaseIndex(idx);
    setStepIndex(0);
    setStep1Option(null);
    setStep2Option(null);
    setCaseFinished(false);
  };

  const handleChooseOption = (option: ObjectionOption) => {
    if (stepIndex === 0 && !step1Option) {
      onStartAttempt?.();
    }
    if (stepIndex === 0) {
      setStep1Option(option);
    } else {
      setStep2Option(option);
    }
  };

  const handleNext = () => {
    if (stepIndex === 0) {
      if (!step1Option) return;
      setStepIndex(1);
      return;
    }
    if (!step1Option || !step2Option) return;
    const result = evaluateObjectionCase(currentCase, [step1Option.id, step2Option.id]);
    setCaseFinished(true);
    onCompleteAttempt?.({
      score: result.finalScore,
      errorTypes: result.errorTypes,
      hasFalsePromise: result.hasFalsePromise,
    });
  };

  const handleRetryCase = () => {
    setStepIndex(0);
    setStep1Option(null);
    setStep2Option(null);
    setCaseFinished(false);
    onStartAttempt?.();
  };

  return (
    <div className={styles.card}>
      <div className={styles.caseNav} role="tablist" aria-label="Кейсы возражений">
        {OBJECTION_CASES.map((item, idx) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={idx === caseIndex}
            className={idx === caseIndex ? styles.tabOn : styles.tab}
            onClick={() => selectCase(idx)}
          >
            {OBJECTION_CATEGORY_LABELS[item.category]} ({item.durationMinutes})
          </button>
        ))}
      </div>

      <div className={styles.cardHead}>
        <h4>{currentCase.title}</h4>
        <span className={styles.badge}>
          {caseFinished ? 'Разбор кейса' : `Реплика ${stepIndex + 1} из 2`}
        </span>
      </div>

      <p className={styles.hint}>{currentCase.situation}</p>

      {caseFinished && step1Option && step2Option ? (
        (() => {
          const result = evaluateObjectionCase(currentCase, [step1Option.id, step2Option.id]);
          return (
            <>
              <div className={result.hasFalsePromise ? styles.feedbackWarn : styles.feedbackBox}>
                <strong className={styles.scoreNumber}>
                  Результат по кейсу: {result.finalScore} из 100
                </strong>
                {result.hasFalsePromise ? (
                  <p className={styles.lead}>
                    Применён штраф за недостоверные обещания («гарантированная тишина» / выдуманные дБ).
                  </p>
                ) : null}
                <ul>
                  {result.explanations.map((exp, i) => (
                    <li key={i}>{exp}</li>
                  ))}
                </ul>
                <p className={styles.lead}>
                  <strong>Главный вывод: </strong>
                  {currentCase.keyTakeaway}
                </p>
              </div>
              <div className={styles.actionsRow}>
                <button type="button" className={styles.ghostBtn} onClick={handleRetryCase}>
                  Повторить этот кейс
                </button>
                {caseIndex + 1 < OBJECTION_CASES.length ? (
                  <button
                    type="button"
                    className={styles.primaryBtn}
                    onClick={() => selectCase(caseIndex + 1)}
                  >
                    Следующий кейс →
                  </button>
                ) : null}
              </div>
            </>
          );
        })()
      ) : (
        <>
          <blockquote className={styles.clientQuote}>{currentStep.clientObjection}</blockquote>
          <div className={styles.choices}>
            {currentStep.options.map((opt) => {
              const isSelected = selectedForStep?.id === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  className={isSelected ? styles.choiceBtnSelected : styles.choiceBtn}
                  onClick={() => handleChooseOption(opt)}
                >
                  {opt.text}
                </button>
              );
            })}
          </div>

          {selectedForStep ? (
            <div className={selectedForStep.hasFalsePromise ? styles.feedbackWarn : styles.feedbackBox}>
              <strong>Пояснение: </strong>
              {selectedForStep.explanation}
            </div>
          ) : null}

          <div className={styles.actionsRow}>
            <button
              type="button"
              className={styles.primaryBtn}
              disabled={!selectedForStep}
              onClick={handleNext}
            >
              {stepIndex === 0 ? 'Ко второй реплике клиента' : 'Завершить кейс и посмотреть разбор'}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
