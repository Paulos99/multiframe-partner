import {
  DEFAULT_DOWEL_PRICE_RUB,
  DEFAULT_INSTALL_PRICE_PER_M2,
  OFFICIAL_PANEL_PRICE_RUB,
  OFFICIAL_PRICE_PER_M2,
  type OrgSettings,
} from '../../../../packages/shared/partner';

export const PARTNER_CALC_STORE = 'mf_partner_calc_params_v1';

export type PartnerCalcParams = {
  panelPrice: number;
  pricePerM2: number;
  installPerM2: number | null;
  dowelsPerPanel: number;
  dowelPrice: number | null;
  company: string;
};

export function partnerCalcParamsFromOrg(
  org: OrgSettings | null | undefined,
  companyName?: string,
): PartnerCalcParams {
  return {
    panelPrice:
      org?.panelPriceRub != null && org.panelPriceRub > 0
        ? org.panelPriceRub
        : OFFICIAL_PANEL_PRICE_RUB,
    pricePerM2:
      org?.pricePerM2 != null && org.pricePerM2 > 0 ? org.pricePerM2 : OFFICIAL_PRICE_PER_M2,
    installPerM2:
      org?.installPricePerM2 != null && org.installPricePerM2 >= 0
        ? org.installPricePerM2
        : DEFAULT_INSTALL_PRICE_PER_M2,
    dowelsPerPanel: org?.dowelsPerPanel || 2,
    dowelPrice:
      org?.dowelPriceRub != null && org.dowelPriceRub >= 0
        ? org.dowelPriceRub
        : DEFAULT_DOWEL_PRICE_RUB,
    company: companyName || org?.companyName || '',
  };
}

/** Persist pricing so calculator works offline / without query string. */
export function persistPartnerCalcParams(params: PartnerCalcParams): void {
  try {
    localStorage.setItem(PARTNER_CALC_STORE, JSON.stringify(params));
  } catch {
    /* ignore quota */
  }
}

export function calcUrlFromOrg(
  org: OrgSettings | null | undefined,
  companyName?: string,
  opts?: { objectId?: string | null; clientName?: string | null; areaM2?: number | null },
): string {
  const params = partnerCalcParamsFromOrg(org, companyName);
  persistPartnerCalcParams(params);
  const q = new URLSearchParams();
  q.set('panelPrice', String(params.panelPrice));
  q.set('pricePerM2', String(params.pricePerM2));
  q.set('installPerM2', String(params.installPerM2 ?? DEFAULT_INSTALL_PRICE_PER_M2));
  q.set('dowelPrice', String(params.dowelPrice ?? DEFAULT_DOWEL_PRICE_RUB));
  q.set('dowelsPerPanel', String(params.dowelsPerPanel));
  if (params.company) q.set('company', params.company);
  if (opts?.objectId) q.set('objectId', opts.objectId);
  if (opts?.clientName) q.set('client', opts.clientName);
  if (opts?.objectId && typeof opts.areaM2 === 'number' && Number.isFinite(opts.areaM2) && opts.areaM2 > 0) {
    q.set('area', String(opts.areaM2));
    q.set('mode', 'area');
    q.set('source', 'cabinet');
  }
  q.set('walls', '0');
  q.set('surfaces', 'ceiling');
  q.set('partner', '1');
  const base = import.meta.env?.BASE_URL || '/';
  const path = `${base}calculator/index.html`.replace(/\/{2,}/g, '/');
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  return `${origin}${path}?${q.toString()}`;
}
