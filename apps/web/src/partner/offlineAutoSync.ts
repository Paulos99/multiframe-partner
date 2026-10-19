import { useEffect } from 'react';
import { listMaterials, materialsUseApi } from './materialsClient';
import { offlineEnabled, syncOfflineMaterials } from './offlineMaterials';

/** Раз в 30 минут, пока кабинет открыт, плюс сразу при входе и при появлении сети. */
const PERIOD_MS = 30 * 60 * 1000;

/**
 * Автообновление офлайн-копий «Обучения»: только если пользователь сам включил
 * «Скачать для офлайна», есть сеть и вход выполнен. Качаются только новые и изменённые файлы.
 */
export function useOfflineMaterialsAutoSync(userId: string | null, online: boolean): void {
  useEffect(() => {
    if (!userId || !online || !materialsUseApi()) return;
    let cancelled = false;
    const run = () => {
      if (cancelled || !offlineEnabled() || (typeof navigator !== 'undefined' && navigator.onLine === false)) return;
      void listMaterials()
        .then((list) => (cancelled ? undefined : syncOfflineMaterials(list)))
        .catch(() => undefined);
    };
    const first = window.setTimeout(run, 4000);
    const timer = window.setInterval(run, PERIOD_MS);
    return () => {
      cancelled = true;
      window.clearTimeout(first);
      window.clearInterval(timer);
    };
  }, [userId, online]);
}
