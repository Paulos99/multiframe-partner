import { gsap } from 'gsap';
import { useCallback, useEffect, useLayoutEffect, useRef, type RefObject } from 'react';

/** Выбранный пункт: у вкладок это aria-selected, у переключателей и кнопок меню — aria-pressed. */
const ACTIVE = '[aria-selected="true"],[aria-pressed="true"]';
/** Передний край успевает первым, задний догоняет: растяжение «капли» при переезде. */
const LEAD_S = 0.34;
const TRAIL_S = 0.54;
const EASE = 'power3.inOut';

type Edges = { l: number; r: number; t: number; b: number };

export type SlidingPill = {
  /** Контейнер с пунктами: position: relative, пункты поверх подложки. */
  boxRef: RefObject<HTMLDivElement | null>;
  /** Сама подложка: aria-hidden, без обработчиков. */
  pillRef: RefObject<HTMLSpanElement | null>;
};

function reduced(): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Подсветка выбранного пункта «переезжает» к новому на GSAP (только ядро): передний край идёт
 * быстрее, задний догоняет (0,34 и 0,54 с). Анимируются left/right/top/bottom абсолютной подложки:
 * соседние пункты не сдвигаются, раскладка не прыгает.
 * Мгновенно (gsap.set): первый показ, смена размера, «уменьшить движение».
 * Если GSAP не сработал, пункт остаётся подсвечен без движения.
 *
 * @param activeKey любой ключ выбранного пункта: при смене подложка переезжает
 * @param watchKey строка, меняющаяся вместе с набором и подписями пунктов
 */
export function useSlidingPill(activeKey: string | number | null, watchKey = ''): SlidingPill {
  const boxRef = useRef<HTMLDivElement | null>(null);
  const pillRef = useRef<HTMLSpanElement | null>(null);
  const last = useRef<Edges | null>(null);

  const place = useCallback((animate: boolean) => {
    const box = boxRef.current;
    const pill = pillRef.current;
    if (!box || !pill) return;
    const el = box.querySelector<HTMLElement>(ACTIVE);
    if (!el || el.offsetWidth === 0 || el.offsetHeight === 0) {
      pill.style.opacity = '0';
      box.removeAttribute('data-pill');
      last.current = null;
      return;
    }
    const l = el.offsetLeft;
    const t = el.offsetTop;
    const next: Edges = {
      l,
      t,
      r: box.clientWidth - l - el.offsetWidth,
      b: box.clientHeight - t - el.offsetHeight,
    };
    const prev = last.current;
    last.current = next;
    const moves = animate && prev !== null && !reduced();
    try {
      gsap.killTweensOf(pill);
      if (moves && prev) {
        // По каждой оси передний край — тот, что смотрит в сторону движения.
        const dx = next.l - prev.l;
        const dy = next.t - prev.t;
        const edge = (key: 'left' | 'right' | 'top' | 'bottom', to: number, lead: boolean) =>
          gsap.to(pill, { [key]: to, duration: lead ? LEAD_S : TRAIL_S, ease: EASE, overwrite: 'auto' });
        edge('left', next.l, dx < 0);
        edge('right', next.r, dx > 0);
        edge('top', next.t, dy < 0);
        edge('bottom', next.b, dy > 0);
        gsap.set(pill, { opacity: 1 });
      } else {
        // Мгновенно: первый показ, смена размера, «уменьшить движение».
        gsap.set(pill, { left: next.l, right: next.r, top: next.t, bottom: next.b, opacity: 1 });
      }
    } catch {
      // Запасной путь: без анимации, но выбранный пункт всё равно подсвечен.
      pill.style.left = `${next.l}px`;
      pill.style.right = `${next.r}px`;
      pill.style.top = `${next.t}px`;
      pill.style.bottom = `${next.b}px`;
      pill.style.opacity = '1';
    }
    box.setAttribute('data-pill', 'ready');
  }, []);

  useLayoutEffect(() => {
    place(true);
  }, [activeKey, watchKey, place]);

  useEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    const still = () => place(false);
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(still) : null;
    ro?.observe(box);
    for (const child of Array.from(box.children)) if (child !== pillRef.current) ro?.observe(child);
    window.addEventListener('resize', still);
    void document.fonts?.ready.then(still);
    return () => {
      ro?.disconnect();
      window.removeEventListener('resize', still);
    };
  }, [place, watchKey]);

  return { boxRef, pillRef };
}
