import { PageTransition } from '../partner/motionBits';
import type { ReactNode } from 'react';
import { CabinetBrand } from '../partner/CabinetBrand';
import { ProfileMenu } from './ProfileMenu';
import { Sidebar, type SideItem } from './Sidebar';
import { ThemeToggle } from './ThemeToggle';
import styles from './CabinetChrome.module.css';

export type { SideItem };

export function CabinetChrome({
  title,
  lead,
  items,
  mode = 'tabs',
  tools,
  extra,
  profile,
  children,
}: {
  title: string;
  lead?: ReactNode;
  items: SideItem[];
  mode?: 'tabs' | 'buttons';
  tools?: ReactNode;
  extra?: ReactNode;
  profile: {
    name: string;
    role: string;
    company?: string | null;
    onLogout: () => void;
  };
  children: ReactNode;
}) {
  return (
    <div className={styles.frame}>
      <Sidebar items={items} mode={mode} tools={tools} />
      <div className={styles.main}>
        <header className={styles.topbar}>
          <div className={styles.mobileBrand}>
            <CabinetBrand />
          </div>
          <div className={styles.titles}>
            <h1>{title}</h1>
            {lead ? <p className={styles.lead}>{lead}</p> : null}
          </div>
          <div className={styles.actions}>
            {extra}
            <ThemeToggle />
            <ProfileMenu
              name={profile.name}
              role={profile.role}
              company={profile.company}
              onLogout={profile.onLogout}
            />
          </div>
        </header>
        <PageTransition className={styles.work} pageKey={items.find(item=>item.active)?.id||title}>{children}</PageTransition>
      </div>
    </div>
  );
}
