import { useEffect, useState } from 'react';
import { DEAL_OUTCOME_LABELS, EMPTY_ASSIGNMENTS, type ObjectAssignments } from '../../../../../packages/shared/deal';
import type { QuoteRevision } from '../../../../../packages/shared/quote';
import {
  hasRemoteApi,
  apiConfirmQuoteSent,
  apiCopyQuote,
  apiCreateQuote,
  apiPatchDeal,
} from '../apiClient';
import { AssignmentsEditor, type StaffOption } from './AssignmentsEditor';
import { DealOutcomeForm } from './DealOutcomeForm';
import { QuoteActions } from './QuoteActions';
import {
  applyLocalQuoteAction,
  createLocalQuote,
  listLocalQuotes,
  patchLocalDeal,
} from './localDeals';
import styles from '../partner.module.css';

/**
 * Коммерческие действия менеджера: назначения, КП, исход сделки.
 * С remote API — сервер; без API — localStorage (demo).
 */
export function CommercialPanel({
  projectId,
  dealId,
  staff,
  initialAssignments,
  onAssignmentsChange,
  onDealChanged,
}: {
  projectId: string | null;
  dealId: string | null;
  staff: StaffOption[];
  initialAssignments?: ObjectAssignments;
  onAssignmentsChange?: (next: ObjectAssignments) => void;
  onDealChanged?: () => void;
}) {
  const [assignments, setAssignments] = useState<ObjectAssignments>(
    initialAssignments || { ...EMPTY_ASSIGNMENTS },
  );
  const [quote, setQuote] = useState<QuoteRevision | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!projectId || hasRemoteApi()) return;
    const existing = listLocalQuotes(new Set([projectId]));
    setQuote(existing[0] || null);
  }, [projectId, dealId]);

  async function ensureQuote() {
    if (quote) return quote;
    if (!projectId) {
      setMsg('Сначала выберите или создайте проект / объект');
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
        onDealChanged?.();
        return local;
      }
      const local = createLocalQuote({
        projectId,
        dealId,
        roomObjectIds: [],
      });
      setQuote(local);
      onDealChanged?.();
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
        {!projectId ? (
          <p className={styles.lead}>Откройте проект — предложение относится к нему.</p>
        ) : null}
        {!quote ? (
          <button
            type="button"
            className={styles.primaryBtn}
            disabled={busy || !projectId}
            onClick={() => void ensureQuote()}
          >
            Сформировать КП
          </button>
        ) : (
          <QuoteActions
            lifecycle={quote.lifecycle}
            busy={busy}
            onCopyText={async () => {
              const current = await ensureQuote();
              if (!current) return;
              const text = `Коммерческое предложение, версия ${current.version}`;
              try {
                await navigator.clipboard.writeText(text);
              } catch {
                /* clipboard may be unavailable */
              }
              if (hasRemoteApi()) {
                const remote = await apiCopyQuote(current.id);
                setQuote({ ...current, lifecycle: remote.lifecycle as QuoteRevision['lifecycle'] });
              } else {
                const next = applyLocalQuoteAction(current.id, 'copy_text');
                if (next) setQuote(next);
              }
              setMsg('Текст скопирован. Статус КП не изменён.');
              onDealChanged?.();
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
                  const next = applyLocalQuoteAction(current.id, 'confirm_sent', comment);
                  if (next) setQuote(next);
                }
                setMsg('Отправка КП подтверждена.');
                onDealChanged?.();
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
              } else {
                patchLocalDeal(dealId, { outcome, lossReason, lossComment });
              }
              setMsg(`Итог сохранён: ${DEAL_OUTCOME_LABELS[outcome]}`);
              onDealChanged?.();
            } catch (e) {
              setMsg(e instanceof Error ? e.message : 'Ошибка сохранения итога');
            } finally {
              setBusy(false);
            }
          }}
        />
      ) : (
        <p className={styles.lead}>Сделка появится, когда проект открыт и в нём есть комната.</p>
      )}

      {msg ? (
        <p className={styles.flash} role="status">
          {msg}
        </p>
      ) : null}
    </div>
  );
}
