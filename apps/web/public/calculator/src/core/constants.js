/** Габарит панели — укладка, схема и расчёт (номинал по инструкции) */
export const PANEL_NOMINAL = { length: 0.75, width: 0.55 };

/**
 * Эффективное прилегание (с учётом шип-паза) — справочно.
 * Раскладка v1 использует номинал по правилам укладки.
 */
export const PANEL_EFFECTIVE = { length: 0.735, width: 0.535 };

/** Размер для раскладки на схемах */
export const PANEL_LAYOUT = PANEL_NOMINAL;

export const PANEL_COVERAGE_AREA = +(PANEL_NOMINAL.length * PANEL_NOMINAL.width).toFixed(6);

function partnerParam(name) {
  try {
    const v = new URLSearchParams(window.location.search).get(name);
    if (v == null || v === '') return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

const partnerPanel = partnerParam('panelPrice');
const partnerM2 = partnerParam('pricePerM2');
const partnerDowels = partnerParam('dowelsPerPanel');

export const PANEL = {
  nominal: PANEL_NOMINAL,
  effective: PANEL_EFFECTIVE,
  layout: PANEL_LAYOUT,
  coverageArea: PANEL_COVERAGE_AREA,
  priceRub: partnerPanel ?? 2396,
  pricePerM2: partnerM2 ?? 5990,
};

export const PANEL_SIZE_DISPLAY = '0,75×0,55 м';
export const PANEL_COVERAGE_DISPLAY = 0.41;

export const RESERVES = {
  /** Запас панелей отключён: на схеме уже учтены подрезки, лишний % раздувает закупку */
  panels: 0,
  dowels: 0.15,
  dowelsPerPanel: partnerDowels && partnerDowels > 0 ? partnerDowels : 2,
};

/** Partner portal extras (install / dowel unit price). */
export const PARTNER_PRICING = {
  installPerM2: partnerParam('installPerM2'),
  dowelPrice: partnerParam('dowelPrice'),
  company: (() => {
    try {
      return new URLSearchParams(window.location.search).get('company') || '';
    } catch {
      return '';
    }
  })(),
};

export const VALIDATION = {
  MIN_ROOM_SIZE: 0.1,
  MAX_ROOM_SIZE: 100,
  MIN_WALL_HEIGHT: 0.1,
  MAX_WALL_HEIGHT: 10,
  MIN_TOTAL_AREA: 0.1,
  MAX_TOTAL_AREA: 10000,
  MIN_OPENING_SIZE: 0.3,
};

/** Мин. ширина/высота видимого клипа — ≤ этого не укладываем (зазор закрывают обрезками) */
export const MIN_PANEL_FRAGMENT = 0.05;

/** @deprecated используйте MIN_PANEL_FRAGMENT */
export const MIN_WALL_PANEL_FRAGMENT = MIN_PANEL_FRAGMENT;

/**
 * @deprecated порог у проёмов совпадает с MIN_PANEL_FRAGMENT (5 см везде)
 */
export const MIN_WALL_OPENING_STRIP = MIN_PANEL_FRAGMENT;

export const MOUNTING_TYPES = {
  CEILING_FRAMELESS: 'ceiling_frameless',
  CEILING_FRAMED: 'ceiling_framed',
  WALL_FRAMELESS: 'wall_frameless',
  WALL_FRAMED: 'wall_framed',
};

export const OPENING_TYPES = {
  DOOR: 'door',
  WINDOW: 'window',
};
