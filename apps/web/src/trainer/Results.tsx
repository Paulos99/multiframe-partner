import { useTrainer } from './TrainerContext';
import type { ChoiceScores, TrainerContent } from './types';
import styles from './Trainer.module.css';

const num = (n: number) => String(Math.round(n * 10) / 10).replace('.', ',');

/** Главный итог: сколько реплик верно с первой попытки и засчитано ли. */
export function ResultHead({ count, firstTry, passed, kind }: { count: number; firstTry: number; passed: boolean; kind: 'objection' | 'scenario' }) {
  const t = useTrainer();
  const th = t.content.scoring.choiceMode.passThresholds;
  const need = Math.round((kind === 'objection' ? th.objection.firstTryCorrectAtLeast : th.scenario.firstTryCorrectAtLeast) * 100);
  return (
    <>
      <h4>{kind === 'objection' ? 'Итог по возражению' : 'Итог разговора'}</h4>
      <p className={styles.bigScore}>
        <span className={styles.scoreNum}>
          {firstTry} из {count}
        </span>{' '}
        <span>верно с первой попытки</span>
      </p>
      <p className={passed ? styles.okLine : styles.failLine}>{passed ? (kind === 'objection' ? '✔ Засчитано' : '✔ Разговор засчитан') : kind === 'objection' ? '✖ Не засчитано' : '✖ Разговор не засчитан'}</p>
      <p className={styles.hint}>
        Засчитывается, если верно с первой попытки не меньше {need} %
        {kind === 'scenario' ? ' и ни разу не выбрано ложное обещание' : ''}.
      </p>
    </>
  );
}

/** Критерии из ошибок первого выбора. Нет подходящих вариантов в сыгранном: «не оценивалось». */
export function CriteriaList({ scores, content }: { scores: ChoiceScores; content: TrainerContent }) {
  return (
    <section aria-label="Критерии" className={styles.block}>
      <h4>Критерии</h4>
      <ul className={styles.criteriaList}>
        {content.scoring.criteria.map((c) => {
          const v = scores[c.id];
          return (
            <li key={c.id}>
              <span>{c.title}</span>
              {typeof v === 'number' ? (
                <strong className={v < 3.5 ? styles.failLine : undefined}>{num(v)} из 5</strong>
              ) : (
                <em className={styles.notRated}>не оценивалось</em>
              )}
            </li>
          );
        })}
      </ul>
      <p className={styles.hint}>Балл снижается на 1,5 за каждый неверный первый выбор по этому критерию.</p>
    </section>
  );
}
