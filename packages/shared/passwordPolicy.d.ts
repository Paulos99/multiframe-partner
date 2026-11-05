export const PASSWORD_MIN: number;
export const PASSWORD_MAX_BYTES: number;
/** Пустая строка, если пароль подходит, иначе текст ошибки для пользователя. */
export function passwordProblem(password: unknown): string;
