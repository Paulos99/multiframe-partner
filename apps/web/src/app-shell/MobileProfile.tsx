import { useState } from 'react';
import { UserIcon } from '../icons';
import { apiProfile, hasRemoteApi } from '../partner/apiClient';
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

/**
 * Фото пользователя. Ссылка подписана на ограниченный срок: если она истекла,
 * один раз берём свежую из /me (как в шапке), а пока её нет — запасной вариант.
 */
function useAvatar() {
  const { user, acceptProfile } = usePartner();
  const [brokenUrl, setBrokenUrl] = useState<string | null>(null);
  const url = user?.avatarUrl && user.avatarUrl !== brokenUrl ? user.avatarUrl : null;
  function onError() {
    const failed = user?.avatarUrl || null;
    setBrokenUrl(failed);
    if (!failed || !hasRemoteApi()) return;
    void apiProfile()
      .then((p) => {
        if (p.avatarUrl && p.avatarUrl !== failed) acceptProfile(p);
      })
      .catch(() => {});
  }
  return { url, onError };
}

/** Иконка вкладки «Профиль» на телефоне: фото пользователя или сплошной силуэт из общего набора иконок. */
export function ProfileTabIcon() {
  const { url, onError } = useAvatar();
  if (url) {
    return <img className={styles.tabAvatar} src={url} alt="" aria-hidden="true" data-nav-icon="avatar" onError={onError} />;
  }
  return <UserIcon size={20} data-nav-icon="profile" />;
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
  const avatar = useAvatar();
  const [editing, setEditing] = useState(false);
  const meta = company ? `${role} · ${company}` : role;
  const subtitle = meta === name ? role : meta;
  return (
    <section className={styles.screen} aria-label="Профиль">
      <div className={styles.card}>
        <div className={styles.who}>
          <span className={styles.avatar} aria-hidden="true">
            {avatar.url ? <img src={avatar.url} alt="" onError={avatar.onError} /> : initialsOf(name)}
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
