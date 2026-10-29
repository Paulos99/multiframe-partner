/**
 * Ссылки на клиентские версии инструментов для менеджеров StP.
 *
 * Единственное место, где они задаются:
 *  — константа STP_TOOL_URLS ниже (вписать адрес и выпустить новую версию), либо
 *  — переменные сборки VITE_STP_PROBLEMOMER_URL и VITE_STP_CALCULATOR_URL (перекрывают константу).
 * Адреса боевых клиентских версий присланы Павлом. Если адрес пуст, карточка в кабинете неактивна и подписана «Ссылка появится позже».
 * Принимаются только адреса https://, чтобы случайная опечатка не открыла чужую схему ссылки.
 */
export type StpToolId = 'problemomer' | 'calculator';

export const STP_TOOL_URLS: Record<StpToolId, string> = {
  problemomer: 'https://stp-multiframe.ru/problemomer/',
  calculator: 'https://stp-multiframe.ru/calc/',
};

/** Адрес годится, если это абсолютная ссылка https://. Иначе — пустая строка. */
export function cleanStpToolUrl(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  const text = raw.trim();
  if (!text) return '';
  try {
    const url = new URL(text);
    if (url.protocol !== 'https:' || !url.hostname) return '';
    return url.toString();
  } catch {
    return '';
  }
}

type LinkEnv = { VITE_STP_PROBLEMOMER_URL?: string; VITE_STP_CALCULATOR_URL?: string };

export function stpToolUrl(
  id: StpToolId,
  env: LinkEnv = import.meta.env as unknown as LinkEnv,
  constants: Record<StpToolId, string> = STP_TOOL_URLS,
): string | null {
  const fromEnv = cleanStpToolUrl(id === 'problemomer' ? env.VITE_STP_PROBLEMOMER_URL : env.VITE_STP_CALCULATOR_URL);
  return fromEnv || cleanStpToolUrl(constants[id]) || null;
}
