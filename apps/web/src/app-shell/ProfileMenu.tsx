import { useState } from 'react';
import { ProfilePanel } from '../partner/ProfilePanel';
import { usePartner } from '../partner/PartnerContext';
import { AnimatePresence } from '../partner/motionBits';
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
  const [editing,setEditing]=useState(false);
  const {user}=usePartner();
  const meta = company ? `${role} · ${company}` : role;
  const subtitle = meta === name ? role : meta;
  return (
    <div className={styles.menu}>
      <button type="button" className={styles.who} onClick={()=>setEditing(true)} aria-label="Мой профиль" title={`${name}. ${subtitle}`}>
        <span className={styles.avatar} aria-hidden>
          {user?.avatarUrl ? <img src={user.avatarUrl} alt="" style={{width:32,height:32,borderRadius:"50%",objectFit:"cover"}}/> : initials(name)}
        </span>
        <span className={styles.text}>
          <strong>{name}</strong>
          <span>{subtitle}</span>
        </span>
      </button>
      <AnimatePresence>{editing ? <ProfilePanel key={user?.id} onClose={()=>setEditing(false)}/> : null}</AnimatePresence>
      <button type="button" className={styles.logout} onClick={onLogout} title="Выйти — смена сотрудника на общем планшете">
        Выйти
      </button>
    </div>
  );
}
