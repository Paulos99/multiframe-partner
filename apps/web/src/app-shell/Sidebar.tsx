import type { ReactNode } from 'react';
import { CabinetBrand } from '../partner/CabinetBrand';
import { NavIcon, splitNavLabel } from './navIcons';
import styles from './Sidebar.module.css';

export type SideItem = {
  id: string;
  label: string;
  active: boolean;
  onSelect: () => void;
  /** Своя иконка вместо стандартной (например, фото во вкладке «Профиль»). */
  icon?: ReactNode;
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
            className={itemClass(item)}
            data-nav-id={item.id}
            onClick={item.onSelect}
          >
            <NavLabel item={item} />
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
            className={itemClass(item)}
            data-nav-id={item.id}
            onClick={item.onSelect}
          >
            <NavLabel item={item} />
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

function itemClass(item: SideItem): string {
  const base = item.active ? styles.itemOn : styles.item;
  return item.id === 'profile' ? `${base} ${styles.profileItem}` : base;
}

/** Полная подпись остаётся доступным именем; на планшете и телефоне видна короткая подпись с иконкой и счётчиком. */
function NavLabel({ item }: { item: SideItem }) {
  const { base, count } = splitNavLabel(item.label);
  return (
    <>
      <span className={styles.icon}>
        {item.icon ?? <NavIcon id={item.id} label={item.label} />}
        {count ? (
          <span className={styles.badge} aria-hidden="true">
            {count}
          </span>
        ) : null}
      </span>
      <span className={styles.full}>{item.label}</span>
      <span className={styles.short} aria-hidden="true">
        {base}
      </span>
    </>
  );
}
