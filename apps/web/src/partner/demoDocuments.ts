/**
 * Демо-PDF не пишутся в бакет. В ?demo=1 несколько объектов получают
 * карточки документов. Файл собирается тем же рендером, что PDF калькулятора:
 * геометрия комнаты и реальная раскладка панелей, не сетка квадратов.
 */
import type { JobObject, JobObjectDocument } from '../../../../packages/shared/partner';
import { visibleDocuments } from '../../../../packages/shared/partner';
import { readablePdfName } from './cabinetCalc';
import { isDemoModeEnabled } from './DemoSwitcher';
import { openFilePreview } from '../ui/filePreview/previewStore';

const DEMO_IDS = ['obj_a01', 'obj_a03', 'obj_a04', 'obj_a05', 'obj_b01', 'obj_b03'];

function demoDocs(obj: JobObject): JobObjectDocument[] {
  const versions = obj.id === 'obj_a03' || obj.id === 'obj_b03' ? 2 : 1;
  const now = Date.now();
  const areaM2 = obj.room.areaM2 ?? null;
  const docs: JobObjectDocument[] = [];
  for (let v = 0; v < versions; v += 1) {
    const createdAt = new Date(now - (versions - 1 - v) * 36 * 60 * 60 * 1000).toISOString();
    const versionId = `demo_${obj.id}_v${v + 1}`;
    const common = {
      versionId,
      createdAt,
      createdBy: 'demo',
      hasScheme: true,
      panels: null,
      areaM2,
      demo: true as const,
    };
    docs.push({
      ...common,
      id: `${versionId}_estimate`,
      kind: 'estimate',
      filename: readablePdfName(obj.clientName, 'estimate', createdAt),
    });
  }
  return docs;
}

/** Подмешивает демо-документы, не затирая уже приложенные файлы. */
export function withDemoDocuments(objects: JobObject[]): JobObject[] {
  if (!isDemoModeEnabled()) return objects;
  const known = new Set(DEMO_IDS);
  let hits = 0;
  const mapped = objects.map((obj) => {
    const real = (obj.documents || []).filter((d) => !d.demo);
    if (real.length) return { ...obj, documents: visibleDocuments(real) };
    if (!known.has(obj.id)) return obj;
    hits += 1;
    return { ...obj, documents: visibleDocuments(demoDocs(obj)) };
  });
  if (hits > 0) return mapped;
  let extra = 0;
  return mapped.map((obj) => {
    if (extra >= 4 || obj.status === 'draft') return obj;
    if ((obj.documents || []).length) return obj;
    extra += 1;
    return { ...obj, documents: visibleDocuments(demoDocs(obj)) };
  });
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
export async function buildDemoPdfBlob(obj: JobObject, doc: JobObjectDocument): Promise<Blob> {
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
    hidePrices: false,
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
