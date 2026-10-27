export function demoHistoryReady(
  events: Array<{ id?: string; orgId?: string | null; at?: string; schema?: number }> | null | undefined,
): boolean;

export function supplementDemoHistory<
  T extends { id?: string; orgId?: string | null; at?: string; schema?: number },
>(stored: T[] | null | undefined, generated: T[] | null | undefined): T[];
