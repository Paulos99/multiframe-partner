import { useEffect, useMemo, useRef, useState } from 'react';
import type { PublicMaterial } from '../../../api/materialsLib.js';
import { MaterialStubView } from './MaterialStubView';
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
import styles from './partner.module.css';

type Preview =
  | { mode: 'stub'; name: string; stub: string }
  | { mode: 'file'; name: string; mime: string; url: string };

export function MaterialsPanel({ canManage }: { canManage: boolean }) {
  const [items, setItems] = useState<PublicMaterial[]>([]);
  const [folderId, setFolderId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
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
    if (!preview || preview.mode !== 'file') return;
    const url = preview.url;
    return () => URL.revokeObjectURL(url);
  }, [preview]);

  useEffect(() => {
    if (!preview) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setPreview(null);
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

  async function run(task: () => Promise<PublicMaterial[]>): Promise<boolean> {
    setBusy(true);
    setError(null);
    try {
      setItems(await task());
      return true;
    } catch (ex) {
      setError(ex instanceof Error ? ex.message : 'Не удалось сохранить');
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function openItem(item: PublicMaterial) {
    if (item.kind === 'folder') {
      setFolderId(item.id);
      setMakingFolder(false);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const content = await openMaterial(item);
      if (content.kind === 'stub') {
        setPreview({ mode: 'stub', name: content.name, stub: content.stub });
      } else {
        setPreview({
          mode: 'file',
          name: content.name,
          mime: content.mime,
          url: URL.createObjectURL(content.blob),
        });
      }
    } catch (ex) {
      setError(ex instanceof Error ? ex.message : 'Не удалось открыть файл');
    } finally {
      setBusy(false);
    }
  }

  async function onFilePick(file: File | undefined) {
    if (!file) return;
    const target = replaceId.current;
    replaceId.current = null;
    if (target) await run(() => replaceMaterialFile(target, file));
    else await run(() => uploadMaterialFile(file, folderId));
  }

  return (
    <div className={styles.materials}>
      <p className={styles.lead}>
        Инструкции, презентации и видео по продукту STP MultiFrame. Открываются у владельца,
        менеджера, замерщика и монтажника.
      </p>
      <nav className={styles.crumbs} aria-label="Папки">
        <button type="button" className={styles.linkish} onClick={() => setFolderId(null)}>
          Все материалы
        </button>
        {crumbs.map((crumb) => (
          <span key={crumb.id} className={styles.crumb}>
            <span aria-hidden="true">/</span>
            <button type="button" className={styles.linkish} onClick={() => setFolderId(crumb.id)}>
              {crumb.name}
            </button>
          </span>
        ))}
      </nav>

      {canManage ? (
        <div className={styles.matAdmin}>
          {makingFolder ? (
            <form
              className={styles.matCreate}
              onSubmit={(e) => {
                e.preventDefault();
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
                onChange={(e) => setFolderDraft(e.target.value)}
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
            <div className={styles.rowActions}>
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
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = '';
              void onFilePick(file);
            }}
          />
        </div>
      ) : null}

      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}
      {loading ? <div className={`${styles.skeleton} ${styles.skeletonRow}`} /> : null}

      {!loading ? (
        <div className={styles.matList}>
          {visible.map((item) => (
            <article key={item.id} className={styles.matItem}>
              <div className={styles.matMain}>
                <span className={item.kind === 'folder' ? styles.matFolder : styles.matFile} aria-hidden="true">
                  {item.kind === 'folder' ? 'Папка' : materialKindLabel(item)}
                </span>
                <span className={styles.matText}>
                  {renamingId === item.id ? (
                    <input
                      value={renameDraft}
                      aria-label="Новое название"
                      onChange={(e) => setRenameDraft(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          void run(() => renameMaterialItem(item.id, renameDraft)).then((ok) => {
                            if (ok) setRenamingId(null);
                          });
                        }
                      }}
                    />
                  ) : (
                    <button type="button" className={styles.matOpen} onClick={() => void openItem(item)}>
                      {item.name}
                    </button>
                  )}
                  <span className={styles.hint}>
                    {materialKindLabel(item)}
                    {item.hasFile && item.size ? ` · ${Math.ceil(item.size / 1024)} КБ` : ''}
                    {!item.hasFile && item.stub ? ' · демо' : ''}
                  </span>
                </span>
              </div>
              {canManage ? (
                <div className={styles.rowActions}>
                  {renamingId === item.id ? (
                    <button
                      type="button"
                      className={styles.primary}
                      disabled={busy}
                      onClick={() =>
                        void run(() => renameMaterialItem(item.id, renameDraft)).then((ok) => {
                          if (ok) setRenamingId(null);
                        })
                      }
                    >
                      Сохранить
                    </button>
                  ) : (
                    <button
                      type="button"
                      className={styles.ghost}
                      onClick={() => {
                        setRenamingId(item.id);
                        setRenameDraft(item.name);
                      }}
                    >
                      Переименовать
                    </button>
                  )}
                  {item.kind === 'file' ? (
                    <button
                      type="button"
                      className={styles.ghost}
                      disabled={busy}
                      onClick={() => {
                        replaceId.current = item.id;
                        fileRef.current?.click();
                      }}
                    >
                      Заменить
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className={styles.danger}
                    disabled={busy}
                    onClick={() => {
                      const extra = item.kind === 'folder' ? ' Папка удалится вместе с файлами.' : '';
                      if (!confirm(`Удалить «${item.name}»?${extra}`)) return;
                      if (folderId === item.id) setFolderId(item.parentId);
                      void run(() => deleteMaterialItem(item.id));
                    }}
                  >
                    Удалить
                  </button>
                </div>
              ) : null}
            </article>
          ))}
          {!visible.length ? (
            <p className={styles.lead}>В этой папке пока пусто.</p>
          ) : null}
        </div>
      ) : null}

      {preview ? (
        <div className={styles.viewer} role="dialog" aria-modal="true" aria-label={preview.name}>
          <div className={styles.viewerSheet}>
            <header className={styles.viewerHead}>
              <h3>{preview.name}</h3>
              <button type="button" className={styles.ghost} onClick={() => setPreview(null)} autoFocus>
                Закрыть
              </button>
            </header>
            <div className={styles.viewerBody}>
              {preview.mode === 'stub' ? (
                <MaterialStubView stub={preview.stub} />
              ) : preview.mime.startsWith('video/') ? (
                <video className={styles.viewerMedia} controls src={preview.url} />
              ) : preview.mime.startsWith('image/') ? (
                <img className={styles.viewerMedia} src={preview.url} alt={preview.name} />
              ) : preview.mime === 'application/pdf' ? (
                <iframe className={styles.viewerFrame} title={preview.name} src={preview.url} />
              ) : (
                <p className={styles.lead}>
                  Файл загружен.{' '}
                  <a className={styles.callLink} href={preview.url} download={preview.name}>
                    Скачать
                  </a>
                </p>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
