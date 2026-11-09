import { useEffect, useRef, useState, type FormEvent } from 'react';
import {
  FEEDBACK_PHOTO_LIMIT,
  FEEDBACK_TEXT_MAX,
  FEEDBACK_TYPE_LABELS,
  FEEDBACK_TYPES,
  type FeedbackItem,
  type FeedbackType,
} from '../../../../../packages/shared/feedback.js';
import { CloseIcon } from '../../icons';
import { Button } from '../../ui/Button';
import { apiCreateFeedback, apiListFeedback, apiUploadFeedbackPhoto, hasRemoteApi } from '../apiClient';
import { collectFeedbackContext } from '../feedbackContext';
import { loadToken } from '../localStore';
import { m, motionPresets, usePrefersReducedMotion } from '../motionBits';
import { PhotoPrepError, prepareImage, type PreparedImage } from '../photos/imagePrep';
import { FeedbackCard } from './FeedbackCard';
import styles from './feedback.module.css';

type Tab = 'new' | 'mine';
type Picked = { key: string; prepared: PreparedImage };

const TYPE_HINTS: Record<FeedbackType, string> = {
  bug: 'Что-то не работает или работает не так',
  idea: 'Как сделать удобнее',
  question: 'Непонятно, как что-то сделать',
};

/** Окно «Обратная связь»: новое обращение с фото и список своих обращений с ответами StP. */
export function FeedbackDialog({ onClose, startTab = 'new' }: { onClose: () => void; startTab?: Tab }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const reduce = usePrefersReducedMotion();
  // Контекст снимаем в момент открытия: какой раздел был на экране, когда нажали кнопку.
  const [context] = useState(() => collectFeedbackContext());
  const connected = hasRemoteApi() && Boolean(loadToken());
  const [tab, setTab] = useState<Tab>(startTab);
  const [type, setType] = useState<FeedbackType>('bug');
  const [text, setText] = useState('');
  const [photos, setPhotos] = useState<Picked[]>([]);
  const [preparing, setPreparing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState('');
  const [error, setError] = useState('');
  const [done, setDone] = useState('');
  const [mine, setMine] = useState<FeedbackItem[] | null>(null);
  const [mineError, setMineError] = useState('');

  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, []);

  useEffect(() => {
    if (tab !== 'mine' || !connected) return;
    const ctrl = new AbortController();
    setMineError('');
    apiListFeedback({}, ctrl.signal)
      .then((data) => setMine(data.items))
      .catch((e) => {
        if (!ctrl.signal.aborted) setMineError(e instanceof Error ? e.message : 'Не удалось загрузить обращения');
      });
    return () => ctrl.abort();
  }, [tab, connected]);

  async function addFiles(list: FileList | null) {
    const files = Array.from(list || []);
    if (!files.length) return;
    setError('');
    const room = FEEDBACK_PHOTO_LIMIT - photos.length;
    if (room <= 0) {
      setError(`Не больше ${FEEDBACK_PHOTO_LIMIT} фото`);
      return;
    }
    if (files.length > room) setError(`Добавлено ${room} из ${files.length}: не больше ${FEEDBACK_PHOTO_LIMIT} фото`);
    setPreparing(true);
    try {
      const next: Picked[] = [];
      for (const file of files.slice(0, room)) {
        next.push({ key: `${Date.now()}-${Math.random().toString(36).slice(2)}`, prepared: await prepareImage(file) });
      }
      setPhotos((prev) => [...prev, ...next].slice(0, FEEDBACK_PHOTO_LIMIT));
    } catch (e) {
      setError(e instanceof PhotoPrepError ? e.message : 'Не удалось подготовить фото');
    } finally {
      setPreparing(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setError('');
    setDone('');
    if (!text.trim()) {
      setError('Опишите, что случилось или что предлагаете');
      return;
    }
    setBusy(true);
    try {
      setProgress('Отправляем…');
      const item = await apiCreateFeedback({ type, text: text.trim(), context });
      let failed = 0;
      for (let i = 0; i < photos.length; i += 1) {
        setProgress(`Фото ${i + 1} из ${photos.length}…`);
        try {
          await apiUploadFeedbackPhoto(item.id, { image: photos[i].prepared.image, thumb: photos[i].prepared.thumb });
        } catch {
          failed += 1;
        }
      }
      setText('');
      setPhotos([]);
      setMine(null);
      setDone(
        failed
          ? `Обращение отправлено, но ${failed} фото не загрузилось. Опишите проблему словами или отправьте фото ещё раз.`
          : 'Спасибо! Обращение отправлено, ответ появится в «Мои обращения».',
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось отправить обращение');
    } finally {
      setBusy(false);
      setProgress('');
    }
  }

  return (
    <m.dialog
      ref={dialog}
      className={styles.dialog}
      aria-labelledby="feedback-title"
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) onClose();
      }}
      initial={reduce ? false : motionPresets.modal.initial}
      animate={motionPresets.modal.animate}
      exit={motionPresets.modal.exit}
    >
      <div className={styles.head}>
        <h2 id="feedback-title">Обратная связь</h2>
        <button type="button" className={styles.close} disabled={busy} onClick={onClose} aria-label="Закрыть обратную связь">
          <CloseIcon size="1em" />
        </button>
      </div>
      <p className={styles.lead}>Нашли ошибку или знаете, как сделать удобнее? Напишите команде StP, приложите фото или снимок экрана.</p>

      <div className={styles.tabs} role="tablist" aria-label="Обратная связь">
        <button type="button" role="tab" aria-selected={tab === 'new'} onClick={() => setTab('new')}>
          Новое обращение
        </button>
        <button type="button" role="tab" aria-selected={tab === 'mine'} onClick={() => setTab('mine')}>
          Мои обращения
        </button>
      </div>

      {!connected ? (
        <p className={styles.notice} role="status">
          Обратная связь работает при подключении к серверу. В демо без сервера отправить обращение нельзя: войдите под своим логином.
        </p>
      ) : tab === 'new' ? (
        <form className={styles.form} onSubmit={(e) => void submit(e)} noValidate>
          <fieldset className={styles.types} disabled={busy}>
            <legend>Тип обращения</legend>
            {(FEEDBACK_TYPES as FeedbackType[]).map((value) => (
              <label key={value} className={styles.typeOption} data-checked={type === value}>
                <input type="radio" name="feedback-type" value={value} checked={type === value} onChange={() => setType(value)} />
                <span>
                  <strong>{FEEDBACK_TYPE_LABELS[value]}</strong>
                  <small>{TYPE_HINTS[value]}</small>
                </span>
              </label>
            ))}
          </fieldset>
          <label className={styles.textLabel}>
            Что случилось или что предлагаете
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              maxLength={FEEDBACK_TEXT_MAX}
              rows={5}
              required
              disabled={busy}
              placeholder="Например: в карточке комнаты не сохраняется площадь после правки"
            />
            <small className={styles.muted}>
              {text.length} из {FEEDBACK_TEXT_MAX}
            </small>
          </label>

          <div className={styles.photoBlock}>
            <div className={styles.photoRow}>
              <Button
                variant="secondary"
                onClick={() => fileRef.current?.click()}
                disabled={busy || preparing || photos.length >= FEEDBACK_PHOTO_LIMIT}
                loading={preparing}
              >
                Добавить фото
              </Button>
              <span className={styles.muted}>
                {photos.length} из {FEEDBACK_PHOTO_LIMIT}. Фото сжимаются перед отправкой.
              </span>
              <input
                ref={fileRef}
                className={styles.fileInput}
                type="file"
                accept="image/*"
                multiple
                aria-label="Фото к обращению"
                onChange={(e) => void addFiles(e.target.files)}
              />
            </div>
            {photos.length ? (
              <ul className={styles.thumbs} aria-label="Выбранные фото">
                {photos.map((p, i) => (
                  <li key={p.key} className={styles.picked}>
                    <img src={`data:image/jpeg;base64,${p.prepared.thumb}`} alt={`Выбранное фото ${i + 1}`} />
                    <button
                      type="button"
                      className={styles.remove}
                      disabled={busy}
                      aria-label={`Убрать фото ${i + 1}`}
                      onClick={() => setPhotos((prev) => prev.filter((x) => x.key !== p.key))}
                    >
                      <CloseIcon size="0.9em" />
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>

          <details className={styles.auto}>
            <summary>Что приложится само</summary>
            <ul>
              <li>Компания, сотрудник, роль и время</li>
              <li>Раздел: {context.pageTitle || context.page || '—'}</li>
              <li>Устройство: {context.device.split(' — ')[0]}, экран {context.screen}</li>
              <li>Версия приложения: {context.appVersion}</li>
            </ul>
          </details>

          {error ? (
            <p className={styles.error} role="alert">
              {error}
            </p>
          ) : null}
          {done ? (
            <p className={styles.done} role="status">
              {done}
            </p>
          ) : null}
          <Button type="submit" fullWidth loading={busy} disabled={preparing}>
            {busy && progress ? progress : 'Отправить'}
          </Button>
        </form>
      ) : (
        <div className={styles.list} aria-live="polite">
          {mineError ? <p className={styles.error}>{mineError}</p> : null}
          {mine === null && !mineError ? <p className={styles.muted}>Загружаем…</p> : null}
          {mine && mine.length === 0 ? (
            <p className={styles.muted}>Обращений пока нет. Если что-то мешает работать, напишите на вкладке «Новое обращение».</p>
          ) : null}
          {mine?.map((item) => (
            <FeedbackCard key={item.id} item={item} />
          ))}
        </div>
      )}
    </m.dialog>
  );
}
