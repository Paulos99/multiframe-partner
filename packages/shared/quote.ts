/**
 * Версии коммерческого предложения.
 * Копирование текста / генерация PDF ≠ подтверждённая отправка.
 */

export type QuoteLifecycle =
  | 'quote_created'
  | 'quote_shared'
  | 'quote_sent_confirmed'
  | 'quote_accepted'
  | 'quote_declined'
  | 'quote_postponed';

export type QuoteRevision = {
  id: string;
  projectId: string;
  dealId: string | null;
  version: number;
  /** Ключ PDF в хранилище — не содержимое документа. */
  pdfStorageKey: string | null;
  amount: number | null;
  roomObjectIds: string[];
  createdAt: string;
  createdBy: string | null;
  /** Пользователь вызвал «Поделиться» — доставка не доказана. */
  sharedAt: string | null;
  /** Явное подтверждение отправки сотрудником или интеграцией. */
  sentConfirmedAt: string | null;
  sentComment: string | null;
  lifecycle: QuoteLifecycle;
};

export type QuoteUserAction =
  | 'create'
  | 'copy_text'
  | 'generate_pdf'
  | 'share'
  | 'confirm_sent'
  | 'accept'
  | 'decline'
  | 'postpone';

/** Копирование текста или генерация PDF не переводит КП в «отправлено». */
export function copyOrPdfImpliesSent(_action: 'copy_text' | 'generate_pdf'): boolean {
  return false;
}

export function nextQuoteLifecycle(
  current: QuoteLifecycle,
  action: QuoteUserAction,
): QuoteLifecycle {
  if (action === 'copy_text' || action === 'generate_pdf') return current;
  if (action === 'create') return 'quote_created';
  if (action === 'share') {
    if (current === 'quote_created') return 'quote_shared';
    return current;
  }
  if (action === 'confirm_sent') return 'quote_sent_confirmed';
  if (action === 'accept') return 'quote_accepted';
  if (action === 'decline') return 'quote_declined';
  if (action === 'postpone') return 'quote_postponed';
  return current;
}

export function applyQuoteAction(revision: QuoteRevision, action: QuoteUserAction, atIso?: string): QuoteRevision {
  const at = atIso || new Date().toISOString();
  const lifecycle = nextQuoteLifecycle(revision.lifecycle, action);
  const next: QuoteRevision = { ...revision, lifecycle };
  if (action === 'share' && !next.sharedAt) next.sharedAt = at;
  if (action === 'confirm_sent') next.sentConfirmedAt = at;
  return next;
}

export function isSentConfirmed(revision: Pick<QuoteRevision, 'lifecycle' | 'sentConfirmedAt'>): boolean {
  return Boolean(revision.sentConfirmedAt) || revision.lifecycle === 'quote_sent_confirmed';
}
