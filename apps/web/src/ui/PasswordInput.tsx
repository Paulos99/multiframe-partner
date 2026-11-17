import { useId, useState, type InputHTMLAttributes, type Ref } from 'react';
import { EyeIcon, EyeOffIcon } from '../icons';
import styles from './PasswordInput.module.css';

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> & {
  ref?: Ref<HTMLInputElement>;
  /** Если задано, видимость пароля управляется снаружи. */
  revealed?: boolean;
  onRevealedChange?: (revealed: boolean) => void;
  defaultRevealed?: boolean;
};

/**
 * Поле пароля с глазком справа: скрыть / показать, не ломая автозаполнение.
 * Кнопка type="button", чтобы не отправлять форму.
 */
export function PasswordInput({
  ref,
  revealed: revealedProp,
  onRevealedChange,
  defaultRevealed = false,
  className,
  id,
  disabled,
  spellCheck = false,
  ...props
}: Props) {
  const uid = useId();
  const inputId = id ?? uid;
  const [uncontrolled, setUncontrolled] = useState(defaultRevealed);
  const revealed = revealedProp ?? uncontrolled;

  function setRevealed(next: boolean) {
    if (revealedProp === undefined) setUncontrolled(next);
    onRevealedChange?.(next);
  }

  return (
    <span className={styles.wrap}>
      <input
        spellCheck={spellCheck}
        autoCapitalize="none"
        autoCorrect="off"
        {...props}
        id={inputId}
        ref={ref}
        type={revealed ? 'text' : 'password'}
        disabled={disabled}
        className={className ? `${styles.input} ${className}` : styles.input}
      />
      <button
        type="button"
        className={styles.toggle}
        disabled={disabled}
        tabIndex={0}
        aria-pressed={revealed}
        aria-label={revealed ? 'Скрыть пароль' : 'Показать пароль'}
        aria-controls={inputId}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => setRevealed(!revealed)}
      >
        {revealed ? <EyeOffIcon size={20} /> : <EyeIcon size={20} />}
      </button>
    </span>
  );
}
