/** Период опроса списков и разброс: тысячи открытых кабинетов не должны стучаться в одну секунду. */
export const POLL_BASE_MS = 45_000;
export const POLL_JITTER = 0.2;

export function pollDelayMs(random: () => number = Math.random): number {
  const spread = 1 - POLL_JITTER + random() * 2 * POLL_JITTER;
  return Math.round(POLL_BASE_MS * spread);
}
