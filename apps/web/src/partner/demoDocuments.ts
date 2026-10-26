/**
 * Демо-PDF не пишутся в бакет. В ?demo=1 несколько объектов получают
 * карточки документов. Файл собирается тем же рендером, что PDF калькулятора:
 * геометрия комнаты и реальная раскладка панелей, не сетка квадратов.
 */
import type { JobObject, JobObjectDocument } from '../../../../packages/shared/partner';
import { visibleDocuments } from '../../../../packages/shared/partner';
import { isDemoModeEnabled } from './demoMode';
import { openFilePreview } from '../ui/filePreview/previewStore';

/**
 * Документ появляется только после явного «Сохранить».
 * Раньше демо само прикладывало смету (у Сидоровой — «Последняя версия» с часами загрузки страницы).
 */
/** Черновик, который калькулятор создавал сам при открытии: «Потолок 68.6 м²» без телефона. */
function autoCalcDraft(obj: JobObject): boolean {
  return (
    obj.status === 'draft' &&
    !String(obj.clientPhone || '').trim() &&
    /^Потолок [\d.,]+ м²$/u.test(String(obj.clientName || '').trim())
  );
}

export function withDemoDocuments(objects: JobObject[]): JobObject[] {
  if (!isDemoModeEnabled()) return objects;
  return objects
    .filter((obj) => !autoCalcDraft(obj))
    .map((obj) => ({
      ...obj,
      documents: visibleDocuments((obj.documents || []).filter((doc) => !doc.demo)),
      pendingSync: false,
    }));
}

/** Размеры комнаты под площадь объекта: как расчёт «по размерам». */
const DEMO_ROOMS: Record<string, [number, number]> = {
  obj_a01: [6, 3],
  obj_a03: [4, 4],
  obj_a04: [7, 4],
  obj_a05: [5, 2.6],
  obj_b01: [6, 3.5],
  obj_b03: [6.5, 4],
};

function roomSize(obj: JobObject, older: boolean): [number, number] {
  const preset = DEMO_ROOMS[obj.id];
  if (preset) {
    return older ? [Math.max(3, Math.round((preset[0] - 0.5) * 10) / 10), preset[1]] : preset;
  }
  const area = obj.room.areaM2 && obj.room.areaM2 > 0 ? obj.room.areaM2 : 16;
  const length = Math.max(3, Math.round(Math.sqrt(area * 1.4) * 10) / 10);
  const width = Math.max(2.5, Math.round((area / length) * 10) / 10);
  return [length, width];
}

function calcSrc(path: string): string {
  const base = `${import.meta.env.BASE_URL || '/'}calculator/src/${path}`;
  return base.replace(/([^:]\/)\/+/g, '$1');
}

/** Нативный import, без переписывания сборщиком: модули калькулятора лежат в public/. */
const nativeImport = new Function('specifier', 'return import(specifier)') as (
  specifier: string,
) => Promise<CalcModules & Record<string, CalcModules[keyof CalcModules]>>;

type CalcModules = {
  createRectangleVertices: (length: number, width: number) => Array<{ x: number; y: number; label: string }>;
  Room: new (data?: object) => {
    vertices: Array<{ x: number; y: number; label?: string }>;
    wallHeight: number;
    getTotalArea: () => number;
    openings: unknown[];
  };
  PolygonPanelCalculator: new (vertices: unknown) => {
    offsetX: number;
    offsetY: number;
    calculateBestScheme: (options?: { fast?: boolean }) => {
      name: string;
      panels: unknown[];
      stats: object;
    };
  };
  buildBOM: (input: object) => object;
  buildPdfSchemeImages: (input: object) => {
    planImage: string | null;
    ceilingImage: string | null;
    wallSurfaces: Array<{ wallResult: unknown; image: string | null }>;
  };
  exportCalculationPDF: (input: object) => Promise<{ blob: Blob; filename: string }>;
};

let calcModules: Promise<CalcModules> | null = null;

function loadCalculator(): Promise<CalcModules> {
  if (!calcModules) {
    calcModules = Promise.all([
      nativeImport(calcSrc('core/polygon-geometry.js')),
      nativeImport(calcSrc('core/room-model.js')),
      nativeImport(calcSrc('calculators/polygon-ceiling-calculator.js')),
      nativeImport(calcSrc('calculators/materials-bom.js')),
      nativeImport(calcSrc('export/pdf-scheme-render.js')),
      nativeImport(calcSrc('export/pdf-export.js')),
    ]).then(([geom, roomMod, calcMod, bomMod, schemeMod, pdfMod]) => ({
      createRectangleVertices: geom.createRectangleVertices,
      Room: roomMod.Room,
      PolygonPanelCalculator: calcMod.PolygonPanelCalculator,
      buildBOM: bomMod.buildBOM,
      buildPdfSchemeImages: schemeMod.buildPdfSchemeImages,
      exportCalculationPDF: pdfMod.exportCalculationPDF,
    }));
  }
  return calcModules;
}

const demoPdfCache = new Map<string, Blob>();

/** PDF калькулятора для демо-комнаты: план и раскладка панелей, «Смета» с ценами. */
export async function buildDemoPdfBlob(
  obj: JobObject,
  doc: JobObjectDocument,
  opts?: { hidePrices?: boolean },
): Promise<Blob> {
  const cached = demoPdfCache.get(doc.id);
  if (cached) return cached;
  const calc = await loadCalculator();
  const older = /_v1$/.test(doc.versionId) && (obj.id === 'obj_a03' || obj.id === 'obj_b03');
  const [length, width] = roomSize(obj, older);
  const room = new calc.Room({
    vertices: calc.createRectangleVertices(length, width),
    wallHeight: 2.7,
  });
  const ceilingCalc = new calc.PolygonPanelCalculator(room.vertices);
  const ceilingResult = ceilingCalc.calculateBestScheme({ fast: true });
  const options = {
    calcCeiling: true,
    calcWalls: false,
    ceilingMounting: 'ceiling_frameless',
    wallMounting: 'wall_frameless',
  };
  const bom = calc.buildBOM({
    room,
    ceilingResult,
    wallResult: null,
    options,
  });
  const images = calc.buildPdfSchemeImages({
    room,
    ceilingCalc,
    ceilingResult,
    wallResults: [],
    options,
    showNumbers: true,
    showFrame: false,
  });
  const file = await calc.exportCalculationPDF({
    bom,
    room,
    ceilingImage: images.ceilingImage,
    wallSurfaces: images.wallSurfaces,
    planImage: images.planImage,
    areaEstimate: false,
    hidePrices: opts?.hidePrices === true,
    download: false,
    fileLabel: obj.clientName || 'Комната',
    fileDate: doc.createdAt,
  });
  demoPdfCache.set(doc.id, file.blob);
  return file.blob;
}

export function openPdfBlob(blob: Blob, filename: string, download: boolean): void {
  const name = filename || 'документ.pdf';
  const file = new File([blob], name, { type: 'application/pdf' });
  if (!download) {
    // «Открыть» — общее окно предпросмотра вместо новой вкладки.
    openFilePreview({ id: `pdf:${name}:${blob.size}`, name, mime: 'application/pdf', source: { blob: file, mime: 'application/pdf' } });
    return;
  }
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 20000);
}
