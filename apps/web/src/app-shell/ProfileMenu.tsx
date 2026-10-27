import { useEffect, useState } from 'react';
import { apiProfile, hasRemoteApi } from '../partner/apiClient';
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
  const {user,acceptProfile,profileOpenToken}=usePartner();
  // Ссылка на фото подписана на ограниченный срок: если она истекла, один раз
  // берём свежую из /me, а пока её нет — показываем инициалы.
  const [brokenUrl,setBrokenUrl]=useState<string|null>(null);
  const avatarUrl=user?.avatarUrl && user.avatarUrl!==brokenUrl ? user.avatarUrl : null;
  function onAvatarError(){
    const failed=user?.avatarUrl||null;
    setBrokenUrl(failed);
    if(!failed||!hasRemoteApi()) return;
    void apiProfile().then((p)=>{ if(p.avatarUrl && p.avatarUrl!==failed) acceptProfile(p); }).catch(()=>{});
  }
  const meta = company ? `${role} · ${company}` : role;
  const subtitle = meta === name ? role : meta;
  const shown = name.trim() ? name : 'Укажите имя';
  useEffect(() => {
    if (profileOpenToken > 0) setEditing(true);
  }, [profileOpenToken]);
  return (
    <div className={styles.menu}>
      <button type="button" className={styles.who} onClick={()=>setEditing(true)} aria-label="Мой профиль" title={`${shown}. ${subtitle}`}>
        <span className={styles.avatar} aria-hidden>
          {avatarUrl ? <img src={avatarUrl} alt="" data-testid="header-avatar" onError={onAvatarError} style={{width:32,height:32,borderRadius:"50%",objectFit:"cover"}}/> : initials(name)}
        </span>
        <span className={styles.text}>
          <strong>{shown}</strong>
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
