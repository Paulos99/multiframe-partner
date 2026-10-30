/** Минимальный вид схемы zod, которого достаточно для разбора. */
export interface RequestSchema {
  safeParse(value: unknown): { success: true; data: any } | { success: false; error: { issues: any[] } };
}

export interface Schemas {
  loginRequest: RequestSchema;
  partnerCreate: RequestSchema;
  stpManagerCreate: RequestSchema;
  staffCreate: RequestSchema;
  staffUpdate: RequestSchema;
  partnerCityUpdate: RequestSchema;
  objectInput(options: { isNew: boolean }): RequestSchema;
  projectInput(existingName?: string): RequestSchema;
  materialMultipartStart: RequestSchema;
  materialMultipartRef: RequestSchema;
  materialMultipartParts: RequestSchema;
}

export const LOGIN_MAX: number;
export const LOGIN_LOOKUP_MAX: number;
export const STAFF_ASSIGNABLE_ROLES: string[];
export const OBJECT_ID_PATTERN: RegExp;
export const OBJECT_PAYLOAD_MAX: number;
export const PROJECT_LIMITS: Readonly<{ name: number }>;
export const MATERIAL_DIRECT_MAX_BYTES: number;
export const MATERIAL_MAX_PARTS: number;
export const MATERIAL_KEY_PATTERN: RegExp;

/** `z` — библиотека zod (v4), её передаёт вызывающий код. */
export function createSchemas(z: unknown): Schemas;

export function parseWith(
  schema: RequestSchema,
  value: unknown,
): { ok: true; data: any } | { ok: false; message: string; status: number };
