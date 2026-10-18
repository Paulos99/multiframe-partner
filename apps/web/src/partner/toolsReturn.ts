/**
 * Возврат во вкладку «Инструменты»: инструмент открывается вместо кабинета,
 * и после «Назад» кабинет должен показать ту же вкладку, а не стартовую.
 */
let returnToTools = false;

export function markReturnToTools(): void {
  returnToTools = true;
}

/** Однократно: true, если инструмент открывали из вкладки «Инструменты». */
export function consumeReturnToTools(): boolean {
  const value = returnToTools;
  returnToTools = false;
  return value;
}
