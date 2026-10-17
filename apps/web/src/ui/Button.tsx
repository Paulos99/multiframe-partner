import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import styles from './Button.module.css';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';

interface Props extends Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  'onDrag' | 'onDragStart' | 'onDragEnd' | 'onAnimationStart' | 'onAnimationEnd' | 'onAnimationIteration'
> {
  variant?: Variant;
  fullWidth?: boolean;
  /** Спиннер и блокировка, пока запрос идёт. */
  loading?: boolean;
  /** Короткое состояние «получилось» (галочка). */
  success?: boolean;
  children: ReactNode;
}

/**
 * Отклик на нажатие — motion whileTap / whileHover (пакет motion, MIT).
 * Идея «кнопка сжимается и подтверждает успех» — публичные пресеты Uiverse / Magic UI
 * Shiny Button (MIT, https://magicui.design/docs/components/shiny-button):
 * здесь только scale и галочка, без чужого CSS и без платных наборов.
 */
export function Button({
  variant = 'primary',
  fullWidth,
  className,
  children,
  type = 'button',
  loading = false,
  success = false,
  disabled,
  ...rest
}: Props) {
  const reduce = useReducedMotion();
  const inactive = Boolean(disabled || loading);
  const canHover =
    typeof window !== 'undefined' &&
    window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  const cls = [styles.btn, styles[variant], fullWidth ? styles.full : '', className ?? '']
    .filter(Boolean)
    .join(' ');

  return (
    <motion.button
      type={type}
      className={cls}
      disabled={inactive}
      data-success={success && !loading ? '1' : undefined}
      data-loading={loading ? '1' : undefined}
      whileHover={!reduce && !inactive && canHover ? { y: -2 } : undefined}
      whileTap={!reduce && !inactive ? { scale: 0.97 } : undefined}
      transition={{ type: 'spring', stiffness: 520, damping: 34, mass: 0.6 }}
      {...rest}
    >
      {loading ? <span className={styles.spinner} aria-hidden /> : null}
      {success && !loading ? (
        <span className={styles.check} aria-hidden>
          ✓
        </span>
      ) : null}
      {children}
    </motion.button>
  );
}
