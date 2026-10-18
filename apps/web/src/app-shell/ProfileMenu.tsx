import styles from './ProfileMenu.module.css';

function initials(name: string): string {
  const parts = name
    .trim()
    .split(/\s+/)
    .filter((part) => /[0-9A-Za-zА-Яа-яЁё]/.test(part));
  const letters = parts.slice(0, 2).map((part) => part[0] || '');
  return (letters.join('') || '•').toUpperCase();
}

export function ProfileMenu({
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
  const meta = company ? `${role} · ${company}` : role;
  const subtitle = meta === name ? role : meta;
  return (
    <div className={styles.menu}>
      <div className={styles.who} title={`${name}. ${subtitle}`}>
        <span className={styles.avatar} aria-hidden>
          {initials(name)}
        </span>
        <span className={styles.text}>
          <strong>{name}</strong>
          <span>{subtitle}</span>
        </span>
      </div>
      <button type="button" className={styles.logout} onClick={onLogout} title="Выйти — смена сотрудника на общем планшете">
        Выйти
      </button>
    </div>
  );
}
