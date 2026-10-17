/**
 * Короткие анимации кабинета на motion (MIT) — https://motion.dev
 *
 * Появление карточки входа: идея Magic UI «Blur Fade»
 * https://magicui.design/docs/components/blur-fade (MIT).
 * Размытие только у одного блока на входе, без фильтра на списках.
 *
 * Счётчик KPI: идея React Bits «Count Up»
 * https://reactbits.dev/text-animations/count-up (MIT).
 * Свой rAF-цикл, без копирования их компонента.
 *
 * Встряска при ошибке входа: публичный паттерн shake
 * (CodePen / сообщества Uiverse, без кода с платных витрин).
 *
 * Смена бейджа: короткое opacity/scale, в духе Magic UI «Animated Badge» (MIT).
 * Платный код (codeandchill.store и аналоги) не используется.
 */
import { animate, motion, useReducedMotion } from 'motion/react';
import { useEffect, useRef, useState, type ReactNode } from 'react';

const EASE = [0.22, 1, 0.36, 1] as const;

export function usePrefersReducedMotion(): boolean {
  return useReducedMotion() === true;
}

/** Появление блока. На списках — только opacity и сдвиг, без blur. */
export function FadeRise({
  children,
  className,
  delay = 0,
  blur = false,
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
  blur?: boolean;
}) {
  const reduce = usePrefersReducedMotion();
  return (
    <motion.div
      className={className}
      initial={reduce ? false : { opacity: 0, y: blur ? 16 : 10, filter: blur ? 'blur(8px)' : 'blur(0px)' }}
      animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
      transition={{ duration: blur ? 0.48 : 0.32, delay, ease: EASE }}
    >
      {children}
    </motion.div>
  );
}

/** Встряска контейнера. Повтор срабатывает при росте signal. */
export function ShakeBox({
  signal,
  children,
  className,
}: {
  signal: number;
  children: ReactNode;
  className?: string;
}) {
  const reduce = usePrefersReducedMotion();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || !signal || reduce) return;
    const controls = animate(el, { x: [0, -10, 9, -7, 5, 0] }, { duration: 0.42, ease: 'easeInOut' });
    return () => controls.stop();
  }, [signal, reduce]);

  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  );
}

/** Строка списка: короткий подъём, задержка не больше семи позиций. */
export function RiseItem({
  index,
  children,
  className,
}: {
  index: number;
  children: ReactNode;
  className?: string;
}) {
  const reduce = usePrefersReducedMotion();
  return (
    <motion.div
      className={className}
      initial={reduce ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.26, delay: Math.min(index, 7) * 0.035, ease: EASE }}
    >
      {children}
    </motion.div>
  );
}

/** Плавная смена подписи статуса. */
export function StatusSwap({
  statusKey,
  className,
  children,
}: {
  statusKey: string;
  className?: string;
  children: ReactNode;
}) {
  const reduce = usePrefersReducedMotion();
  return (
    <motion.span
      key={statusKey}
      data-status={statusKey}
      className={className}
      initial={reduce ? false : { opacity: 0, scale: 0.94 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.18, ease: EASE }}
    >
      {children}
    </motion.span>
  );
}

/**
 * Count-up для целых KPI. Дробная цель (площадь) округляется до 0.1 по ходу.
 * React Bits Count Up, MIT — логика своя, чтобы не тащить лишний виджет.
 */
export function CountUp({ value }: { value: number }) {
  const reduce = usePrefersReducedMotion();
  const [n, setN] = useState(reduce ? value : 0);

  useEffect(() => {
    if (reduce) {
      setN(value);
      return;
    }
    const controls = animate(0, value, {
      duration: 0.65,
      ease: EASE,
      onUpdate: (v) => setN(v),
    });
    return () => controls.stop();
  }, [value, reduce]);

  if (Number.isInteger(value)) return <>{Math.round(n)}</>;
  const shown = Math.abs(value - n) < 0.05 ? value : Math.round(n * 10) / 10;
  return <>{shown}</>;
}
