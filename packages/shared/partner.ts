/** Shared partner profile — used by web and API. */

export type PartnerProfile = {
  id: string;
  login: string;
  companyName: string;
  /** Override RRC per panel (₽). Null = calculator default. */
  panelPriceRub: number | null;
  /** Override RRC per m² (₽). Null = calculator default. */
  pricePerM2: number | null;
  /** Install labour ₽/m². Null = hide install line. */
  installPricePerM2: number | null;
  /** Dowels per panel (default 2). */
  dowelsPerPanel: number;
  /** Price per dowel ₽. Null = quantity only. */
  dowelPriceRub: number | null;
};

export type PartnerPublic = Omit<PartnerProfile, never>;

export const DEFAULT_PANEL_PRICE_RUB = 2396;
export const DEFAULT_PRICE_PER_M2 = 5990;
export const DEFAULT_DOWELS_PER_PANEL = 2;
export const DOWEL_RESERVE = 0.15;
export const PANEL_AREA_M2 = 0.75 * 0.55;

export type LoginRequest = { login: string; password: string };
export type LoginResponse = { token: string; partner: PartnerProfile };
export type PatchProfileRequest = Partial<
  Pick<
    PartnerProfile,
    | 'companyName'
    | 'panelPriceRub'
    | 'pricePerM2'
    | 'installPricePerM2'
    | 'dowelsPerPanel'
    | 'dowelPriceRub'
  >
>;
