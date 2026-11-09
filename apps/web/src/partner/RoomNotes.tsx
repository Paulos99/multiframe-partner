import { useState } from 'react';
import { NOTE_TEXT_MAX } from '../../../../packages/shared/roomNotes.js';
import type { JobObject } from '../../../../packages/shared/partner';
import { CardSection } from './CardParts';
import { usePartner } from './PartnerContext';
import type { NotePayload } from './offlineQueue';
import styles from './partner.module.css';
import notesStyles from './RoomNotes.module.css';

function when(iso: string): string {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return '';
  return at.toLocaleString('ru-RU', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });
}

/** Заметки к комнате. Без связи заметка сохраняется на телефоне с пометкой «ждёт отправки». */
export function RoomNotes({ room }: { room: JobObject }) {
  const api = usePartner();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const sent = room.notes || [];
  const sentIds = new Set(sent.map((note) => note.clientId).filter(Boolean));
  const queued = api.fieldQueue.filter((item) => item.kind === 'note' && item.objectId === room.id && !sentIds.has(item.id));
  const submit = async () => {
    setBusy(true);
    setError('');
    try {
      await api.addRoomNote(room.id, text);
      setText('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось сохранить заметку');
    } finally {
      setBusy(false);
    }
  };
  return (
    <CardSection title="Заметки" hint="Видны всем, кому видна комната.">
      {sent.length || queued.length ? (
        <ul className={notesStyles.list} data-testid="room-notes">
          {sent.map((note) => (
            <li key={note.id} className={notesStyles.note}>
              <p>{note.text}</p>
              <span className={notesStyles.meta}>
                {note.authorName ? `${note.authorName} · ` : ''}
                {when(note.at)}
              </span>
            </li>
          ))}
          {queued.map((item) => (
            <li key={item.id} className={notesStyles.note} data-queued="true">
              <p>{(item.payload as NotePayload).text}</p>
              <span className={notesStyles.meta}>
                {item.failed ? `Не отправлено: ${item.lastError || 'ошибка'}` : 'На телефоне, ждёт отправки'} · {when(item.createdAt)}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className={styles.hint}>Заметок пока нет.</p>
      )}
      <form
        className={notesStyles.form}
        onSubmit={(event) => {
          event.preventDefault();
          if (!busy && text.trim()) void submit();
        }}
      >
        <textarea
          className={notesStyles.input}
          value={text}
          maxLength={NOTE_TEXT_MAX}
          rows={2}
          placeholder="Например: высота 2,7 м, люстра в центре, клиенту удобно после 18:00"
          aria-label="Новая заметка к комнате"
          onChange={(event) => setText(event.target.value)}
        />
        <button type="submit" className={styles.primary} disabled={busy || !text.trim()}>
          Добавить заметку
        </button>
      </form>
      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}
    </CardSection>
  );
}
