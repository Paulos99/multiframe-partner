/** Общие брейкпоинты интерфейса. Те же значения записаны в tokens.css (--bp-*) и в @media модулей. */
export const BREAKPOINTS = {
  /** Телефон: нижняя панель, окна во весь экран, таблицы — карточками. */
  phone: 640,
  /** Планшет (портрет и альбом): меню свёрнуто в рельс с иконками. */
  tablet: 1024,
} as const;

export const MEDIA = {
  phone: `(max-width: ${BREAKPOINTS.phone}px)`,
  tablet: `(min-width: ${BREAKPOINTS.phone + 1}px) and (max-width: ${BREAKPOINTS.tablet}px)`,
  touch: `(max-width: ${BREAKPOINTS.tablet}px), (pointer: coarse)`,
} as const;
