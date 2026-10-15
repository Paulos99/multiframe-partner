import { Screen } from '../../ui/Screen';
import { Button } from '../../ui/Button';
import { useSession } from '../../state/SessionContext';
import styles from './StartScreen.module.css';

export function StartScreen() {
  const { goNext } = useSession();

  return (
    <Screen hero>
      <div className={styles.hero}>
        <div className={styles.glow} aria-hidden />
        <h1 className={styles.title}>
          Проверьте уровень акустического комфорта на своём объекте
        </h1>
        <p className={styles.lead}>
          Ответьте на несколько вопросов, Проблемомер оценит уровень шума.
        </p>
        <p className={styles.lead}>
          Дальше вы увидите, насколько тише станет после монтажа MultiFrame.
        </p>
        <div className={styles.cta}>
          <Button onClick={goNext} fullWidth>
            Начать
          </Button>
        </div>
      </div>
    </Screen>
  );
}
