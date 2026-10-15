import { Button } from '../ui/Button';
import styles from './StickyCta.module.css';

interface Props {
  onBack: () => void;
  onNext: () => void;
  nextDisabled?: boolean;
  nextLabel?: string;
}

export function StickyCta({
  onBack,
  onNext,
  nextDisabled,
  nextLabel = 'Далее',
}: Props) {
  return (
    <div className={styles.bar}>
      <div className={styles.inner}>
        <Button variant="secondary" onClick={onBack} className={styles.back}>
          Назад
        </Button>
        <Button onClick={onNext} disabled={nextDisabled} className={styles.next} fullWidth>
          {nextLabel}
        </Button>
      </div>
    </div>
  );
}
