import { useState } from 'react';
import { ProfilePanel } from '../partner/ProfilePanel';
import { usePartner } from '../partner/PartnerContext';
import { AnimatePresence } from '../partner/motionBits';
import { Button } from '../ui/Button';
import styles from './MobileProfile.module.css';

function initialsOf(name: string): string {
  const parts = name
    .trim()
    .split(/\s+/)
    .filter((part) => /[0-9A-Za-zА-Яа-яЁё]/.test(part));
  const letters = parts.slice(0, 2).map((part) => part[0] || '');
  return (letters.join('') || '•').toUpperCase();
}

/** Сплошная иконка пользователя для вкладки «Профиль», если фото не загружено. */
function UserGlyph() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" data-nav-icon="profile">
      <path
        fill="currentColor"
        d="M12 12.2a4.6 4.6 0 1 0 0-9.2 4.6 4.6 0 0 0 0 9.2Zm0 1.9c-4.4 0-8 2.6-8 5.8 0 .6.5 1.1 1.1 1.1h13.8c.6 0 1.1-.5 1.1-1.1 0-3.2-3.6-5.8-8-5.8Z"
      />
    </svg>
  );
}

/** Иконка вкладки «Профиль» на телефоне: фото пользователя или сплошной силуэт. */
export function ProfileTabIcon() {
  const { user } = usePartner();
  if (user?.avatarUrl) {
    return <img className={styles.tabAvatar} src={user.avatarUrl} alt="" aria-hidden="true" data-nav-icon="avatar" />;
  }
  return <UserGlyph />;
}

/** Экран «Профиль» на телефоне: кто вошёл, настройки профиля и «Выйти». */
export function MobileProfileScreen({
  name,
  role,
  company,
  onLogout,
}: {
  name: string;
  role: string;
  company?: string | null;
  onLogout: () => void;
}) {
  const { user } = usePartner();
  const [editing, setEditing] = useState(false);
  const meta = company ? `${role} · ${company}` : role;
  const subtitle = meta === name ? role : meta;
  return (
    <section className={styles.screen} aria-label="Профиль">
      <div className={styles.card}>
        <div className={styles.who}>
          <span className={styles.avatar} aria-hidden="true">
            {user?.avatarUrl ? <img src={user.avatarUrl} alt="" /> : initialsOf(name)}
          </span>
          <span className={styles.text}>
            <strong>{name}</strong>
            <span>{subtitle}</span>
            {user?.login ? <span className={styles.login}>Логин: {user.login}</span> : null}
          </span>
        </div>
        <Button variant="secondary" fullWidth onClick={() => setEditing(true)}>
          Настройки профиля
        </Button>
        <p className={styles.hint}>Фото, логин и пароль.</p>
      </div>
      <button type="button" className={styles.logout} onClick={onLogout}>
        Выйти
      </button>
      <p className={styles.hint}>Если устройство общее, выйдите после смены.</p>
      <AnimatePresence>{editing ? <ProfilePanel key={user?.id} onClose={() => setEditing(false)} /> : null}</AnimatePresence>
    </section>
  );
}
