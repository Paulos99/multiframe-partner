import { useContext, useEffect, useId, useRef, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import type { PublicMaterial } from '../../../api/materialsLib.js';
import { SettingsIcon } from '../icons';
import { OfflineGearSlot } from './offlineGearSlot';
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
import { offlineAccessMode, planOfflineSync } from './offlineMaterialsPlan';
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
 * «Скачать для офлайна»: до загрузки — короткое предложение, во время загрузки — прогресс.
 * Когда копии уже есть, кнопки «Обновить» и «Удалить» живут в шестерёнке шапки «Обучения».
 */
export function OfflineMaterialsCard({ list, offline }: { list: PublicMaterial[] | null; offline: boolean }) {
  const s = useSyncExternalStore(subscribeOffline, getOfflineState, getOfflineState);
  const slot = useContext(OfflineGearSlot);
  const [open, setOpen] = useState(false);
  const gearRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useEffect(() => {
    void refreshStorageEstimate();
  }, []);

  const mode = offlineAccessMode(s);
  useEffect(() => {
    if (mode !== 'gear') setOpen(false);
  }, [mode]);
  useEffect(() => {
    if (!open) return;
    panelRef.current?.focus();
    function onKey(event: KeyboardEvent) {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      setOpen(false);
      gearRef.current?.focus();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  if (!s.supported) return null;

  const plan = list ? planOfflineSync(list, {}) : null;
  const needBytes = plan ? plan.bytesTotal : s.planBytes;
  const needFiles = plan ? plan.files : s.planFiles;
  const free = s.quota != null && s.usage != null ? Math.max(0, s.quota - s.usage) : null;
  const storage = s.usage != null && s.quota != null ? `На устройстве занято ${formatBytes(s.usage)}, свободно ${formatBytes(free)}` : '';
  const percent = s.bytesTotal ? Math.min(100, Math.round((s.bytesDone / s.bytesTotal) * 100)) : 0;
  const short = free != null && !s.enabled && needBytes > free;
  const ready = needFiles > 0 && s.savedFiles >= needFiles;
  const status = ready
    ? `Все материалы на устройстве · ${filesLabel(s.savedFiles)} · ${formatBytes(s.savedBytes)}`
    : `На устройстве ${s.savedFiles} из ${filesLabel(needFiles)} · ${formatBytes(s.savedBytes)}`;
  const updated = !s.running && s.syncedAt ? `Обновлено ${timeLabel(s.syncedAt)}` : '';

  async function download() {
    await enableOfflineMaterials();
    if (list) void syncOfflineMaterials(list);
  }

  function removeCopies() {
    if (!confirm('Удалить офлайн-копии материалов с этого устройства?')) return;
    void disableOfflineMaterials();
  }

  const gear =
    mode === 'gear' && slot ? (
      <div className={styles.offlineGearWrap}>
        <button
          ref={gearRef}
          type="button"
          className={styles.offlineGear}
          aria-label="Офлайн-доступ"
          title="Офлайн-доступ"
          aria-expanded={open}
          aria-haspopup="dialog"
          aria-controls={open ? titleId : undefined}
          data-testid="offline-gear"
          onClick={() => setOpen((value) => !value)}
        >
          <SettingsIcon size={22} />
          {s.savedFiles > 0 ? (
            <span className={styles.offlineGearDot} data-testid="offline-gear-dot" aria-hidden="true" />
          ) : null}
        </button>
        {open ? (
          <>
            <button type="button" className={styles.offlineBackdrop} aria-label="Закрыть офлайн-доступ" onClick={() => setOpen(false)} />
            <div
              ref={panelRef}
              role="dialog"
              aria-labelledby={titleId}
              tabIndex={-1}
              className={styles.offlinePop}
              data-testid="offline-panel"
            >
              <h3 id={titleId} className={styles.offlinePopTitle}>
                Офлайн-доступ
              </h3>
              <p className={styles.offlineMeta}>{status}</p>
              {updated ? <p className={styles.offlineMeta}>{updated}</p> : null}
              {storage ? <p className={styles.offlineMeta}>{storage}</p> : null}
              {s.error ? (
                <p className={styles.offlineWarn} role="alert">
                  {s.error}
                </p>
              ) : null}
              <div className={styles.offlinePopActions}>
                <button type="button" className={styles.ghost} disabled={!list || offline} onClick={() => list && void syncOfflineMaterials(list)}>
                  Обновить сейчас
                </button>
                <button type="button" className={styles.danger} onClick={removeCopies}>
                  Удалить офлайн-копии
                </button>
              </div>
            </div>
          </>
        ) : null}
      </div>
    ) : null;

  return (
    <>
      {gear ? createPortal(gear, slot!) : null}
      {mode === 'gear' ? null : (
        <section className={styles.offline} aria-label="Офлайн-доступ" data-testid="offline-card">
          {mode === 'progress' ? (
            <>
              <div className={styles.offlineProgress}>
                <progress max={100} value={percent} aria-label="Скачивание материалов" />
                <span className={styles.offlineMeta}>
                  Скачиваем: {s.filesDone} из {s.filesTotal}
                  {s.bytesTotal ? ` · ${formatBytes(s.bytesDone)} из ${formatBytes(s.bytesTotal)}` : ''}
                  {s.current ? ` · «${s.current}»` : ''}
                </span>
              </div>
              {s.error ? (
                <p className={styles.offlineWarn} role="alert">
                  {s.error}
                </p>
              ) : null}
              <div className={styles.actions}>
                <button type="button" className={styles.ghost} onClick={stopOfflineSync}>
                  Остановить
                </button>
              </div>
            </>
          ) : (
            <>
              <p className={styles.offlineMeta}>
                {!list && !needFiles
                  ? 'Считаем размер…'
                  : `${filesLabel(needFiles)} · около ${formatBytes(needBytes)}. Будут открываться без интернета и обновляться сами.`}
              </p>
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
                <button type="button" className={styles.primary} disabled={!list || offline} onClick={() => void download()}>
                  Скачать для офлайна
                </button>
              </div>
            </>
          )}
        </section>
      )}
    </>
  );
}
