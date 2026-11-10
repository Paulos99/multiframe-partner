/** Минимальный вид схемы zod, которого достаточно для разбора. */
export interface RequestSchema {
  safeParse(value: unknown): { success: true; data: any } | { success: false; error: { issues: any[] } };
}

export interface Schemas {
  loginRequest: RequestSchema;
  partnerCreate: RequestSchema;
  ownerRegister: RequestSchema;
  registrationReject: RequestSchema;
  stpManagerCreate: RequestSchema;
  stpAdminCreate: RequestSchema;
  staffCreate: RequestSchema;
  staffUpdate: RequestSchema;
  partnerCityUpdate: RequestSchema;
  objectInput(options: { isNew: boolean }): RequestSchema;
  projectInput(existingName?: string): RequestSchema;
  materialMultipartStart: RequestSchema;
  materialMultipartRef: RequestSchema;
  materialMultipartParts: RequestSchema;
  materialAccess: RequestSchema;
}

export const LOGIN_MAX: number;
export const REGISTER_LIMITS: Readonly<{ name: number; company: number; city: number; login: number }>;
export const REGISTER_TRAP_FIELD: string;
export const LOGIN_LOOKUP_MAX: number;
export const STAFF_ASSIGNABLE_ROLES: string[];
export const OBJECT_ID_PATTERN: RegExp;
export const OBJECT_PAYLOAD_MAX: number;
export const PROJECT_LIMITS: Readonly<{ name: number }>;
export const MATERIAL_DIRECT_MAX_BYTES: number;
export const MATERIAL_MAX_PARTS: number;
export const MATERIAL_KEY_PATTERN: RegExp;
export type MaterialRole = 'owner' | 'sales' | 'measurer' | 'crew' | 'stp_manager';
export const MATERIAL_ROLES: MaterialRole[];
export function parseMaterialRoles(
  value: unknown,
): { ok: true; roles: MaterialRole[] | null | undefined } | { ok: false; message: string };

/** `z` — библиотека zod (v4), её передаёт вызывающий код. */
export function createSchemas(z: unknown): Schemas;

export function parseWith(
  schema: RequestSchema,
  value: unknown,
): { ok: true; data: any } | { ok: false; message: string; status: number };
