import type { ReactNode } from 'react';
import { ROLE_LABELS, type SessionUser, type UserRole } from '../../../../../packages/shared/partner';
import { SyncStatus } from '../SyncStatus';
import { FadeRise } from '../motionBits';
import type { SideItem } from '../../app-shell/CabinetChrome';
import styles from '../partner.module.css';

export type CabinetRoute = 'cabinet' | 'problemomer' | 'calculator';

export function roleHeading(role: UserRole, user: SessionUser): string {
  const company = user.org?.companyName?.trim();
  return company ? `${ROLE_LABELS[role]} · ${company}` : user.displayName || ROLE_LABELS[role];
}

export function SyncBadge() {
  return <SyncStatus compact />;
}

/** Пункт меню «Инструменты» — вторым, чтобы на телефоне был виден без прокрутки панели. */
export function withToolsItem(items: SideItem[], active: boolean, onSelect: () => void): SideItem[] {
  const tools: SideItem = { id: 'tools', label: 'Инструменты', active, onSelect };
  return [...items.slice(0, 1), tools, ...items.slice(1)];
}

export function InstallHint() {
  return (
    <div className={styles.hintCard}>
      <h2>Офлайн на планшете / телефоне</h2>
      <p className={styles.lead}>
        Установите кабинет на устройство: в Chrome — «Установить приложение», на iPhone —
        «Поделиться → На экран Домой». После первого открытия прайс и объекты доступны без сети;
        отправка на сервер встаёт в очередь.
      </p>
    </div>
  );
}

export function TabPanel({ children }: { children: ReactNode }) {
  return <FadeRise className={styles.tabPanel}>{children}</FadeRise>;
}

export function FrameBody({ children }: { children: ReactNode }) {
  return <div className={`${styles.shellWide} ${styles.framed}`}>{children}</div>;
}

export function profileOf(user: SessionUser, onLogout: () => void) {
  return {
    name: user.displayName,
    role: ROLE_LABELS[user.role],
    company: user.org?.companyName,
    onLogout,
  };
}
