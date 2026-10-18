import type { ReactNode } from 'react';
import { CabinetBrand } from '../partner/CabinetBrand';
import styles from './Sidebar.module.css';

export type SideItem = {
  id: string;
  label: string;
  active: boolean;
  onSelect: () => void;
};

export function Sidebar({
  items,
  mode = 'tabs',
  tools,
}: {
  items: SideItem[];
  /** Вкладки ролей остаются role=tab. У замерщика и монтажника это прежняя кнопка. */
  mode?: 'tabs' | 'buttons';
  tools?: ReactNode;
}) {
  const nav =
    mode === 'tabs' ? (
      <div className={styles.nav} role="tablist" aria-label="Разделы">
        {items.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            id={`cab-tab-${item.id}`}
            aria-selected={item.active}
            className={item.active ? styles.itemOn : styles.item}
            onClick={item.onSelect}
          >
            {item.label}
          </button>
        ))}
      </div>
    ) : (
      <div className={styles.nav}>
        {items.map((item) => (
          <button
            key={item.id}
            type="button"
            aria-pressed={item.active}
            className={item.active ? styles.itemOn : styles.item}
            onClick={item.onSelect}
          >
            {item.label}
          </button>
        ))}
      </div>
    );

  return (
    <aside className={styles.side} aria-label="Разделы кабинета">
      <div className={styles.brand}>
        <CabinetBrand />
      </div>
      <div className={styles.scroll}>
        {nav}
        {tools ? <div className={styles.tools}>{tools}</div> : null}
      </div>
    </aside>
  );
}
