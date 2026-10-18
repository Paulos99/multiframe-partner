/**
 * Документы объекта.
 *
 * estimate — «Смета»: PDF калькулятора с ценами, количеством и схемой раскладки.
 * profile — «Профиль»: PDF проблемомера, акустический профиль помещения.
 * spec — старые записи «спецификация без цен». Новые не создаются. Если у той же
 * версии есть смета, spec не показывается (это тот же расчёт без цен). Если сметы
 * нет, spec показывается как смета, чтобы старые файлы не пропали.
 *
 * Цены видят все роли, поэтому отбор одинаковый для всех.
 * То же правило, что visibleDocuments в packages/shared/partner.ts.
 */

const KINDS = new Set(['estimate', 'profile', 'spec']);

/** Тип нового файла из запроса. Неизвестное и старое 'spec' сохраняем как смету. */
export function incomingDocumentKind(raw) {
  return raw === 'profile' ? 'profile' : 'estimate';
}

/** Поля списка. Ключа бакета и байтов PDF здесь нет. */
export function publicDocument(doc) {
  if (!doc) return null;
  return {
    id: doc.id,
    versionId: doc.versionId || doc.id,
    createdAt: doc.createdAt,
    createdBy: doc.createdBy || null,
    kind: KINDS.has(doc.kind) ? doc.kind : 'estimate',
    filename: doc.filename || 'MultiFrame.pdf',
    hasScheme: Boolean(doc.hasScheme),
    panels: doc.panels ?? null,
    areaM2: doc.areaM2 ?? null,
  };
}

export function visibleDocuments(docs) {
  const list = [...(docs || [])]
    .filter(Boolean)
    .map((doc) => (doc.kind ? doc : { ...doc, kind: 'estimate' }))
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  const pricedVersions = new Set(
    list.filter((doc) => doc.kind === 'estimate').map((doc) => doc.versionId || doc.id),
  );
  const picked = list.filter((doc) => {
    if (doc.kind === 'estimate' || doc.kind === 'profile') return true;
    if (doc.kind === 'spec') return !pricedVersions.has(doc.versionId || doc.id);
    return false;
  });
  return picked.map(publicDocument);
}

/**
 * Тот же отбор, что у GET /objects/:id/documents/:docId. Нет в выборке — 404.
 * Скрытую spec из пары со сметой тоже отдаём по прямой ссылке: это старый файл того же расчёта.
 */
export function findVisibleDocument(docs, docId) {
  if (!docId) return null;
  const visible = visibleDocuments(docs).find((doc) => doc.id === docId);
  if (visible) return visible;
  const stored = (docs || []).find((doc) => doc && doc.id === docId && KINDS.has(doc.kind));
  return stored ? publicDocument(stored) : null;
}
