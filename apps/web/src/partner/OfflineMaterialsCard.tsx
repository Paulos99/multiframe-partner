import { useEffect, useSyncExternalStore } from 'react';
import type { PublicMaterial } from '../../../api/materialsLib.js';
import {
  disableOfflineMaterials,
  enableOfflineMaterials,
  formatBytes,
  getOfflineState,
  refreshStorageEstimate,
  stopOfflineSync,
  subscribeOffline,
  syncOfflineMaterials,
} from './offlineMaterials';
import { planOfflineSync } from './offlineMaterialsPlan';
import styles from './MaterialsPanel.module.css';

export function filesLabel(n: number): string {
  const m10 = n % 10;
  const m100 = n % 100;
  const word = m10 === 1 && m100 !== 11 ? 'файл' : m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14) ? 'файла' : 'файлов';
  return `${n} ${word}`;
}

function timeLabel(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleString('ru-RU', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });
}

/**
 * «Скачать для офлайна»: оценка размера, место на устройстве, прогресс, удаление копий.
 * list — текущий список с сервера (null, если сейчас показывается сохранённый офлайн).
 */
export function OfflineMaterialsCard({ list, offline }: { list: PublicMaterial[] | null; offline: boolean }) {
  const s = useSyncExternalStore(subscribeOffline, getOfflineState, getOfflineState);
  useEffect(() => {
    void refreshStorageEstimate();
  }, []);
  if (!s.supported) return null;

  const plan = list ? planOfflineSync(list, {}) : null;
  const needBytes = plan ? plan.bytesTotal : s.planBytes;
  const needFiles = plan ? plan.files : s.planFiles;
  const free = s.quota != null && s.usage != null ? Math.max(0, s.quota - s.usage) : null;
  const storage = s.usage != null && s.quota != null ? `На устройстве занято ${formatBytes(s.usage)}, свободно ${formatBytes(free)}` : '';
  const percent = s.bytesTotal ? Math.min(100, Math.round((s.bytesDone / s.bytesTotal) * 100)) : 0;
  const short = free != null && !s.enabled && needBytes > free;

  return (
    <section className={styles.offline} aria-label="Офлайн-доступ" data-testid="offline-card">
      <div className={styles.offlineHead}>
        <strong>Офлайн-доступ</strong>
        {s.enabled ? (
          <span className={styles.offlineMeta}>
            {s.running
              ? `Скачиваем: ${s.filesDone} из ${s.filesTotal}`
              : s.savedFiles >= needFiles && needFiles > 0
                ? `Все материалы на устройстве · ${formatBytes(s.savedBytes)}`
                : `На устройстве ${s.savedFiles} из ${filesLabel(needFiles)} · ${formatBytes(s.savedBytes)}`}
            {!s.running && s.syncedAt ? ` · обновлено ${timeLabel(s.syncedAt)}` : ''}
          </span>
        ) : (
          <span className={styles.offlineMeta}>
            {!list && !needFiles
              ? 'Считаем размер…'
              : `${filesLabel(needFiles)} · около ${formatBytes(needBytes)}. Будут открываться без интернета и обновляться сами.`}
          </span>
        )}
      </div>

      {s.running ? (
        <div className={styles.offlineProgress}>
          <progress max={100} value={percent} aria-label="Скачивание материалов" />
          <span className={styles.offlineMeta}>
            {formatBytes(s.bytesDone)} из {formatBytes(s.bytesTotal)}
            {s.current ? ` · «${s.current}»` : ''}
          </span>
        </div>
      ) : null}

      {storage ? <span className={styles.offlineMeta}>{storage}</span> : null}
      {short ? (
        <p className={styles.offlineWarn} role="note">
          Свободного места может не хватить. Скачаем, сколько поместится.
        </p>
      ) : null}
      {s.error ? (
        <p className={styles.offlineWarn} role="alert">
          {s.error}
        </p>
      ) : null}

      <div className={styles.actions}>
        {!s.enabled ? (
          <button
            type="button"
            className={styles.primary}
            disabled={!list || offline}
            onClick={async () => {
              await enableOfflineMaterials();
              if (list) void syncOfflineMaterials(list);
            }}
          >
            Скачать для офлайна
          </button>
        ) : s.running ? (
          <button type="button" className={styles.ghost} onClick={stopOfflineSync}>
            Остановить
          </button>
        ) : (
          <button type="button" className={styles.ghost} disabled={!list || offline} onClick={() => list && void syncOfflineMaterials(list)}>
            Обновить сейчас
          </button>
        )}
        {s.enabled ? (
          <button
            type="button"
            className={styles.danger}
            onClick={() => {
              if (!confirm('Удалить офлайн-копии материалов с этого устройства?')) return;
              void disableOfflineMaterials();
            }}
          >
            Удалить офлайн-копии
          </button>
        ) : null}
      </div>
    </section>
  );
}
