import type { JobObjectDocument, UserRole } from '../../../../packages/shared/partner';
import { roleSeesProjectMoney, visibleDocuments } from '../../../../packages/shared/partner';

/** Цены в документах видят все роли (правило roleSeesProjectMoney). */
export function shouldHideDocumentPrices(role: UserRole): boolean {
  return !roleSeesProjectMoney(role);
}

/** Как открывать файл: с ценами — сохранённый PDF; роли без цен — сборка без цен. */
export function documentOpenPolicy(role: UserRole): 'priced-file' | 'without-prices' {
  return shouldHideDocumentPrices(role) ? 'without-prices' : 'priced-file';
}

export function toolDocument(input: {
  kind: 'estimate' | 'profile';
  filename: string;
  pdfBase64: string;
  areaM2?: number | null;
  panels?: number | null;
  hasScheme?: boolean;
  createdBy?: string;
  at?: string;
}): JobObjectDocument {
  return {
    id: `doc_${Math.random().toString(36).slice(2, 10)}`,
    versionId: `ver_${Date.now().toString(36)}`,
    createdAt: input.at || new Date().toISOString(),
    createdBy: input.createdBy || 'user',
    kind: input.kind,
    filename: input.filename,
    hasScheme: Boolean(input.hasScheme),
    panels: input.panels ?? null,
    areaM2: input.areaM2 ?? null,
    dataBase64: input.pdfBase64,
  };
}

/** Документ лежит в карточке. Сам никому не отправляется. */
export function roomWithToolPdf(
  docs: JobObjectDocument[] | null | undefined,
  doc: JobObjectDocument,
): JobObjectDocument[] {
  return [doc, ...(docs || [])];
}

export function rolesSeeDocument(docs: JobObjectDocument[], id: string): { sales: boolean; crew: boolean } {
  const visible = visibleDocuments(docs).some((doc) => doc.id === id);
  return { sales: visible, crew: visible };
}
