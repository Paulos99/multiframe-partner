/** Shared types — partner portal roles and org settings. */

export type UserRole = 'admin' | 'partner' | 'executor';

/** Fixed RRC — not editable in cabinet. */
export const FIXED_PANEL_PRICE_RUB = 2396;
export const FIXED_PRICE_PER_M2 = 5990;
export const DEFAULT_DOWELS_PER_PANEL = 2;
export const DOWEL_RESERVE = 0.15;
export const PANEL_AREA_M2 = 0.75 * 0.55;

/** @deprecated use FIXED_* */
export const DEFAULT_PANEL_PRICE_RUB = FIXED_PANEL_PRICE_RUB;
/** @deprecated use FIXED_* */
export const DEFAULT_PRICE_PER_M2 = FIXED_PRICE_PER_M2;

export type OrgSettings = {
  companyName: string;
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
  /** Executor invite token if entered via link. */
  execToken?: string | null;
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

export function toPartnerProfile(user: SessionUser): PartnerProfile | null {
  if (!user.org) return null;
  return {
    ...user,
    companyName: user.org.companyName,
    panelPriceRub: FIXED_PANEL_PRICE_RUB,
    pricePerM2: FIXED_PRICE_PER_M2,
    installPricePerM2: user.org.installPricePerM2,
    dowelsPerPanel: user.org.dowelsPerPanel,
    dowelPriceRub: user.org.dowelPriceRub,
  };
}
