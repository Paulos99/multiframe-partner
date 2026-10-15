import { useEffect, useState } from 'react';
import { getConsent, setConsent, type ConsentState } from './consent';
import { hasMetrikaConfigured, initMetrika } from './metrika';
import styles from './CookieNotice.module.css';

const PRIVACY_HREF = `${import.meta.env.BASE_URL}privacy.html`;

export function CookieNotice() {
  const [consent, setConsentState] = useState<ConsentState>(() => getConsent());

  useEffect(() => {
    if (consent === 'accepted') initMetrika();
  }, [consent]);

  if (!hasMetrikaConfigured()) return null;
  if (consent !== 'unknown') return null;

  return (
    <div className={styles.banner} role="dialog" aria-label="Согласие на аналитику">
      <p className={styles.text}>
        Мы используем обезличенную статистику (Яндекс.Метрика), чтобы понимать, как проходит
        проблемомер. Контакты не собираем.{' '}
        <a href={PRIVACY_HREF} target="_blank" rel="noopener noreferrer">
          Подробнее
        </a>
      </p>
      <div className={styles.actions}>
        <button
          type="button"
          className={styles.btn}
          onClick={() => {
            setConsent('declined');
            setConsentState('declined');
          }}
        >
          Отклонить
        </button>
        <button
          type="button"
          className={`${styles.btn} ${styles.btnPrimary}`}
          onClick={() => {
            setConsent('accepted');
            setConsentState('accepted');
          }}
        >
          Принять
        </button>
      </div>
    </div>
  );
}
