import { lazy, Suspense, useEffect, useState } from 'react';
import type { UserRole } from '../../../../packages/shared/partner';
import { trainerHashOpen } from '../trainer/route';
import { navigateHash } from './projectRoute';
import { MaterialsPanel } from './MaterialsPanel';
import { OfflineGearSlot } from './offlineGearSlot';
import { RoleVideoCard } from './RoleVideoCard';
import styles from './HelpTrainingPanel.module.css';

// Тренажёр грузится по требованию: содержимое (около 280 КБ) не входит в основной пакет кабинета.
const TrainerRoot = lazy(() => import('../trainer/TrainerRoot').then((m) => ({ default: m.TrainerRoot })));

type Section = 'materials' | 'trainer';

function sectionFromHash(): Section {
  return trainerHashOpen() ? 'trainer' : 'materials';
}

/** Обучение: методические материалы продукта и тренажёр продаж. */
export function HelpTrainingPanel({ role }: { role: UserRole }) {
  const [gearSlot, setGearSlot] = useState<HTMLElement | null>(null);
  const [section, setSection] = useState<Section>(() => (typeof window === 'undefined' ? 'materials' : sectionFromHash()));

  useEffect(() => {
    const sync = () => setSection(sectionFromHash());
    window.addEventListener('hashchange', sync);
    window.addEventListener('popstate', sync);
    return () => {
      window.removeEventListener('hashchange', sync);
      window.removeEventListener('popstate', sync);
    };
  }, []);

  function select(next: Section) {
    if (next === section) return;
    navigateHash(next === 'trainer' ? '#trainer' : '', next === 'trainer' ? 'push' : 'replace');
    setSection(next);
  }

  return (
    <OfflineGearSlot.Provider value={gearSlot}>
      <div className={styles.panel}>
        <div className={styles.head}>
          <h2>Обучение</h2>
          <div ref={setGearSlot} className={styles.gearSlot} />
        </div>
        <div className={styles.tabs} role="tablist" aria-label="Разделы обучения">
          <button
            type="button"
            role="tab"
            id="help-tab-materials"
            aria-selected={section === 'materials'}
            aria-controls="help-panel-materials"
            className={section === 'materials' ? styles.tabOn : styles.tab}
            onClick={() => select('materials')}
          >
            Материалы
          </button>
          <button
            type="button"
            role="tab"
            id="help-tab-trainer"
            aria-selected={section === 'trainer'}
            aria-controls="help-panel-trainer"
            className={section === 'trainer' ? styles.tabOn : styles.tab}
            onClick={() => select('trainer')}
          >
            Тренажёр
          </button>
        </div>
        {section === 'materials' ? (
          <div id="help-panel-materials" role="tabpanel" aria-labelledby="help-tab-materials">
            <RoleVideoCard role={role} />
            <MaterialsPanel canManage={role === 'admin'} />
          </div>
        ) : (
          <div id="help-panel-trainer" role="tabpanel" aria-labelledby="help-tab-trainer">
            <Suspense fallback={<p className={styles.lead}>Загружаем тренажёр…</p>}>
              <TrainerRoot />
            </Suspense>
          </div>
        )}
      </div>
    </OfflineGearSlot.Provider>
  );
}
