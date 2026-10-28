import { useEffect, useState, type ReactNode } from 'react';
import { StaffPanel } from './StaffPanel';
import {
  isLegacyStaffList,
  navigateCompany,
  parseCompanyHash,
  parseStaffHash,
  type CompanyTab,
} from './projectRoute';
import styles from './ProjectDesk.module.css';

const TABS: ReadonlyArray<readonly [CompanyTab, string]> = [
  ['about', 'О компании'],
  ['staff', 'Сотрудники'],
];

function readTab(): CompanyTab {
  if (typeof window === 'undefined') return 'about';
  return parseCompanyHash(window.location.hash) ?? (isLegacyStaffList(window.location.hash) ? 'staff' : 'about');
}

function readPerson(): boolean {
  return typeof window !== 'undefined' && parseStaffHash(window.location.hash).kind === 'person';
}

/**
 * Раздел «Компания» владельца: «О компании» и «Сотрудники» вкладками, как проект в СММ.
 * Карточка сотрудника (#staff/<id>) открывается страницей в той же основной части.
 */
export function CompanySection({ about }: { about: ReactNode }) {
  const [tab, setTab] = useState<CompanyTab>(readTab);
  const [person, setPerson] = useState(readPerson);

  useEffect(() => {
    const sync = () => {
      // Старый адрес списка «#staff» переводим на вкладку «Сотрудники».
      if (isLegacyStaffList(window.location.hash)) {
        navigateCompany('staff', 'replace');
        return;
      }
      setPerson(readPerson());
      setTab(readTab());
    };
    sync();
    window.addEventListener('hashchange', sync);
    window.addEventListener('popstate', sync);
    return () => {
      window.removeEventListener('hashchange', sync);
      window.removeEventListener('popstate', sync);
    };
  }, []);

  if (person) return <StaffPanel />;

  return (
    <section className={styles.page} aria-label="Компания">
      <header className={styles.pageHead}>
        <div>
          <h1>Компания</h1>
          <p className={styles.lead}>Данные и прайс компании, команда.</p>
        </div>
      </header>
      <div className={styles.tabs} role="tablist" aria-label="Разделы компании">
        {TABS.map(([id, label]) => (
          <button
            key={id}
            type="button"
            className={styles.tab}
            role="tab"
            aria-selected={tab === id}
            onClick={() => navigateCompany(id, 'replace')}
          >
            {label}
          </button>
        ))}
      </div>
      <div className={styles.pageBody}>{tab === 'staff' ? <StaffPanel /> : about}</div>
    </section>
  );
}
