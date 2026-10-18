import { useTheme } from './theme';
import styles from './ThemeToggle.module.css';

export function ThemeToggle() {
  const { dark, choice, toggle } = useTheme();
  const label = dark ? 'Тёмная тема' : 'Светлая тема';
  const hint = choice === 'system' ? 'Сейчас как в системе. Нажатие запомнит выбор.' : 'Выбор сохранён на этом устройстве.';

  return (
    <button
      type="button"
      className={dark ? styles.toggleOn : styles.toggle}
      onClick={toggle}
      aria-pressed={dark}
      aria-label={label}
      title={hint}
    >
      <span className={styles.track} aria-hidden>
        <span className={styles.thumb} />
      </span>
      <span className={styles.caption}>{dark ? 'Тёмная' : 'Светлая'}</span>
    </button>
  );
}
