/** Поля привязки помещения: отсутствуют в PATCH — остаются, у старого объекта не появляются. */
export function carriedObjectLink(
  input: object,
  existing: object | null | undefined,
): { projectId?: string | null; roomName?: string | null } {
  const out: { projectId?: string | null; roomName?: string | null } = {};
  const source = existing && typeof existing === 'object' ? existing : undefined;
  for (const key of ['projectId', 'roomName'] as const) {
    if (Object.prototype.hasOwnProperty.call(input, key)) {
      const value = (input as Record<string, unknown>)[key];
      out[key] = value == null || String(value).trim() === '' ? null : String(value).trim();
    } else if (source && Object.prototype.hasOwnProperty.call(source, key)) {
      const value = (source as Record<string, unknown>)[key];
      out[key] = value == null ? null : String(value);
    }
  }
  return out;
}
