import { ThemeToggle } from './ThemeToggle';
import { useTheme } from './theme';
import styles from './Header.module.css';

const BASE = import.meta.env.BASE_URL;

export function Header() {
  const { dark } = useTheme();

  return (
    <header className={`${styles.header} ${dark ? styles.dark : ''}`}>
      <div className={styles.inner}>
        <div className={styles.brand}>
          <img
            className={styles.stp}
            src={`${BASE}logo-stp.png`}
            alt="StP"
            width={40}
            height={40}
          />
          <img
            className={styles.mf}
            src={`${BASE}logo-multiframe.png`}
            alt="MultiFRAME"
            height={28}
          />
          <span className={styles.product} hidden>
            Проблемомер
          </span>
        </div>
        <ThemeToggle />
      </div>
    </header>
  );
}
