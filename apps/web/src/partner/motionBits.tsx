import type { HTMLMotionProps } from 'motion/react';
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
import {
  animate,
  m as motion,
  useReducedMotion,
  LazyMotion,
  domMax,
  MotionConfig,
  AnimatePresence,
} from 'motion/react';
import { useEffect, useRef, useState, type ReactNode } from 'react';

export const EASE = [0.22, 1, 0.36, 1] as const;
export const motionPresets = {
  page: {
    initial: { opacity: 0, y: 8 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: -4 },
  },
  modal: {
    initial: { opacity: 0, scale: 0.98, y: 8 },
    animate: { opacity: 1, scale: 1, y: 0 },
    exit: { opacity: 0, scale: 0.98 },
  },
  transition: { duration: 0.38, ease: EASE },
  layout: { type: 'spring' as const, stiffness: 280, damping: 32 },
};
export function MotionProvider({ children }: { children: ReactNode }) {
  return (
    <LazyMotion features={domMax} strict>
      <MotionConfig reducedMotion="user" transition={motionPresets.transition}>
        {children}
      </MotionConfig>
    </LazyMotion>
  );
}
export function PageTransition({
  children,
  pageKey,
  className,
}: {
  children: ReactNode;
  pageKey: string;
  className?: string;
}) {
  const reduce = usePrefersReducedMotion();
  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={pageKey}
        className={className}
        initial={reduce ? false : motionPresets.page.initial}
        animate={motionPresets.page.animate}
        exit={reduce ? { opacity: 1 } : motionPresets.page.exit}
        transition={reduce ? { duration: 0 } : motionPresets.transition}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}
export { motion as m, AnimatePresence };

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
      initial={
        reduce
          ? false
          : {
              opacity: 0,
              y: blur ? 16 : 10,
              filter: blur ? 'blur(8px)' : 'blur(0px)',
            }
      }
      animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
      transition={{
        duration: reduce ? 0 : 0.42,
        delay: reduce ? 0 : delay,
        ease: EASE,
      }}
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
    const controls = animate(
      el,
      { x: [0, -10, 9, -7, 5, 0] },
      { duration: 0.42, ease: 'easeInOut' },
    );
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
      layout={!reduce}
      exit={reduce ? undefined : { opacity: 0, scale: 0.98 }}
      transition={{
        duration: reduce ? 0 : 0.38,
        delay: reduce ? 0 : Math.min(index, 5) * 0.025,
        ease: EASE,
      }}
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

/** Shared Motion reveal for the existing diagnostic sections. */
export function usePageReveal(key: string) {
  const reduce = usePrefersReducedMotion();
  useEffect(() => {
    const controls: Array<{ stop: () => void }> = [];
    const observer = new IntersectionObserver(
      (entries) => {
        entries
          .filter((e) => e.isIntersecting)
          .forEach((entry, index) => {
            const element = entry.target as HTMLElement;
            observer.unobserve(element);
            element.classList.add('is-revealed');
            if (!reduce)
              controls.push(
                animate(
                  element,
                  { opacity: [0, 1], y: [8, 0] },
                  {
                    ...motionPresets.transition,
                    delay: Math.min(index, 5) * 0.025,
                  },
                ),
              );
          });
      },
      { threshold: 0.05 },
    );
    document
      .querySelectorAll<HTMLElement>('[data-reveal]')
      .forEach((element) => {
        if (reduce) element.classList.add('is-revealed');
        else observer.observe(element);
      });
    return () => {
      observer.disconnect();
      controls.forEach((c) => c.stop());
    };
  }, [key, reduce]);
}

/** Shared entry for existing dialogs; their own focus and close behavior is retained. */
export function ModalSurface(props: HTMLMotionProps<'div'>) {
  const reduce = usePrefersReducedMotion();
  return <motion.div {...props} initial={reduce ? false : motionPresets.modal.initial}
    animate={motionPresets.modal.animate} transition={reduce ? {duration:0} : motionPresets.transition} />;
}
