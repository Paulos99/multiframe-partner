/**
 * Демо-PDF не пишутся в бакет. В ?demo=1 несколько объектов получают
 * карточки документов, а файл собирается в браузере по кнопке.
 */
import type { JobObject, JobObjectDocument, UserRole } from '../../../../packages/shared/partner';
import { documentsForRole } from '../../../../packages/shared/partner';
import { isDemoModeEnabled } from './DemoSwitcher';

const DEMO_IDS = ['obj_a01', 'obj_a03', 'obj_a04', 'obj_a05', 'obj_b01', 'obj_b03'];

function demoDocs(obj: JobObject): JobObjectDocument[] {
  const versions = obj.id === 'obj_a03' || obj.id === 'obj_b03' ? 2 : 1;
  const now = Date.now();
  const panels = obj.estimate?.panels ?? null;
  const areaM2 = obj.room.areaM2 ?? null;
  const hasScheme = obj.status === 'install' || obj.status === 'closed';
  const docs: JobObjectDocument[] = [];
  for (let v = 0; v < versions; v += 1) {
    const older = v < versions - 1;
    const createdAt = new Date(now - (versions - 1 - v) * 36 * 60 * 60 * 1000).toISOString();
    const versionId = `demo_${obj.id}_v${v + 1}`;
    const panelCount = older && panels ? Math.max(1, panels - 2) : panels;
    const suffix = older ? `_v${v + 1}` : '';
    const common = {
      versionId,
      createdAt,
      createdBy: 'demo',
      hasScheme,
      panels: panelCount,
      areaM2,
      demo: true as const,
    };
    docs.push({
      ...common,
      id: `${versionId}_estimate`,
      kind: 'estimate',
      filename: `MultiFrame_${obj.id}${suffix}.pdf`,
    });
    docs.push({
      ...common,
      id: `${versionId}_spec`,
      kind: 'spec',
      filename: `MultiFrame_spec_${obj.id}${suffix}.pdf`,
    });
  }
  return docs;
}

/** Подмешивает демо-документы, не затирая уже приложенные файлы. */
export function withDemoDocuments(objects: JobObject[], role: UserRole): JobObject[] {
  if (!isDemoModeEnabled()) return objects;
  const known = new Set(DEMO_IDS);
  let hits = 0;
  const mapped = objects.map((obj) => {
    const real = (obj.documents || []).filter((d) => !d.demo);
    if (real.length) return { ...obj, documents: documentsForRole(real, role) };
    if (!known.has(obj.id)) return obj;
    hits += 1;
    return { ...obj, documents: documentsForRole(demoDocs(obj), role) };
  });
  if (hits > 0) return mapped;
  let extra = 0;
  return mapped.map((obj) => {
    if (extra >= 4 || obj.status === 'draft') return obj;
    if ((obj.documents || []).length) return obj;
    extra += 1;
    return { ...obj, documents: documentsForRole(demoDocs(obj), role) };
  });
}

function panelGrid(count: number): string {
  const n = Math.max(4, Math.min(count || 8, 24));
  const cells = Array.from({ length: n }, (_, i) => {
    const cut = i >= n - 2;
    return `<div style="width:46px;height:34px;border-radius:4px;border:1px solid #01644f;background:${cut ? '#d7efe6' : '#01644f'};color:${cut ? '#01644f' : '#fff'};font-size:10px;display:flex;align-items:center;justify-content:center">${i + 1}</div>`;
  }).join('');
  return `<div style="display:flex;flex-wrap:wrap;gap:6px;padding:10px;border:1px solid #d5e4de;border-radius:10px;background:#f7fbf9">${cells}</div>`;
}

/** Одностраничный демо-PDF: смета или спецификация без цен, со схемой раскладки. */
export async function buildDemoPdfBlob(obj: JobObject, doc: JobObjectDocument): Promise<Blob> {
  const hidePrices = doc.kind === 'spec';
  const panels = doc.panels ?? obj.estimate?.panels ?? 0;
  const dowels = obj.estimate?.dowels ?? Math.ceil(panels * 2 * 1.15);
  const area = doc.areaM2 ?? obj.room.areaM2 ?? 0;
  const money =
    !hidePrices && obj.estimate?.totalCost != null
      ? `<div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid #e6eeea"><span>Итого КП</span><strong>${obj.estimate.totalCost.toLocaleString('ru-RU')} ₽</strong></div>`
      : '';
  const el = document.createElement('div');
  el.style.cssText =
    'position:fixed;left:-12000px;top:0;width:794px;background:#fff;color:#24302b;font-family:Segoe UI,Arial,sans-serif;';
  el.innerHTML = `
    <div style="background:#01644f;color:#fff;padding:18px 22px">
      <div style="font-size:20px;font-weight:700">StP MultiFRAME</div>
      <div style="font-size:13px;opacity:.9;margin-top:4px">${hidePrices ? 'Спецификация для монтажа · без цен' : 'Смета и схема монтажа'}</div>
    </div>
    <div style="padding:18px 22px 24px">
      <h1 style="margin:0 0 6px;font-size:18px;color:#01644f">${obj.clientName || 'Объект'}</h1>
      <p style="margin:0 0 12px;color:#5c6b66;font-size:13px">${[obj.address, obj.city].filter(Boolean).join(' · ') || 'Адрес не указан'}</p>
      <div style="font-size:14px">
        <div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid #e6eeea"><span>Площадь</span><strong>${area} м²</strong></div>
        <div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid #e6eeea"><span>Панели к закупке</span><strong>${panels} шт.</strong></div>
        <div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid #e6eeea"><span>Дюбели с запасом 15%</span><strong>${dowels} шт.</strong></div>
        ${money}
      </div>
      <h2 style="font-size:14px;color:#01644f;margin:16px 0 8px">${doc.hasScheme ? 'Схема раскладки панелей' : 'Схема'}</h2>
      ${
        doc.hasScheme
          ? panelGrid(panels)
          : '<p style="margin:0;color:#5c6b66;font-size:13px">Схема не строилась — расчёт выполнен по площади.</p>'
      }
      <p style="margin:14px 0 0;font-size:11px;color:#8aa099">Демо-документ кабинета. Живой PDF калькулятора прикладывается после расчёта.</p>
    </div>`;
  document.body.appendChild(el);
  try {
    const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
      import('html2canvas'),
      import('jspdf'),
    ]);
    const canvas = await html2canvas(el, { scale: 1.4, backgroundColor: '#ffffff', logging: false });
    const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
    const pageW = pdf.internal.pageSize.getWidth();
    const pageH = pdf.internal.pageSize.getHeight();
    const imgH = Math.min(pageH, (canvas.height / canvas.width) * pageW);
    pdf.addImage(canvas.toDataURL('image/jpeg', 0.86), 'JPEG', 0, 0, pageW, imgH);
    return pdf.output('blob');
  } finally {
    el.remove();
  }
}

export function openPdfBlob(blob: Blob, filename: string, download: boolean): void {
  const url = URL.createObjectURL(blob);
  if (download) {
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
  } else {
    const opened = window.open(url, '_blank', 'noopener');
    if (!opened) {
      const a = document.createElement('a');
      a.href = url;
      a.target = '_blank';
      a.rel = 'noopener';
      a.click();
    }
  }
  window.setTimeout(() => URL.revokeObjectURL(url), 20000);
}
