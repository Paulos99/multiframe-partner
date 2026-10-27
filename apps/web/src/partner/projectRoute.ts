export const PROJECT_TABS = ['overview', 'work', 'team', 'tasks', 'reports', 'documents', 'settings'] as const;

export type ProjectTab = (typeof PROJECT_TABS)[number];

export type ProjectRoute =
  | { kind: 'desk' }
  | { kind: 'project'; projectId: string; tab: ProjectTab }
  | { kind: 'room'; projectId: string; roomId: string };

function isTab(value: string | undefined): value is ProjectTab {
  return Boolean(value && (PROJECT_TABS as readonly string[]).includes(value));
}

/** #project/<id>/<tab> или #project/<id>/room/<roomId>. Чужой адрес не трогаем. */
export function parseProjectHash(hash: string): ProjectRoute {
  const raw = hash.replace(/^#/, '').replace(/^\/+/, '');
  const parts = raw.split('/').filter(Boolean).map((part) => {
    try {
      return decodeURIComponent(part);
    } catch {
      return part;
    }
  });
  if (parts[0] !== 'project' || !parts[1]) return { kind: 'desk' };
  if (parts[2] === 'room' && parts[3]) {
    return { kind: 'room', projectId: parts[1], roomId: parts[3] };
  }
  return { kind: 'project', projectId: parts[1], tab: isTab(parts[2]) ? parts[2] : 'overview' };
}

export function projectHash(route: ProjectRoute): string {
  if (route.kind === 'desk') return '';
  const projectId = encodeURIComponent(route.projectId);
  if (route.kind === 'room') return `#project/${projectId}/room/${encodeURIComponent(route.roomId)}`;
  return `#project/${projectId}/${route.tab}`;
}

export function navigateProject(route: ProjectRoute, mode: 'push' | 'replace' = 'push') {
  if (typeof window === 'undefined') return;
  const hash = projectHash(route);
  const next = `${window.location.pathname}${window.location.search}${hash}`;
  const current = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  if (next === current) return;
  if (mode === 'replace') window.history.replaceState(null, '', next);
  else window.history.pushState(null, '', next);
  window.dispatchEvent(new HashChangeEvent('hashchange'));
}
