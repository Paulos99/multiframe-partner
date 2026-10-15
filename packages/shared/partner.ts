/** Shared types — partner portal roles and org settings. */

export type UserRole = 'admin' | 'partner' | 'executor';

/** Official StP RRC (reference in cabinet). */
export const OFFICIAL_PANEL_PRICE_RUB = 2396;
export const OFFICIAL_PRICE_PER_M2 = 5990;

/** @deprecated use OFFICIAL_* */
export const FIXED_PANEL_PRICE_RUB = OFFICIAL_PANEL_PRICE_RUB;
/** @deprecated use OFFICIAL_* */
export const FIXED_PRICE_PER_M2 = OFFICIAL_PRICE_PER_M2;
/** @deprecated use OFFICIAL_* */
export const DEFAULT_PANEL_PRICE_RUB = OFFICIAL_PANEL_PRICE_RUB;
/** @deprecated use OFFICIAL_* */
export const DEFAULT_PRICE_PER_M2 = OFFICIAL_PRICE_PER_M2;

export const DEFAULT_DOWELS_PER_PANEL = 2;
export const DOWEL_RESERVE = 0.15;
export const PANEL_AREA_M2 = 0.75 * 0.55;

export type OrgSettings = {
  companyName: string;
  /** Partner RRC per panel ₽ (defaults to official). */
  panelPriceRub: number;
  /** Partner RRC per m² ₽ (defaults to official). */
  pricePerM2: number;
  /** Install labour ₽/m². Null = hide install line. */
  installPricePerM2: number | null;
  /** Dowels per panel (default 2). */
  dowelsPerPanel: number;
  /** Price per dowel ₽. Null = quantity only. */
  dowelPriceRub: number | null;
};

export type SessionUser = {
  id: string;
  login: string;
  role: UserRole;
  displayName: string;
  /** Set for partner and executor. */
  orgId: string | null;
  org: OrgSettings | null;
};

/** @deprecated links replaced by executor login/password accounts */
export type ExecutorLink = {
  id: string;
  token: string;
  orgId: string;
  label: string;
  createdAt: string;
  createdBy: string;
  lastUsedAt: string | null;
  uses: number;
};

/** Legacy shape kept for estimate helpers. */
export type PartnerProfile = SessionUser &
  OrgSettings & {
    companyName: string;
    panelPriceRub: number;
    pricePerM2: number;
    installPricePerM2: number | null;
    dowelsPerPanel: number;
    dowelPriceRub: number | null;
  };

export type PatchOrgRequest = Partial<OrgSettings>;

export type ActivityEvent = {
  id: string;
  at: string;
  orgId: string | null;
  userId: string | null;
  login: string;
  action: string;
  detail?: string;
};

export function normalizeOrgSettings(
  partial: Partial<OrgSettings> & { companyName?: string },
): OrgSettings {
  const panel =
    partial.panelPriceRub != null && Number(partial.panelPriceRub) > 0
      ? Number(partial.panelPriceRub)
      : OFFICIAL_PANEL_PRICE_RUB;
  const perM2 =
    partial.pricePerM2 != null && Number(partial.pricePerM2) > 0
      ? Number(partial.pricePerM2)
      : OFFICIAL_PRICE_PER_M2;
  return {
    companyName: (partial.companyName || '').trim(),
    panelPriceRub: panel,
    pricePerM2: perM2,
    installPricePerM2:
      partial.installPricePerM2 == null || Number.isNaN(Number(partial.installPricePerM2))
        ? null
        : Number(partial.installPricePerM2),
    dowelsPerPanel: Math.max(1, Number(partial.dowelsPerPanel) || DEFAULT_DOWELS_PER_PANEL),
    dowelPriceRub:
      partial.dowelPriceRub == null || Number.isNaN(Number(partial.dowelPriceRub))
        ? null
        : Number(partial.dowelPriceRub),
  };
}

export function toPartnerProfile(user: SessionUser): PartnerProfile | null {
  if (!user.org) return null;
  const org = normalizeOrgSettings(user.org);
  return {
    ...user,
    ...org,
    companyName: org.companyName,
  };
}
