import { gsap } from 'gsap';
import { Flip } from 'gsap/Flip';
import { useLayoutEffect, useRef, type RefObject } from 'react';

/**
 * Короткая выразительная анимация кабинета на GSAP (ядро и бесплатный Flip).
 * Двигаются только transform и opacity, после конца inline-стили снимаются:
 * раскладка не прыгает, перетаскивание и липкие панели не ломаются.
 * «Уменьшить движение»: всё встаёт на место сразу, без твинов.
 * Любая ошибка GSAP тихо игнорируется: контент остаётся в обычном виде.
 */
let registered = false;
function ensurePlugins() {
  if (registered) return;
  registered = true;
  try {
    gsap.registerPlugin(Flip);
  } catch {
    // Flip недоступен: перестановки без анимации.
  }
}

export function motionReduced(): boolean {
  // Без matchMedia (тестовая среда, старые окружения) анимаций нет: контент сразу в конечном виде.
  return typeof window === 'undefined' || typeof window.matchMedia !== 'function' || window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

const clear = 'transform,opacity';

/** Появление списка элементов: сдвиг снизу и проявление со ступенькой. Срабатывает при смене key. */
export function useStaggerIn(
  rootRef: RefObject<HTMLElement | null>,
  selector: string,
  key: string | number | boolean,
  options: { y?: number; stagger?: number; duration?: number; delay?: number; max?: number } = {},
) {
  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root || motionReduced()) return;
    const items = Array.from(root.querySelectorAll<HTMLElement>(selector));
    if (!items.length) return;
    const { y = 14, stagger = 0.05, duration = 0.5, delay = 0, max = 0.45 } = options;
    try {
      const tween = gsap.from(items, {
        opacity: 0,
        y,
        duration,
        delay,
        ease: 'power3.out',
        // Общая лесенка не длиннее max секунд: на длинных списках не тянется.
        stagger: Math.min(stagger, max / Math.max(1, items.length - 1)),
        clearProps: clear,
        overwrite: 'auto',
      });
      return () => {
        tween.kill();
        gsap.set(items, { clearProps: clear });
      };
    } catch {
      return;
    }
  }, [key]);
}

/** Столбики и полоски растут из нуля: scaleY (от низа) или scaleX (от начала). */
export function useGrow(
  rootRef: RefObject<HTMLElement | null>,
  selector: string,
  axis: 'y' | 'x',
  key: string | number,
  options: { stagger?: number; duration?: number; delay?: number; max?: number } = {},
) {
  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root || motionReduced()) return;
    const items = Array.from(root.querySelectorAll<HTMLElement>(selector));
    if (!items.length) return;
    const { stagger = 0.012, duration = 0.6, delay = 0.08, max = 0.4 } = options;
    try {
      const tween = gsap.from(items, {
        [axis === 'y' ? 'scaleY' : 'scaleX']: 0,
        transformOrigin: axis === 'y' ? '50% 100%' : '0% 50%',
        duration,
        delay,
        ease: 'power3.out',
        stagger: Math.min(stagger, max / Math.max(1, items.length - 1)),
        clearProps: 'transform,transformOrigin',
        overwrite: 'auto',
      });
      return () => {
        tween.kill();
        gsap.set(items, { clearProps: 'transform,transformOrigin' });
      };
    } catch {
      return;
    }
  }, [key]);
}

/** Число «досчитывается» до нового значения; при первом показе считает от нуля. */
export function AnimatedNumber({
  value,
  format = String,
  duration = 0.8,
  pop = false,
  className,
}: {
  value: number;
  format?: (n: number) => string;
  duration?: number;
  /** Короткий «толчок» масштаба при изменении (счётчики колонок). */
  pop?: boolean;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const shown = useRef<number | null>(null);
  const formatRef = useRef(format);
  formatRef.current = format;

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const first = shown.current === null;
    const from = shown.current ?? 0;
    shown.current = value;
    const fmt = formatRef.current;
    if (motionReduced() || from === value || !Number.isFinite(value)) {
      el.textContent = fmt(value);
      return;
    }
    el.textContent = fmt(from);
    const whole = Number.isInteger(value) && Number.isInteger(from);
    const state = { v: from };
    try {
      const tween = gsap.to(state, {
        v: value,
        duration,
        ease: 'power2.out',
        onUpdate: () => {
          el.textContent = fmt(whole ? Math.round(state.v) : Math.round(state.v * 10) / 10);
        },
        onComplete: () => {
          el.textContent = fmt(value);
        },
      });
      let popTween: gsap.core.Tween | null = null;
      if (pop && !first) {
        popTween = gsap.fromTo(el, { scale: 1.3 }, { scale: 1, duration: 0.45, ease: 'back.out(2.2)', clearProps: 'transform' });
      }
      return () => {
        tween.kill();
        popTween?.kill();
        el.textContent = fmt(value);
      };
    } catch {
      return;
    }
  }, [value, duration, pop]);

  return (
    <span ref={ref} className={className} style={pop ? { display: 'inline-block' } : undefined}>
      {format(value)}
    </span>
  );
}

/**
 * Плавная перестановка карточек (GSAP Flip): колонки, фильтр, смена вида.
 * Снимок позиций берётся при отрисовке нового состояния, пока DOM ещё старый;
 * после коммита Flip.from плавно «доезжает» (только transform).
 * Карточки отмечаются атрибутом data-flip-id; новые появляются из прозрачности.
 *
 * @param key строка порядка и колонок: меняется, когда карточки переехали
 * @param paused true во время перетаскивания: им владеет dnd-kit
 * @param dropped откуда «отпустили» карточку: она не едет из старой колонки, а садится с места падения
 */
export function useFlipReflow(
  rootRef: RefObject<HTMLElement | null>,
  key: string,
  paused = false,
  dropped?: RefObject<{ id: string; rect: DOMRect; at?: number } | null>,
) {
  const lastKey = useRef(key);
  const snapshot = useRef<Flip.FlipState | null>(null);

  // Фаза отрисовки: DOM ещё соответствует прошлому состоянию.
  if (lastKey.current !== key && !snapshot.current && rootRef.current && !motionReduced()) {
    try {
      ensurePlugins();
      const nodes = rootRef.current.querySelectorAll<HTMLElement>('[data-flip-id]');
      snapshot.current = nodes.length ? Flip.getState(Array.from(nodes), { props: 'opacity' }) : null;
    } catch {
      snapshot.current = null;
    }
  }

  useLayoutEffect(() => {
    if (lastKey.current === key) return;
    lastKey.current = key;
    const state = snapshot.current;
    snapshot.current = null;
    const root = rootRef.current;
    const drop = dropped?.current ?? null;
    if (dropped) dropped.current = null;
    if (!root || motionReduced()) return;
    try {
      ensurePlugins();
      if (state && !paused) {
        const nodes = Array.from(root.querySelectorAll<HTMLElement>('[data-flip-id]'));
        Flip.from(state, {
          targets: nodes,
          duration: 0.5,
          ease: 'power3.inOut',
          scale: true,
          absolute: false,
          overwrite: true,
          onEnter: (els) => gsap.fromTo(els, { opacity: 0, scale: 0.94 }, { opacity: 1, scale: 1, duration: 0.4, ease: 'power2.out', clearProps: clear }),
        });
      }
      if (drop && (!drop.at || Date.now() - drop.at < 1500)) {
        const node = root.querySelector<HTMLElement>(`[data-flip-id="${CSS.escape(drop.id)}"]`);
        if (node) {
          const now = node.getBoundingClientRect();
          gsap.killTweensOf(node);
          gsap.fromTo(
            node,
            { x: drop.rect.left - now.left, y: drop.rect.top - now.top, scale: 1.04, rotation: 2, zIndex: 5 },
            { x: 0, y: 0, scale: 1, rotation: 0, duration: 0.42, ease: 'power3.out', clearProps: 'transform,zIndex' },
          );
        }
      }
    } catch {
      // Без анимации: карточки уже стоят на местах.
    }
  }, [key, paused, rootRef, dropped]);
}

/** Поднятие карточки при перетаскивании: лёгкий масштаб, наклон и тень (тень — прозрачностью псевдоэлемента). */
export function useLift(ref: RefObject<HTMLElement | null>, origin?: { x: number; y: number } | null) {
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (motionReduced()) {
      gsap.set(el, { scale: 1.02 });
      return;
    }
    try {
      const tween = gsap.fromTo(
        el,
        { scale: 1, rotation: 0, '--lift': 0 },
        {
          scale: 1.04,
          rotation: 2,
          '--lift': 1,
          duration: 0.24,
          ease: 'power2.out',
          transformOrigin: origin ? `${origin.x}px ${origin.y}px` : '50% 50%',
        },
      );
      return () => {
        tween.kill();
      };
    } catch {
      return;
    }
  }, []);
}
