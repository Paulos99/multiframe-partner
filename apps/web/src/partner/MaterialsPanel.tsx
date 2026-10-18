import { m, AnimatePresence, motionPresets, usePrefersReducedMotion } from './motionBits';
import { Skeleton } from './Skeleton';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { PublicMaterial } from '../../../api/materialsLib.js';
import { MaterialStubView, PREPARING_LABEL } from './MaterialStubView';
import {
  createMaterialFolder,
  deleteMaterialItem,
  listMaterials,
  materialKindLabel,
  openMaterial,
  renameMaterialItem,
  replaceMaterialFile,
  uploadMaterialFile,
} from './materialsClient';
import styles from './MaterialsPanel.module.css';

type Preview =
  | { mode: 'stub'; name: string; stub: string }
  | { mode: 'file'; name: string; mime: string; url: string; revoke: boolean };

export { PREPARING_LABEL };

type NotedMaterial = {
  kind: string;
  hasFile: boolean;
  stub: string | null;
  size: number | null;
};

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
      <svg viewBox="0 0 24 24">
        <path
          fill="currentColor"
          d="M3.5 6.75A2.25 2.25 0 0 1 5.75 4.5h3.1c.5 0 .97.2 1.32.55l1.2 1.2h6.88a2.25 2.25 0 0 1 2.25 2.25v8.25a2.25 2.25 0 0 1-2.25 2.25h-12.5a2.25 2.25 0 0 1-2.25-2.25V6.75Z"
        />
      </svg>
    </span>
  );
}

export function MaterialsPanel({ canManage }: { canManage: boolean }) {
  const reduce=usePrefersReducedMotion();
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
  const [preview, setPreview] = useState<Preview | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const replaceId = useRef<string | null>(null);

  async function reload() {
    setLoading(true);
    setError(null);
    try {
      setItems(await listMaterials());
    } catch (ex) {
      setError(ex instanceof Error ? ex.message : 'Не удалось открыть материалы');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void reload();
  }, []);

  useEffect(() => {
    if (!preview || preview.mode !== 'file' || !preview.revoke) return;
    const url = preview.url;
    return () => URL.revokeObjectURL(url);
  }, [preview]);

  useEffect(() => {
    if (!preview) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') setPreview(null);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [preview]);

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

  async function openItem(item: PublicMaterial) {
    if (item.kind === 'folder') {
      setFolderId(item.id);
      setMakingFolder(false);
      return;
    }
    setBusy(true);
    setStatus('Открываем…');
    setError(null);
    try {
      const content = await openMaterial(item);
      if (content.kind === 'stub') {
        setPreview({ mode: 'stub', name: content.name, stub: content.stub });
      } else if (content.kind === 'remote') {
        setPreview({
          mode: 'file',
          name: content.name,
          mime: content.mime,
          url: content.url,
          revoke: false,
        });
      } else {
        setPreview({
          mode: 'file',
          name: content.name,
          mime: content.mime,
          url: URL.createObjectURL(content.blob),
          revoke: true,
        });
      }
    } catch (ex) {
      setError(ex instanceof Error ? ex.message : 'Не удалось открыть файл');
    } finally {
      setBusy(false);
      setStatus(null);
    }
  }

  async function onFilePick(file: File | undefined) {
    if (!file) return;
    const target = replaceId.current;
    replaceId.current = null;
    if (target) await run(() => replaceMaterialFile(target, file));
    else await run(() => uploadMaterialFile(file, folderId));
  }

  function saveRename(item: PublicMaterial) {
    void run(() => renameMaterialItem(item.id, renameDraft)).then((ok) => {
      if (ok) setRenamingId(null);
    });
  }

  return (
    <div className={styles.panel}>
      <p className={styles.lead}>Инструкции и презентации по продукту.</p>
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
            accept=".pdf,.mp4,.webm,.mov,.ppt,.pptx,.png,.jpg,.jpeg,.webp,.doc,.docx,.txt,video/*,image/*,application/pdf"
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
        <>
          {folders.length ? (
            <div className={styles.folders}>
              {folders.map((item) => (
                <m.article layout={!reduce} initial={reduce?false:motionPresets.page.initial} animate={motionPresets.page.animate} key={item.id} className={styles.folder}>
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
                      onDelete={() => {
                        if (!confirm(`Удалить «${item.name}»? Папка удалится вместе с файлами.`)) return;
                        if (folderId === item.id) setFolderId(item.parentId);
                        void run(() => deleteMaterialItem(item.id));
                      }}
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
                  <m.article layout={!reduce} initial={reduce?false:motionPresets.page.initial} animate={motionPresets.page.animate} key={item.id} className={preparing ? styles.stub : styles.file}>
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
                        <span className={styles.copy}>
                          <span className={styles.kind}>{materialKindLabel(item)}</span>
                          <span className={styles.name}>{item.name}</span>
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
        </>
      ) : null}

      <AnimatePresence>{preview ? (
        <m.div initial={reduce?false:motionPresets.modal.initial} animate={motionPresets.modal.animate} exit={reduce?undefined:motionPresets.modal.exit} className={styles.viewer} role="dialog" aria-modal="true" aria-label={preview.name}>
          <div className={styles.sheet}>
            <header className={styles.head}>
              <h3>{preview.name}</h3>
              <button type="button" className={styles.ghost} onClick={() => setPreview(null)} autoFocus>
                Закрыть
              </button>
            </header>
            <div className={styles.body}>
              {preview.mode === 'stub' ? (
                <MaterialStubView stub={preview.stub} />
              ) : preview.mime.startsWith('video/') ? (
                <video className={styles.media} controls src={preview.url} />
              ) : preview.mime.startsWith('image/') ? (
                <img className={styles.media} src={preview.url} alt={preview.name} />
              ) : preview.mime === 'application/pdf' ? (
                <iframe className={styles.frame} title={preview.name} src={preview.url} />
              ) : (
                <p className={styles.lead}>
                  Файл можно скачать.{' '}
                  {preview.revoke ? (
                    <a className={styles.download} href={preview.url} download={preview.name}>
                      Скачать
                    </a>
                  ) : (
                    <a className={styles.download} href={preview.url} target="_blank" rel="noopener noreferrer">
                      Скачать
                    </a>
                  )}
                </p>
              )}
            </div>
          </div>
        </m.div>
      ) : null}</AnimatePresence>
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
