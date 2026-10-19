import { useEffect, useLayoutEffect, useRef, type ReactNode, type RefObject } from 'react';
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
  const scrollRef = useRef<HTMLDivElement>(null);
  const activeId = items.find((item) => item.active)?.id ?? null;
  useScrollStrip(scrollRef, activeId, items.length);
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
      <div className={styles.scroll} ref={scrollRef} data-many={items.length > 6 ? '' : undefined}>
        {nav}
        {tools ? <div className={styles.tools}>{tools}</div> : null}
      </div>
    </aside>
  );
}

function itemClass(item: SideItem): string {
  return item.active ? styles.itemOn : styles.item;
}

/**
 * Телефон: если вкладок больше, чем влезает, нижняя панель — горизонтальная лента.
 * Отмечает края, за которыми есть ещё вкладки (для мягкого затухания), и докручивает
 * активную вкладку в видимую область. На компьютере и планшете меню вертикальное,
 * горизонтального переполнения нет — атрибуты не ставятся.
 */
function useScrollStrip(
  ref: RefObject<HTMLDivElement | null>,
  activeId: string | null,
  count: number,
) {
  const firstRun = useRef(true);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => {
      const max = el.scrollWidth - el.clientWidth;
      const overflow = max > 1;
      el.toggleAttribute('data-overflow', overflow);
      el.toggleAttribute('data-fade-start', overflow && el.scrollLeft > 1);
      el.toggleAttribute('data-fade-end', overflow && el.scrollLeft < max - 1);
    };
    update();
    el.addEventListener('scroll', update, { passive: true });
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(update) : null;
    ro?.observe(el);
    if (el.firstElementChild) ro?.observe(el.firstElementChild);
    window.addEventListener('resize', update);
    return () => {
      el.removeEventListener('scroll', update);
      ro?.disconnect();
      window.removeEventListener('resize', update);
    };
  }, [ref, count]);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || !activeId) return;
    const max = el.scrollWidth - el.clientWidth;
    if (max <= 1) return;
    const tab = el.querySelector<HTMLElement>(`[data-nav-id="${CSS.escape(activeId)}"]`);
    if (!tab) return;
    const box = el.getBoundingClientRect();
    const r = tab.getBoundingClientRect();
    const pad = 28;
    let target = el.scrollLeft;
    if (r.left < box.left + pad) target += r.left - box.left - pad;
    else if (r.right > box.right - pad) target += r.right - box.right + pad;
    else {
      firstRun.current = false;
      return;
    }
    const reduce =
      firstRun.current ||
      (typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    firstRun.current = false;
    el.scrollTo({ left: Math.max(0, Math.min(max, target)), behavior: reduce ? 'auto' : 'smooth' });
  }, [ref, activeId, count]);
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
