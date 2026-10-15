import {
  DEFAULT_DOWELS_PER_PANEL,
  FIXED_PANEL_PRICE_RUB,
  DOWEL_RESERVE,
  PANEL_AREA_M2,
  type OrgSettings,
  type PartnerProfile,
} from '../../../../packages/shared/partner';

export type PartnerEstimate = {
  areaM2: number;
  panels: number;
  dowels: number;
  panelPriceRub: number;
  panelsCost: number;
  installCost: number | null;
  dowelsCost: number | null;
  /** @deprecated use totalCost */
  installPlusFasteners: number | null;
  /** Панели + монтаж + крепёж — общая сумма по проекту */
  totalCost: number;
};

type EstimateInput = Pick<
  PartnerProfile,
  'panelPriceRub' | 'installPricePerM2' | 'dowelsPerPanel' | 'dowelPriceRub'
>;

export function buildPartnerEstimate(
  areaM2: number,
  partner: EstimateInput,
): PartnerEstimate | null {
  if (!(areaM2 > 0)) return null;
  const panels = Math.ceil(areaM2 / PANEL_AREA_M2);
  const perPanel = partner.dowelsPerPanel > 0 ? partner.dowelsPerPanel : DEFAULT_DOWELS_PER_PANEL;
  const dowels = Math.ceil(panels * perPanel * (1 + DOWEL_RESERVE));
  const panelPriceRub =
    partner.panelPriceRub != null && partner.panelPriceRub > 0
      ? partner.panelPriceRub
      : FIXED_PANEL_PRICE_RUB;
  const panelsCost = panels * panelPriceRub;
  const installCost =
    partner.installPricePerM2 != null && partner.installPricePerM2 >= 0
      ? Math.round(areaM2 * partner.installPricePerM2)
      : null;
  const dowelsCost =
    partner.dowelPriceRub != null && partner.dowelPriceRub >= 0
      ? Math.round(dowels * partner.dowelPriceRub)
      : null;
  const installPlusFasteners =
    installCost != null || dowelsCost != null
      ? (installCost ?? 0) + (dowelsCost ?? 0)
      : null;
  const totalCost = panelsCost + (installCost ?? 0) + (dowelsCost ?? 0);
  return {
    areaM2,
    panels,
    dowels,
    panelPriceRub,
    panelsCost,
    installCost,
    dowelsCost,
    installPlusFasteners,
    totalCost,
  };
}

/** Build estimate from org settings (fixed RRC). */
export function buildEstimateFromOrg(
  areaM2: number,
  org: OrgSettings | null | undefined,
): PartnerEstimate | null {
  if (!org) return null;
  return buildPartnerEstimate(areaM2, {
    panelPriceRub: FIXED_PANEL_PRICE_RUB,
    installPricePerM2: org.installPricePerM2,
    dowelsPerPanel: org.dowelsPerPanel,
    dowelPriceRub: org.dowelPriceRub,
  });
}

export function formatRub(n: number): string {
  return `${n.toLocaleString('ru-RU')} ₽`;
}
