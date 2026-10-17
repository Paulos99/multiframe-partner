/**
 * Колонки выгрузки журнала. Список ниже — единственное место, где задаются поля Excel.
 *
 * Как добавить поле:
 * 1. Допишите объект в конец JOURNAL_COLUMNS: key, header, format, value.
 * 2. format: `text` (строка), `number` (число в Excel), `msk` (дата и время в Europe/Moscow, строкой).
 * 3. value читает AnalyticsEvent. Новые сведения кладите в event.object, не переставляя старые колонки.
 * Шапка, автофильтр, закрепление первой строки и ширина колонок собираются из этого массива сами.
 */
import type { AnalyticsEvent } from '../../../../packages/shared/partner';
import { ROLE_LABELS, type UserRole } from '../../../../packages/shared/partner';
import {
  HOUSE_TYPE_OPTIONS,
  OBJECT_STAGE_OPTIONS,
  ROOM_TYPE_LABELS,
  type RoomType,
} from '../state/types';

export type JournalCellFormat = 'text' | 'number' | 'msk';

export type JournalColumn = {
  key: string;
  header: string;
  format: JournalCellFormat;
  value: (event: AnalyticsEvent) => string | number | null | undefined;
};

const HOUSE_LABELS = Object.fromEntries(HOUSE_TYPE_OPTIONS.map((o) => [o.id, o.label])) as Record<
  string,
  string
>;
const STAGE_LABELS = Object.fromEntries(OBJECT_STAGE_OPTIONS.map((o) => [o.id, o.label])) as Record<
  string,
  string
>;

const TOOL_LABELS: Record<string, string> = {
  problemomer: 'Проблемомер',
  calculator: 'Калькулятор',
  cabinet: 'Кабинет',
};

const ACTION_LABELS: Record<string, string> = {
  result: 'Расчёт',
  calc_done: 'Расчёт',
  pdf: 'PDF',
  share: 'Отправка',
  open: 'Открытие',
  login: 'Вход',
};

const MODE_LABELS: Record<string, string> = {
  area: 'Только площадь',
  dims: 'Размеры',
  polygon: 'Полигон',
};

export function formatMsk(iso: string | null | undefined): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const parts = new Intl.DateTimeFormat('ru-RU', {
    timeZone: 'Europe/Moscow',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const pick = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value || '';
  return `${pick('day')}.${pick('month')}.${pick('year')} ${pick('hour')}:${pick('minute')}`;
}

function roomLabel(event: AnalyticsEvent): string {
  const o = event.object;
  if (!o) return '';
  if (o.label && String(o.label).trim()) return String(o.label).trim();
  if (typeof o.roomTypeCustom === 'string' && o.roomTypeCustom.trim()) return o.roomTypeCustom.trim();
  if (o.roomType) return ROOM_TYPE_LABELS[o.roomType as RoomType] || String(o.roomType);
  return '';
}

function classLabel(event: AnalyticsEvent): string {
  const before = event.object?.classBefore;
  const after = event.object?.classAfter;
  if (before && after) return `${before} → ${after}`;
  return before || after || '';
}

function roleLabel(role: string): string {
  return ROLE_LABELS[role as UserRole] || role;
}

export const JOURNAL_COLUMNS: JournalColumn[] = [
  { key: 'at', header: 'Дата и время (МСК)', format: 'msk', value: (e) => e.at },
  { key: 'companyName', header: 'Компания', format: 'text', value: (e) => e.companyName },
  { key: 'city', header: 'Город', format: 'text', value: (e) => e.city || e.object?.city || '' },
  { key: 'login', header: 'Логин', format: 'text', value: (e) => e.login },
  { key: 'role', header: 'Роль', format: 'text', value: (e) => roleLabel(String(e.role || '')) },
  { key: 'tool', header: 'Инструмент', format: 'text', value: (e) => TOOL_LABELS[e.tool] || e.tool },
  { key: 'action', header: 'Событие', format: 'text', value: (e) => ACTION_LABELS[e.action] || e.action },
  { key: 'room', header: 'Комната', format: 'text', value: (e) => roomLabel(e) },
  {
    key: 'areaM2',
    header: 'Площадь, м²',
    format: 'number',
    value: (e) => (e.object?.areaM2 == null ? null : Number(e.object.areaM2)),
  },
  { key: 'class', header: 'Класс звукоизоляции', format: 'text', value: (e) => classLabel(e) },
  {
    key: 'panels',
    header: 'Панели',
    format: 'number',
    value: (e) => (e.object?.panels == null ? null : Number(e.object.panels)),
  },
  {
    key: 'houseType',
    header: 'Тип дома',
    format: 'text',
    value: (e) => HOUSE_LABELS[String(e.object?.houseType || '')] || e.object?.houseType || '',
  },
  {
    key: 'objectStage',
    header: 'Стадия объекта',
    format: 'text',
    value: (e) => STAGE_LABELS[String(e.object?.objectStage || '')] || e.object?.objectStage || '',
  },
  {
    key: 'mode',
    header: 'Режим калькулятора',
    format: 'text',
    value: (e) => MODE_LABELS[String(e.object?.mode || '')] || e.object?.mode || '',
  },
];

export function isJournalEvent(event: AnalyticsEvent): boolean {
  return event.action === 'result' || event.action === 'calc_done' || event.action === 'pdf';
}

function cellValue(column: JournalColumn, event: AnalyticsEvent): string | number {
  const raw = column.value(event);
  if (column.format === 'msk') return formatMsk(typeof raw === 'string' ? raw : null);
  if (column.format === 'number') {
    const n = typeof raw === 'number' ? raw : Number(raw);
    return Number.isFinite(n) ? n : '';
  }
  if (raw == null) return '';
  return String(raw);
}

type WorksheetLike = {
  columns: Array<{ width?: number; numFmt?: string }>;
  autoFilter: { from: { row: number; column: number }; to: { row: number; column: number } };
  views: Array<{ state: 'frozen'; ySplit: number; xSplit: number }>;
  addRow: (values: Array<string | number>) => { height?: number };
  getRow: (index: number) => {
    height: number;
    font: object;
    fill: object;
    alignment: object;
    eachCell: (cb: (cell: { font: object; fill: object; alignment: object }) => void) => void;
  };
  getColumn: (index: number) => { width: number; numFmt?: string };
};

type WorkbookLike = {
  creator: string;
  addWorksheet: (name: string) => WorksheetLike;
  xlsx: { writeBuffer: () => Promise<ArrayBuffer> };
};

async function buildWorkbook(events: AnalyticsEvent[]): Promise<ArrayBuffer> {
  const excel = await import('exceljs');
  const wb = new excel.Workbook() as unknown as WorkbookLike;
  wb.creator = 'MultiFrame';
  const ws = wb.addWorksheet('Журнал');
  ws.addRow(JOURNAL_COLUMNS.map((c) => c.header));
  for (const event of events) {
    ws.addRow(JOURNAL_COLUMNS.map((column) => cellValue(column, event)));
  }
  const header = ws.getRow(1);
  header.height = 22;
  header.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, name: 'Calibri', size: 12 };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF01644F' } };
    cell.alignment = { vertical: 'middle', wrapText: true };
  });
  JOURNAL_COLUMNS.forEach((column, index) => {
    const excelCol = ws.getColumn(index + 1);
    const width = Math.min(42, Math.max(14, column.header.length + 4));
    excelCol.width = width;
    if (column.format === 'number') excelCol.numFmt = '#,##0.##';
  });
  const lastRow = Math.max(1, events.length + 1);
  ws.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: lastRow, column: JOURNAL_COLUMNS.length },
  };
  ws.views = [{ state: 'frozen', ySplit: 1, xSplit: 0 }];
  return wb.xlsx.writeBuffer();
}

function journalFileName(): string {
  const stamp = formatMsk(new Date().toISOString()).replace(/[^\d]/g, '').slice(0, 12);
  return `Журнал MultiFrame ${stamp}.xlsx`;
}

async function saveBlob(buffer: ArrayBuffer, filename: string): Promise<void> {
  const type = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  const blob = new Blob([buffer], { type });
  const file = new File([blob], filename, { type });
  const nav = navigator as Navigator & { canShare?: (data: ShareData) => boolean };
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
  if (ios && typeof navigator.share === 'function' && nav.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: 'Журнал MultiFrame' });
      return;
    } catch (err) {
      if ((err as Error).name === 'AbortError') return;
    }
  }
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.rel = 'noopener';
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export async function downloadJournalWorkbook(events: AnalyticsEvent[]): Promise<void> {
  const rows = events.filter(isJournalEvent);
  const buffer = await buildWorkbook(rows);
  await saveBlob(buffer, journalFileName());
}
