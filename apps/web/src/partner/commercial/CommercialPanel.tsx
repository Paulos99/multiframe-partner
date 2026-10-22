import { useState } from 'react';
import { EMPTY_ASSIGNMENTS, type ObjectAssignments } from '../../../../../packages/shared/deal';
import { applyQuoteAction, type QuoteRevision } from '../../../../../packages/shared/quote';
import { hasRemoteApi, apiConfirmQuoteSent, apiCopyQuote, apiCreateQuote, apiPatchDeal } from '../apiClient';
import { AssignmentsEditor, type StaffOption } from './AssignmentsEditor';
import { DealOutcomeForm } from './DealOutcomeForm';
import { QuoteActions } from './QuoteActions';
import styles from '../partner.module.css';

/**
 * Коммерческие действия менеджера: назначения, КП, исход сделки.
 * При отсутствии API работает локально в состоянии панели (демо).
 */
export function CommercialPanel({
  projectId,
  dealId,
  staff,
  initialAssignments,
  onAssignmentsChange,
}: {
  projectId: string | null;
  dealId: string | null;
  staff: StaffOption[];
  initialAssignments?: ObjectAssignments;
  onAssignmentsChange?: (next: ObjectAssignments) => void;
}) {
  const [assignments, setAssignments] = useState<ObjectAssignments>(
    initialAssignments || { ...EMPTY_ASSIGNMENTS },
  );
  const [quote, setQuote] = useState<QuoteRevision | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function ensureQuote() {
    if (quote) return quote;
    if (!projectId) {
      setMsg('Сначала выберите или создайте проект');
      return null;
    }
    setBusy(true);
    try {
      if (hasRemoteApi()) {
        const created = await apiCreateQuote({
          projectId,
          dealId,
          roomObjectIds: [],
        });
        const local: QuoteRevision = {
          id: created.id,
          projectId: created.projectId,
          dealId: created.dealId,
          version: created.version,
          pdfStorageKey: null,
          amount: created.amount,
          roomObjectIds: created.roomObjectIds,
          createdAt: new Date().toISOString(),
          createdBy: null,
          sharedAt: created.sharedAt,
          sentConfirmedAt: created.sentConfirmedAt,
          sentComment: created.sentComment,
          lifecycle: created.lifecycle as QuoteRevision['lifecycle'],
        };
        setQuote(local);
        return local;
      }
      const local: QuoteRevision = {
        id: `qr_local_${Date.now().toString(36)}`,
        projectId,
        dealId,
        version: 1,
        pdfStorageKey: null,
        amount: null,
        roomObjectIds: [],
        createdAt: new Date().toISOString(),
        createdBy: null,
        sharedAt: null,
        sentConfirmedAt: null,
        sentComment: null,
        lifecycle: 'quote_created',
      };
      setQuote(local);
      return local;
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Не удалось создать КП');
      return null;
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <AssignmentsEditor
        value={assignments}
        staff={staff}
        onChange={(next) => {
          setAssignments(next);
          onAssignmentsChange?.(next);
        }}
      />

      <div className={styles.hintCard}>
        <h2>КП по проекту</h2>
        <p className={styles.lead}>
          Копирование текста не считает КП отправленным. Нужна кнопка «Подтвердить отправку».
        </p>
        {!quote ? (
          <button type="button" className={styles.primaryBtn} disabled={busy || !projectId} onClick={() => void ensureQuote()}>
            Сформировать КП
          </button>
        ) : (
          <QuoteActions
            lifecycle={quote.lifecycle}
            busy={busy}
            onCopyText={async () => {
              const current = await ensureQuote();
              if (!current) return;
              const text = `КП v${current.version} · проект ${current.projectId}`;
              try {
                await navigator.clipboard.writeText(text);
              } catch {
                /* clipboard may be unavailable offline */
              }
              if (hasRemoteApi()) {
                const remote = await apiCopyQuote(current.id);
                setQuote({ ...current, lifecycle: remote.lifecycle as QuoteRevision['lifecycle'] });
              } else {
                setQuote(applyQuoteAction(current, 'copy_text'));
              }
              setMsg('Текст скопирован. Статус КП не изменён.');
            }}
            onConfirmSent={async (comment) => {
              const current = await ensureQuote();
              if (!current) return;
              setBusy(true);
              try {
                if (hasRemoteApi()) {
                  const remote = await apiConfirmQuoteSent(current.id, comment);
                  setQuote({
                    ...current,
                    lifecycle: remote.lifecycle as QuoteRevision['lifecycle'],
                    sentConfirmedAt: remote.sentConfirmedAt,
                    sentComment: remote.sentComment,
                  });
                } else {
                  setQuote({
                    ...applyQuoteAction(current, 'confirm_sent'),
                    sentComment: comment || null,
                  });
                }
                setMsg('Отправка КП подтверждена.');
              } catch (e) {
                setMsg(e instanceof Error ? e.message : 'Ошибка подтверждения');
              } finally {
                setBusy(false);
              }
            }}
          />
        )}
      </div>

      {dealId ? (
        <DealOutcomeForm
          busy={busy}
          onSubmit={async ({ outcome, lossReason, lossComment }) => {
            setBusy(true);
            try {
              if (hasRemoteApi()) {
                await apiPatchDeal(dealId, { outcome, lossReason, lossComment });
              }
              setMsg(`Итог сохранён: ${outcome}`);
            } catch (e) {
              setMsg(e instanceof Error ? e.message : 'Ошибка сохранения итога');
            } finally {
              setBusy(false);
            }
          }}
        />
      ) : null}

      {msg ? (
        <p className={styles.flash} role="status">
          {msg}
        </p>
      ) : null}
    </div>
  );
}
