import { isDemoModeEnabled } from './demoMode';
import { loadToken } from './localStore';

/**
 * Демо-вход без токена сервера (роль закрыта на сервере или связи нет).
 * Материалы и тренажёр тогда работают на встроенных демо-данных, а не просят «войти заново».
 */
export function isDemoOnDevice(): boolean {
  return isDemoModeEnabled() && !loadToken();
}
