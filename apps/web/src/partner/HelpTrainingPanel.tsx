import { useState } from 'react';
import type { UserRole } from '../../../../packages/shared/partner';
import { MaterialsPanel } from './MaterialsPanel';
import { OfflineGearSlot } from './offlineGearSlot';
import styles from './HelpTrainingPanel.module.css';

/** Обучение: методические материалы продукта. Раздела «Кабинет» (личная инструкция по роли) больше нет. */
export function HelpTrainingPanel({ role }: { role: UserRole }) {
  const [gearSlot, setGearSlot] = useState<HTMLElement | null>(null);

  return (
    <OfflineGearSlot.Provider value={gearSlot}>
      <div className={styles.panel}>
        <div className={styles.head}>
          <h2>Обучение</h2>
          <div ref={setGearSlot} className={styles.gearSlot} />
        </div>
        <MaterialsPanel canManage={role === 'admin'} />
      </div>
    </OfflineGearSlot.Provider>
  );
}
