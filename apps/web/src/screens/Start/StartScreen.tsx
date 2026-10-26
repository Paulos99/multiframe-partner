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
          Насколько тише станет потолок MultiFrame
        </h1>
        <p className={styles.lead}>
          Несколько вопросов о комнате — и рекомендация по потолку.
        </p>
        <p className={styles.lead}>
          Дальше видно, насколько тише станет после монтажа потолка.
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
