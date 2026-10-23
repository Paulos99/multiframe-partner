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

const PARTNER_CALC_STORE = 'mf_partner_calc_params_v1';
const PARTNER_SESSION_KEY = 'mf_partner_session_v2';
const OFFICIAL_PANEL = 2396;
const OFFICIAL_M2 = 5990;
const DEFAULT_INSTALL_PER_M2 = 1500;
const DEFAULT_DOWEL_PRICE = 25;

function readStoredPartner() {
  try {
    const raw = localStorage.getItem(PARTNER_CALC_STORE);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function readSessionOrg() {
  try {
    const raw = localStorage.getItem(PARTNER_SESSION_KEY);
    if (!raw) return null;
    const session = JSON.parse(raw);
    return session?.org || null;
  } catch {
    return null;
  }
}

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

function partnerString(name) {
  try {
    return new URLSearchParams(window.location.search).get(name) || '';
  } catch {
    return '';
  }
}

function numOrNull(v) {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * Resolve partner pricing at call time (URL → calc store → session org → defaults).
 * Module-load constants alone miss session updates and iframe reloads with stale store.
 */
export function getPartnerPricing() {
  const stored = readStoredPartner();
  const org = readSessionOrg();
  // Цены видят все роли. Старый ?hidePrices=1 больше ничего не прячет.
  const partnerPanel = partnerParam('panelPrice') ?? numOrNull(stored?.panelPrice) ?? null;
  const partnerM2 = partnerParam('pricePerM2') ?? numOrNull(stored?.pricePerM2) ?? null;
  const partnerDowels =
    partnerParam('dowelsPerPanel') ?? numOrNull(stored?.dowelsPerPanel) ?? null;
  let partnerInstall =
    partnerParam('installPerM2') ??
    numOrNull(stored?.installPerM2) ??
    numOrNull(org?.installPricePerM2);
  let partnerDowelPrice =
    partnerParam('dowelPrice') ??
    numOrNull(stored?.dowelPrice) ??
    numOrNull(org?.dowelPriceRub);
  const partnerCompany =
    partnerString('company') || stored?.company || org?.companyName || '';
  const isPartnerMode =
    partnerString('partner') === '1' ||
    Boolean(stored?.company) ||
    Boolean(org?.companyName) ||
    partnerPanel != null;

  if (isPartnerMode) {
    if (partnerInstall == null) partnerInstall = DEFAULT_INSTALL_PER_M2;
    if (partnerDowelPrice == null) partnerDowelPrice = DEFAULT_DOWEL_PRICE;
  }

  return {
    panelPriceRub:
      partnerPanel != null && partnerPanel > 0 ? partnerPanel : OFFICIAL_PANEL,
    pricePerM2: partnerM2 != null && partnerM2 > 0 ? partnerM2 : OFFICIAL_M2,
    installPerM2: isPartnerMode ? partnerInstall : null,
    dowelPrice: isPartnerMode ? partnerDowelPrice : null,
    dowelsPerPanel: partnerDowels && partnerDowels > 0 ? partnerDowels : 2,
    company: partnerCompany,
    enabled: isPartnerMode,
    hidePrices: false,
    officialPanelPrice: OFFICIAL_PANEL,
    officialPricePerM2: OFFICIAL_M2,
  };
}

const boot = getPartnerPricing();

export const PANEL = {
  nominal: PANEL_NOMINAL,
  effective: PANEL_EFFECTIVE,
  layout: PANEL_LAYOUT,
  coverageArea: PANEL_COVERAGE_AREA,
  get priceRub() {
    return getPartnerPricing().panelPriceRub;
  },
  get pricePerM2() {
    return getPartnerPricing().pricePerM2;
  },
};

export const PANEL_SIZE_DISPLAY = '0,75×0,55 м';
export const PANEL_COVERAGE_DISPLAY = 0.41;

export const RESERVES = {
  /** Запас панелей отключён: на схеме уже учтены подрезки, лишний % раздувает закупку */
  panels: 0,
  dowels: 0.15,
  get dowelsPerPanel() {
    return getPartnerPricing().dowelsPerPanel;
  },
};

/** Partner portal extras — live getters so BOM always sees current rates. */
export const PARTNER_PRICING = {
  get installPerM2() {
    return getPartnerPricing().installPerM2;
  },
  get dowelPrice() {
    return getPartnerPricing().dowelPrice;
  },
  get company() {
    return getPartnerPricing().company;
  },
  get enabled() {
    return getPartnerPricing().enabled;
  },
  officialPanelPrice: OFFICIAL_PANEL,
  officialPricePerM2: OFFICIAL_M2,
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

/** Мин. ширина/высота видимого клипа — тоньше этого не укладываем (5 см). */
export const MIN_PANEL_FRAGMENT = 0.05;

export const OPENING_TYPES = {
  DOOR: 'door',
  WINDOW: 'window',
};

export { boot as _bootPartnerPricing };
