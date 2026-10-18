/** Поля привязки комнаты. Пустой projectId не отвязывает комнату от проекта. */
export function carriedObjectLink(
  input: object,
  existing: object | null | undefined,
): { projectId?: string | null; roomName?: string | null } {
  const out: { projectId?: string | null; roomName?: string | null } = {};
  const source = existing && typeof existing === 'object' ? existing : undefined;
  const keptProject =
    source && typeof (source as { projectId?: unknown }).projectId === 'string'
      ? String((source as { projectId: string }).projectId)
      : '';
  if (Object.prototype.hasOwnProperty.call(input, 'projectId')) {
    const value = (input as Record<string, unknown>).projectId;
    const next = value == null || String(value).trim() === '' ? '' : String(value).trim();
    if (next) out.projectId = next;
    else if (keptProject) out.projectId = keptProject;
    else out.projectId = null;
  } else if (source && Object.prototype.hasOwnProperty.call(source, 'projectId')) {
    out.projectId = keptProject || null;
  }
  if (Object.prototype.hasOwnProperty.call(input, 'roomName')) {
    const value = (input as Record<string, unknown>).roomName;
    out.roomName = value == null || String(value).trim() === '' ? null : String(value).trim();
  } else if (source && Object.prototype.hasOwnProperty.call(source, 'roomName')) {
    const value = (source as Record<string, unknown>).roomName;
    out.roomName = value == null ? null : String(value);
  }
  return out;
}
