export const DEMO_PERSONAL_NAMES: Record<string, string>;

export function personName(displayName: string | null | undefined): string;

export function greetingName(displayName: string | null | undefined): string;

export function greetingLine(displayName: string | null | undefined, hour?: number): string;

export function normalizePersonName(value: unknown): string;

export function applyDemoPersonalNames(
  users: Array<{ id?: string; displayName?: string }> | null | undefined,
): boolean;
