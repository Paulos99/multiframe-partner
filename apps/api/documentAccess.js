/**
 * Доступ к PDF расчёта.
 *
 * Смета (estimate) и спецификация (spec) сохраняются двумя файлами одного
 * прогона: docs/<org>/<obj>/<doc>.pdf. Роли с ценами видят оба файла.
 * Монтажник видит только spec. Смета не подставляется, если спецификации нет.
 */

function canSeePrices(role) {
  return role === 'admin' || role === 'owner' || role === 'sales' || role === 'measurer';
}

/** Поля списка. Цен, ключа бакета и байтов PDF здесь нет. */
export function publicDocument(doc) {
  if (!doc) return null;
  return {
    id: doc.id,
    versionId: doc.versionId || doc.id,
    createdAt: doc.createdAt,
    createdBy: doc.createdBy || null,
    kind: doc.kind === 'spec' ? 'spec' : 'estimate',
    filename: doc.filename || 'MultiFrame.pdf',
    hasScheme: Boolean(doc.hasScheme),
    panels: doc.panels ?? null,
    areaM2: doc.areaM2 ?? null,
  };
}

export function documentsForRole(docs, role) {
  const list = [...(docs || [])].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  const picked = list.filter((doc) => {
    if (doc?.kind === 'spec') return true;
    if (doc?.kind === 'estimate') return canSeePrices(role);
    return false;
  });
  return picked.map(publicDocument);
}

/** Тот же отбор, что у GET /objects/:id/documents/:docId. Нет в выборке — 404. */
export function findVisibleDocument(docs, role, docId) {
  if (!docId) return null;
  return documentsForRole(docs, role).find((doc) => doc.id === docId) || null;
}
