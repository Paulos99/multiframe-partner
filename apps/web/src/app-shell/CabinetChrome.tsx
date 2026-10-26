import { PageTransition } from '../partner/motionBits';
import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { CabinetBrand } from '../partner/CabinetBrand';
import { MobileProfileScreen, ProfileTabIcon } from './MobileProfile';
import { ProfileMenu } from './ProfileMenu';
import { Sidebar, type SideItem } from './Sidebar';
import { ThemeToggle } from './ThemeToggle';
import { usePhoneLayout } from './usePhoneLayout';
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
  const phone = usePhoneLayout();
  const [profileOpen, setProfileOpen] = useState(false);
  const frameRef = useRef<HTMLDivElement>(null);
  const barRef = useRef<HTMLElement>(null);
  useLayoutEffect(() => {
    const frame = frameRef.current;
    const bar = barRef.current;
    if (!frame || !bar) return;
    const apply = () => {
      const height = `${bar.getBoundingClientRect().height}px`;
      frame.style.setProperty('--cab-top', height);
      document.documentElement.style.setProperty('--cab-top', height);
    };
    apply();
    const observer = new ResizeObserver(apply);
    observer.observe(bar);
    return () => observer.disconnect();
  }, [phone, title, lead]);
  /** На телефоне профиль и «Выйти» — отдельная последняя вкладка нижней панели, а не шапка. */
  const showProfile = phone && profileOpen;
  const navItems: SideItem[] = phone
    ? [
        ...items.map((item) => ({
          ...item,
          active: showProfile ? false : item.active,
          onSelect: () => {
            setProfileOpen(false);
            item.onSelect();
          },
        })),
        {
          id: 'profile',
          label: 'Профиль',
          active: showProfile,
          onSelect: () => setProfileOpen(true),
          icon: <ProfileTabIcon />,
        },
      ]
    : items;
  return (
    <div className={styles.frame} ref={frameRef}>
      <Sidebar items={navItems} mode={mode} tools={tools} />
      <div className={styles.main}>
        <header className={styles.topbar} ref={barRef}>
          <div className={styles.mobileBrand}>
            <CabinetBrand />
          </div>
          <div className={styles.titles}>
            <h1>{showProfile ? 'Профиль' : title}</h1>
            {lead && !showProfile ? <p className={styles.lead}>{lead}</p> : null}
          </div>
          <div className={styles.actions}>
            {extra}
            <ThemeToggle />
            {phone ? null : (
              <ProfileMenu
                name={profile.name}
                role={profile.role}
                company={profile.company}
                onLogout={profile.onLogout}
              />
            )}
          </div>
        </header>
        <PageTransition
          className={styles.work}
          pageKey={showProfile ? 'profile' : items.find((item) => item.active)?.id || title}
        >
          {showProfile ? (
            <MobileProfileScreen
              name={profile.name}
              role={profile.role}
              company={profile.company}
              onLogout={profile.onLogout}
            />
          ) : (
            children
          )}
        </PageTransition>
      </div>
    </div>
  );
}
