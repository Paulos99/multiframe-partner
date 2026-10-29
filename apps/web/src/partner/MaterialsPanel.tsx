import { m, motionPresets, usePrefersReducedMotion } from './motionBits';
import { Skeleton } from './Skeleton';
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type MouseEvent as ReactMouseEvent } from 'react';
import type { PublicMaterial } from '../../../api/materialsLib.js';
import { MaterialStubView, PREPARING_LABEL } from './MaterialStubView';
import {
  createMaterialFolder,
  deleteMaterialItem,
  listMaterials,
  materialKindLabel,
  materialsNeedRelogin,
  materialsUseApi,
  openMaterial,
  openMaterialPdfCopy,
  renameMaterialItem,
  replaceMaterialFile,
  uploadMaterialFile,
} from './materialsClient';
import styles from './MaterialsPanel.module.css';
import { ContextMenu, DeleteFolderDialog, folderContents } from './MaterialsContextMenu';
import { openFilePreview, type PreviewItem, type PreviewSource } from '../ui/filePreview/previewStore';
import { FolderIcon as FolderGlyph } from '../icons';
import { MaterialThumb } from './MaterialThumb';
import { thumbnailAfterUpload } from './materialThumbnails';
import {
  getOfflineState,
  isAvailableOffline,
  offlineEnabled,
  offlineMaterialBlob,
  offlineMaterialsList,
  rememberMaterialsList,
  subscribeOffline,
  syncOfflineMaterials,
} from './offlineMaterials';
import { OfflineMaterialsCard } from './OfflineMaterialsCard';
import { useOptionalPartner } from './PartnerContext';

export { PREPARING_LABEL };

type NotedMaterial = {
  kind: string;
  hasFile: boolean;
  stub: string | null;
  size: number | null;
};

/** Текст причины часто сам кончается точкой: без этого в «…материалы.. Показаны» выходило две. */
export function noTrailingDot(text: string): string {
  return text.replace(/[.\s]+$/u, '');
}

export function materialNote(item: NotedMaterial): string {
  if (item.kind === 'folder') return '';
  if (!item.hasFile && item.stub) return PREPARING_LABEL;
  if (item.hasFile && item.size) return `${Math.ceil(item.size / 1024)} КБ`;
  if (!item.hasFile) return 'Файл пока недоступен';
  return '';
}

export function folderCountLabel(count: number): string {
  if (count === 0) return 'Пока пусто';
  const mod10 = count % 10;
  const mod100 = count % 100;
  const word =
    mod10 === 1 && mod100 !== 11
      ? 'материал'
      : mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)
        ? 'материала'
        : 'материалов';
  return `${count} ${word}`;
}

function FolderIcon() {
  return (
    <span className={styles.folderIcon} aria-hidden="true">
      <FolderGlyph />
    </span>
  );
}

export function MaterialsPanel({ canManage: canManageOnline }: { canManage: boolean }) {
  const reduce=usePrefersReducedMotion();
  // Перерисовка, когда меняется набор офлайн-копий (значок «Офлайн» у файлов).
  useSyncExternalStore(subscribeOffline, getOfflineState, getOfflineState);
  /** Без сети показываем сохранённый список: только чтение, правка — онлайн. */
  const partner = useOptionalPartner();
  const logout = (): void => {
    partner?.logout();
  };
  const [offlineView, setOfflineView] = useState<{ at: string | null; reason: string; relogin: boolean } | null>(null);
  const [errorRelogin, setErrorRelogin] = useState(false);
  const [serverList, setServerList] = useState<PublicMaterial[] | null>(null);
  const canManage = canManageOnline && !offlineView;
  const [items, setItems] = useState<PublicMaterial[]>([]);
  const [folderId, setFolderId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [folderDraft, setFolderDraft] = useState('');
  const [makingFolder, setMakingFolder] = useState(false);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const replaceId = useRef<string | null>(null);
  // Правый клик — только мышью: долгое нажатие на телефоне/планшете остаётся системным.
  const lastPointer = useRef<string>('mouse');
  const [menu, setMenu] = useState<{ x: number; y: number; folder: PublicMaterial | null } | null>(null);
  const [doomed, setDoomed] = useState<PublicMaterial | null>(null);
  const closeMenu = useCallback(() => setMenu(null), []);

  async function reload() {
    setLoading(true);
    setError(null);
    setErrorRelogin(false);
    try {
      // Без сети не ждём таймаута запроса — сразу сохранённый список.
      if (typeof navigator !== 'undefined' && navigator.onLine === false && offlineEnabled()) throw new Error('Нет сети');
      const list = await listMaterials();
      setItems(list);
      setServerList(list);
      setOfflineView(null);
      if (offlineEnabled()) {
        rememberMaterialsList(list);
        void syncOfflineMaterials(list);
      }
    } catch (ex) {
      const message = ex instanceof Error ? ex.message : 'Не удалось открыть материалы';
      const relogin = materialsNeedRelogin(ex);
      const saved = await offlineMaterialsList().catch(() => null);
      if (saved) {
        setItems(saved.items);
        setServerList(null);
        setOfflineView({ at: saved.at, reason: message, relogin });
      } else {
        setError(message);
        setErrorRelogin(relogin);
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void reload();
    const onOnline = () => void reload();
    window.addEventListener('online', onOnline);
    return () => window.removeEventListener('online', onOnline);
  }, []);


  const crumbs = useMemo(() => {
    const chain: PublicMaterial[] = [];
    let current = folderId;
    const guard = new Set<string>();
    while (current && !guard.has(current)) {
      guard.add(current);
      const node = items.find((item) => item.id === current);
      if (!node) break;
      chain.push(node);
      current = node.parentId;
    }
    return chain.reverse();
  }, [folderId, items]);

  const visible = useMemo(() => {
    return items
      .filter((item) => (item.parentId ?? null) === folderId)
      .slice()
      .sort((a, b) => {
        if (a.kind !== b.kind) return a.kind === 'folder' ? -1 : 1;
        return a.name.localeCompare(b.name, 'ru');
      });
  }, [items, folderId]);

  const folders = visible.filter((item) => item.kind === 'folder');
  const files = visible.filter((item) => item.kind !== 'folder');

  async function run(task: () => Promise<PublicMaterial[]>): Promise<boolean> {
    setBusy(true);
    setStatus('Сохраняем…');
    setError(null);
    try {
      setItems(await task());
      return true;
    } catch (ex) {
      setError(ex instanceof Error ? ex.message : 'Не удалось сохранить');
      return false;
    } finally {
      setBusy(false);
      setStatus(null);
    }
  }

  function openItem(item: PublicMaterial) {
    if (item.kind === 'folder') {
      setFolderId(item.id);
      setMakingFolder(false);
      return;
    }
    // Окно предпросмотра листает все файлы текущей папки; содержимое грузится лениво.
    const index = Math.max(0, files.findIndex((entry) => entry.id === item.id));
    setError(null);
    openFilePreview(files.map(materialPreviewItem), index);
  }

  async function onFilePick(file: File | undefined) {
    if (!file) return;
    const target = replaceId.current;
    replaceId.current = null;
    const parentId = folderId;
    let saved: PublicMaterial[] | null = null;
    const ok = await run(async () => {
      saved = target
        ? await replaceMaterialFile(target, file)
        : await uploadMaterialFile(file, parentId, (loaded, total) => {
            const percent = total ? Math.floor((loaded / total) * 100) : 0;
            setStatus(`Загрузка «${file.name}»: ${percent}%`);
          });
      return saved;
    });
    // Миниатюра из локального файла (картинка, кадр видео, 1-я страница PDF) — в фоне, без ожидания.
    if (ok && saved && materialsUseApi()) {
      void thumbnailAfterUpload(file, saved, { id: target, parentId }).then((next) => {
        if (next) setItems(next);
      });
    }
  }

  /**
   * Меню по правому клику (только админ StP — сервер всё равно проверяет роль):
   * папка → «Удалить», пустое место списка → «Создать папку». Файлы, поля и
   * кнопки — системное меню браузера.
   */
  function onListContextMenu(event: ReactMouseEvent<HTMLDivElement>) {
    if (!canManage || loading || lastPointer.current !== 'mouse') return;
    const target = event.target as HTMLElement;
    if (target.closest('input, textarea, [contenteditable="true"]')) return;
    const card = target.closest<HTMLElement>('[data-material-id]');
    if (card) {
      const folder = folders.find((item) => item.id === card.dataset.materialId);
      if (!folder || renamingId === folder.id) return;
      event.preventDefault();
      setMenu({ x: event.clientX, y: event.clientY, folder });
      return;
    }
    event.preventDefault();
    setMenu({ x: event.clientX, y: event.clientY, folder: null });
  }

  async function deleteFolder(folder: PublicMaterial): Promise<boolean> {
    const ok = await run(() => deleteMaterialItem(folder.id));
    if (ok) {
      // Если удалили папку из текущего пути — поднимаемся к её родителю.
      if (folderId && crumbs.some((crumb) => crumb.id === folder.id)) setFolderId(folder.parentId ?? null);
      setStatus(null);
    }
    return ok;
  }

  function saveRename(item: PublicMaterial) {
    void run(() => renameMaterialItem(item.id, renameDraft)).then((ok) => {
      if (ok) setRenamingId(null);
    });
  }

  return (
    <div
      className={styles.panel}
      onPointerDownCapture={(event) => {
        lastPointer.current = event.pointerType || 'mouse';
      }}
    >
      <p className={styles.lead}>Инструкции и презентации по продукту.</p>
      {offlineView ? (
        <p className={styles.status} role="status" data-testid="materials-offline-note">
          {noTrailingDot(typeof navigator !== 'undefined' && navigator.onLine === false ? 'Нет сети' : offlineView.reason)}.
          {' '}Показаны офлайн-копии
          {offlineView.at ? ` от ${new Date(offlineView.at).toLocaleString('ru-RU', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })}` : ''}
          . Открываются файлы со значком «Офлайн».
          {offlineView.relogin ? (
            <>
              {' '}
              <button type="button" className={styles.ghost} onClick={() => logout()} data-testid="materials-relogin">
                Войти заново
              </button>
            </>
          ) : null}
        </p>
      ) : null}
      {materialsUseApi() ? <OfflineMaterialsCard list={serverList} offline={!!offlineView} /> : null}
      <nav className={styles.crumbs} aria-label="Папки">
        <button type="button" className={folderId ? styles.crumbBtn : styles.crumbCurrent} onClick={() => setFolderId(null)}>
          Все материалы
        </button>
        {crumbs.map((crumb, index) => {
          const last = index === crumbs.length - 1;
          return (
            <span key={crumb.id} className={styles.crumb}>
              <span aria-hidden="true">/</span>
              <button
                type="button"
                className={last ? styles.crumbCurrent : styles.crumbBtn}
                onClick={() => setFolderId(crumb.id)}
              >
                {crumb.name}
              </button>
            </span>
          );
        })}
      </nav>

      {canManage ? (
        <div className={styles.admin}>
          {makingFolder ? (
            <form
              className={styles.create}
              onSubmit={(event) => {
                event.preventDefault();
                const name = folderDraft.trim();
                if (!name) return;
                void run(() => createMaterialFolder(name, folderId)).then((ok) => {
                  if (!ok) return;
                  setFolderDraft('');
                  setMakingFolder(false);
                });
              }}
            >
              <input
                autoFocus
                value={folderDraft}
                onChange={(event) => setFolderDraft(event.target.value)}
                placeholder="Название папки"
                aria-label="Название папки"
                required
              />
              <button type="submit" className={styles.primary} disabled={busy}>
                Создать
              </button>
              <button type="button" className={styles.ghost} onClick={() => setMakingFolder(false)}>
                Отмена
              </button>
            </form>
          ) : (
            <div className={styles.actions}>
              <button type="button" className={styles.ghost} onClick={() => setMakingFolder(true)}>
                Новая папка
              </button>
              <button
                type="button"
                className={styles.primary}
                disabled={busy}
                onClick={() => {
                  replaceId.current = null;
                  fileRef.current?.click();
                }}
              >
                Загрузить файл
              </button>
            </div>
          )}
          <input
            ref={fileRef}
            className={styles.filePick}
            type="file"
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = '';
              void onFilePick(file);
            }}
          />
        </div>
      ) : null}

      {error ? (
        <div className={styles.error} role="alert">
          <span>{error}</span>
          {errorRelogin ? (
            <button type="button" className={styles.ghost} onClick={() => logout()} data-testid="materials-relogin">
              Войти заново
            </button>
          ) : null}
          <button type="button" className={styles.ghost} onClick={() => void reload()}>
            Обновить
          </button>
        </div>
      ) : null}
      {status && !loading ? (
        <p className={styles.status} role="status">
          {status}
        </p>
      ) : null}
      {loading ? (
        <Skeleton kind="rows" count={4} label="Загружаем материалы"/>
      ) : null}

      {!loading ? (
        <div className={styles.list} onContextMenu={onListContextMenu} data-testid="materials-list">
          {folders.length ? (
            <div className={styles.folders}>
              {folders.map((item) => (
                <m.article layout={!reduce} initial={reduce?false:motionPresets.page.initial} animate={motionPresets.page.animate} key={item.id} className={styles.folder} data-material-id={item.id}>
                  {renamingId === item.id ? (
                    <input
                      className={styles.rename}
                      value={renameDraft}
                      aria-label="Новое название"
                      onChange={(event) => setRenameDraft(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                          event.preventDefault();
                          saveRename(item);
                        }
                      }}
                    />
                  ) : (
                    <button type="button" className={styles.open} onClick={() => void openItem(item)}>
                      <FolderIcon />
                      <span className={styles.srOnly}>Папка</span>
                      <span className={styles.copy}>
                        <span className={styles.name}>{item.name}</span>
                        <span className={styles.meta}>
                          {folderCountLabel(items.filter((child) => child.parentId === item.id).length)}
                        </span>
                      </span>
                      <span className={styles.chevron} aria-hidden="true">
                        ›
                      </span>
                    </button>
                  )}
                  {canManage ? (
                    <ItemActions
                      item={item}
                      busy={busy}
                      renaming={renamingId === item.id}
                      onRename={() => {
                        setRenamingId(item.id);
                        setRenameDraft(item.name);
                      }}
                      onSave={() => saveRename(item)}
                      onDelete={() => setDoomed(item)}
                    />
                  ) : null}
                </m.article>
              ))}
            </div>
          ) : null}
          {files.length ? (
            <div className={styles.files}>
              {files.map((item) => {
                const preparing = !item.hasFile && Boolean(item.stub);
                return (
                  <m.article layout={!reduce} initial={reduce?false:motionPresets.page.initial} animate={motionPresets.page.animate} key={item.id} className={preparing ? styles.stub : styles.file} data-material-id={item.id}>
                    {renamingId === item.id ? (
                      <input
                        className={styles.rename}
                        value={renameDraft}
                        aria-label="Новое название"
                        onChange={(event) => setRenameDraft(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') {
                            event.preventDefault();
                            saveRename(item);
                          }
                        }}
                      />
                    ) : (
                      <button type="button" className={`${styles.open} ${styles.fileOpen}`} onClick={() => void openItem(item)}>
                        <MaterialThumb key={item.thumbnailUrl || item.id} item={item} />
                        <span className={styles.copy}>
                          <span className={styles.kind}>{materialKindLabel(item)}</span>
                          <span className={styles.name}>{item.name}</span>
                          {isAvailableOffline(item.id) ? (
                            <span className={styles.offlineBadge} data-testid="offline-badge">
                              Офлайн
                            </span>
                          ) : null}
                          {materialNote(item) === PREPARING_LABEL ? (
                            <span className={styles.pending}>{PREPARING_LABEL}</span>
                          ) : materialNote(item) ? (
                            <span className={styles.meta}>{materialNote(item)}</span>
                          ) : null}
                        </span>
                      </button>
                    )}
                    {canManage ? (
                      <ItemActions
                        item={item}
                        busy={busy}
                        renaming={renamingId === item.id}
                        onRename={() => {
                          setRenamingId(item.id);
                          setRenameDraft(item.name);
                        }}
                        onSave={() => saveRename(item)}
                        onReplace={() => {
                          replaceId.current = item.id;
                          fileRef.current?.click();
                        }}
                        onDelete={() => {
                          if (!confirm(`Удалить «${item.name}»?`)) return;
                          void run(() => deleteMaterialItem(item.id));
                        }}
                      />
                    ) : null}
                  </m.article>
                );
              })}
            </div>
          ) : null}
          {!visible.length ? (
            <div className={styles.empty}>
              <strong>Пока пусто</strong>
              <span>В этой папке нет материалов.</span>
            </div>
          ) : null}
        </div>
      ) : null}

      {menu ? (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          label={menu.folder ? `Папка «${menu.folder.name}»` : 'Материалы'}
          onClose={closeMenu}
          items={
            menu.folder
              ? [{ label: 'Удалить', danger: true, onSelect: () => setDoomed(menu.folder) }]
              : [
                  {
                    label: 'Создать папку',
                    onSelect: () => {
                      setRenamingId(null);
                      setMakingFolder(true);
                    },
                  },
                ]
          }
        />
      ) : null}
      {doomed ? (
        <DeleteFolderDialog
          folder={doomed}
          contents={folderContents(items, doomed.id)}
          onConfirm={() => deleteFolder(doomed)}
          onClose={() => setDoomed(null)}
        />
      ) : null}

    </div>
  );
}

function ItemActions({
  item,
  busy,
  renaming,
  onRename,
  onSave,
  onReplace,
  onDelete,
}: {
  item: PublicMaterial;
  busy: boolean;
  renaming: boolean;
  onRename: () => void;
  onSave: () => void;
  onReplace?: () => void;
  onDelete: () => void;
}) {
  return (
    <div className={styles.rowActions}>
      {renaming ? (
        <button type="button" className={styles.primary} disabled={busy} onClick={onSave}>
          Сохранить
        </button>
      ) : (
        <button type="button" className={styles.ghost} onClick={onRename}>
          Переименовать
        </button>
      )}
      {item.kind === 'file' && onReplace ? (
        <button type="button" className={styles.ghost} disabled={busy} onClick={onReplace}>
          Заменить
        </button>
      ) : null}
      <button type="button" className={styles.danger} disabled={busy} onClick={onDelete}>
        Удалить
      </button>
    </div>
  );
}

function materialPreviewItem(item: PublicMaterial): PreviewItem {
  return {
    id: item.id,
    name: item.name,
    mime: item.mime,
    size: item.size,
    load: async (): Promise<PreviewSource> => {
      const local = async (): Promise<PreviewSource | null> => {
        const copy = await offlineMaterialBlob(item.id).catch(() => null);
        return copy ? { blob: copy.blob, mime: copy.mime } : null;
      };
      // Без сети — сразу с устройства.
      if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        const saved = await local();
        if (saved) return saved;
        throw new Error('Нет сети, а офлайн-копии этого файла на устройстве нет');
      }
      let content: Awaited<ReturnType<typeof openMaterial>>;
      let pdfCopy: Awaited<ReturnType<typeof openMaterialPdfCopy>>;
      try {
        [content, pdfCopy] = await Promise.all([openMaterial(item), openMaterialPdfCopy(item)]);
      } catch (error) {
        // Сервер недоступен (или сессия истекла) — откроем офлайн-копию, если она есть.
        const saved = await local();
        if (saved) return saved;
        throw error;
      }
      const extra = pdfCopy ? { pdfCopy } : {};
      if (content.kind === 'stub') return { node: <MaterialStubView stub={content.stub} /> };
      if (content.kind === 'remote')
        return {
          url: content.url,
          mime: content.mime,
          ...(content.streamUrl ? { playbackUrl: content.streamUrl } : {}),
          poster: item.thumbnailUrl ?? null,
          ...extra,
        };
      return { blob: content.blob, mime: content.mime, ...extra };
    },
  };
}
