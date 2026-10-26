import type { JobObjectDocument, UserRole } from '../../../../packages/shared/partner';
import { visibleDocuments } from '../../../../packages/shared/partner';

/** Монтажник видит схему, материалы и количества, но не цены. */
export function shouldHideDocumentPrices(role: UserRole): boolean {
  return role === 'crew';
}

/** Как открывать файл: менеджер получает сохранённый PDF, монтажник — сборку без цен. */
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
