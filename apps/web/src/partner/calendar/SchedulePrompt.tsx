import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { visitStartMs } from '../../../../../packages/shared/calendar.js';
import type { JobObject } from '../../../../../packages/shared/partner';
import { usePartner } from '../PartnerContext';
import { useCalendar } from './calendarStore';
import { VisitDialog, type VisitDraft } from './VisitDialog';
import styles from './Calendar.module.css';

const RECENT_MS = 5 * 60 * 1000;

/** Перевод на этот этап сделал сам пользователь только что (по истории комнаты или по метке правки). */
function movedByMe(room: JobObject, userId: string, now: number): boolean {
  const last = room.history?.[0];
  if (last && last.action === 'status') return last.userId === userId && now - Date.parse(last.at) < RECENT_MS;
  return now - Date.parse(room.updatedAt || '') < RECENT_MS;
}

/**
 * Когда владелец или менеджер переводит комнату на «Замер» или «Монтаж», сразу предлагает назначить время,
 * если у проекта ещё нет будущего выезда этого типа. Подсказка не перекрывает работу:
 * карточка в углу, окно с датой открывается только по кнопке. Ничего не сохраняет без подтверждения.
 */
export function SchedulePrompt() {
  const api = usePartner();
  const calendar = useCalendar();
  const seen = useRef<Map<string, string> | null>(null);
  const [draft, setDraft] = useState<{ draft: VisitDraft; reason: string } | null>(null);
  const [open, setOpen] = useState(false);
  const canPlan = api.user?.role === 'owner' || api.user?.role === 'sales';

  useEffect(() => {
    if (!api.user || !canPlan) return;
    const prev = seen.current;
    const next = new Map(api.objects.map((o) => [o.id, o.status]));
    seen.current = next;
    if (!prev || !calendar.loaded || draft) return;
    const now = Date.now();
    for (const room of api.objects) {
      const before = prev.get(room.id);
      if (!before || before === room.status) continue;
      if (room.status !== 'measured' && room.status !== 'install') continue;
      if (!room.projectId || !movedByMe(room, api.user.id, now)) continue;
      const kind = room.status === 'measured' ? 'measure' : 'install';
      const planned = calendar.visits.some(
        (v) => v.projectId === room.projectId && v.kind === kind && !v.doneAt && (visitStartMs(v) ?? 0) > now,
      );
      if (planned) continue;
      setDraft({
        draft: { kind, projectId: room.projectId, objectId: room.id },
        reason: `Комната «${room.roomName || room.address || 'Комната'}» перешла на этап «${kind === 'measure' ? 'Замер' : 'Монтаж'}». Когда ${kind === 'measure' ? 'замер' : 'монтаж'}?`,
      });
      break;
    }
  }, [api.objects, api.user, calendar.loaded, calendar.visits, canPlan, draft]);

  if (!draft) return null;
  const close = () => {
    setOpen(false);
    setDraft(null);
  };
  if (open) return <VisitDialog draft={draft.draft} reason={draft.reason} onClose={close} />;
  return createPortal(
    <aside className={styles.prompt} role="status" aria-label="Назначить время выезда">
      <p>{draft.reason}</p>
      <div className={styles.actions}>
        <button type="button" className={styles.primary} onClick={() => setOpen(true)}>
          Назначить время
        </button>
        <button type="button" className={styles.ghost} onClick={close}>
          Не сейчас
        </button>
      </div>
    </aside>,
    document.body,
  );
}
