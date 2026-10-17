import { useEffect, useState } from 'react';
import styles from './Header.module.css';

const BASE = import.meta.env.BASE_URL;
const THEME_KEY = 'mf_theme';

function readDark(): boolean {
  try {
    return localStorage.getItem(THEME_KEY) === 'dark';
  } catch {
    return false;
  }
}

export function Header() {
  const [dark, setDark] = useState(readDark);

  useEffect(() => {
    document.body.classList.toggle('theme-dark', dark);
    try {
      localStorage.setItem(THEME_KEY, dark ? 'dark' : 'light');
    } catch {
      /* ignore quota / private mode */
    }
  }, [dark]);

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
          <span className={styles.product}>Проблемомер</span>
        </div>
        <div className={styles.themeToggle}>
          <span className={styles.themeLabel}>Тема</span>
          <label className={styles.themeSwitch} title="Светлая / тёмная тема">
            <input
              type="checkbox"
              checked={dark}
              onChange={(e) => setDark(e.target.checked)}
              aria-label="Переключить тёмную тему"
            />
            <span className={styles.switchTrack}>
              <span className={styles.iconSun} aria-hidden />
              <span className={styles.iconMoon} aria-hidden />
              <span className={styles.switchThumb} />
            </span>
          </label>
        </div>
      </div>
    </header>
  );
}
