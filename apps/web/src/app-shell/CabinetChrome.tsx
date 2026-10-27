import { PageTransition } from '../partner/motionBits';
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { usePartner } from '../partner/PartnerContext';
import { CabinetBrand } from '../partner/CabinetBrand';
import { MobileProfileScreen, ProfileTabIcon } from './MobileProfile';
import { ProfileMenu } from './ProfileMenu';
import { Sidebar, type SideItem } from './Sidebar';
import { ThemeToggle } from './ThemeToggle';
import { usePhoneLayout, useSheetMenu } from './usePhoneLayout';
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
  const sheet = useSheetMenu();
  const [menuOpen, setMenuOpen] = useState(false);
  const { profileOpenToken } = usePartner();
  const [profileOpen, setProfileOpen] = useState(false);
  useEffect(() => {
    if (!sheet) setMenuOpen(false);
  }, [sheet]);
  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenuOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [menuOpen]);
  useEffect(() => {
    if (profileOpenToken > 0) setProfileOpen(true);
  }, [profileOpenToken]);
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
            setMenuOpen(false);
            setProfileOpen(false);
            item.onSelect();
          },
        })),
        {
          id: 'profile',
          label: 'Профиль',
          active: showProfile,
          onSelect: () => {
            setMenuOpen(false);
            setProfileOpen(true);
          },
          icon: <ProfileTabIcon />,
        },
      ]
    : items.map((item) => ({
        ...item,
        onSelect: () => {
          setMenuOpen(false);
          item.onSelect();
        },
      }));
  return (
    <div className={styles.frame} ref={frameRef}>
      {sheet && menuOpen ? (
        <button type="button" className={styles.menuBackdrop} aria-label="Закрыть меню" onClick={() => setMenuOpen(false)} />
      ) : null}
      <Sidebar items={navItems} mode={mode} tools={tools} sheet={sheet} open={menuOpen} />
      <div className={styles.main}>
        <header className={styles.topbar} ref={barRef}>
          {sheet ? (
            <button
              type="button"
              className={styles.menuButton}
              aria-expanded={menuOpen}
              aria-controls="cab-sections"
              onClick={() => setMenuOpen((open) => !open)}
            >
              Меню
            </button>
          ) : null}
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
              editToken={profileOpenToken}
            />
          ) : (
            children
          )}
        </PageTransition>
      </div>
    </div>
  );
}
