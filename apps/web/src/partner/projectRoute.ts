export const PROJECT_TABS = ['overview', 'work', 'team', 'tasks', 'reports', 'documents', 'settings'] as const;

export type ProjectTab = (typeof PROJECT_TABS)[number];

export type ProjectRoute =
  | { kind: 'desk' }
  | { kind: 'project'; projectId: string; tab: ProjectTab }
  | { kind: 'room'; projectId: string; roomId: string; view?: RoomResultView };

/** Сохранённый расчёт комнаты как страница: результаты Проблемомера или калькулятора. */
export type RoomResultView = 'profile' | 'estimate';

function isResultView(value: string | undefined): value is RoomResultView {
  return value === 'profile' || value === 'estimate';
}

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
    if (parts[4] === 'result' && isResultView(parts[5])) {
      return { kind: 'room', projectId: parts[1], roomId: parts[3], view: parts[5] };
    }
    return { kind: 'room', projectId: parts[1], roomId: parts[3] };
  }
  return { kind: 'project', projectId: parts[1], tab: isTab(parts[2]) ? parts[2] : 'overview' };
}

export function projectHash(route: ProjectRoute): string {
  if (route.kind === 'desk') return '';
  const projectId = encodeURIComponent(route.projectId);
  if (route.kind === 'room') {
    const base = `#project/${projectId}/room/${encodeURIComponent(route.roomId)}`;
    return route.view ? `${base}/result/${route.view}` : base;
  }
  return `#project/${projectId}/${route.tab}`;
}

export type StaffRoute = { kind: 'list' } | { kind: 'person'; staffId: string };

/** #staff/<id>. Чужой адрес — список сотрудников. */
export function parseStaffHash(hash: string): StaffRoute {
  const raw = hash.replace(/^#/, '').replace(/^\/+/, '');
  const parts = raw.split('/').filter(Boolean).map((part) => {
    try {
      return decodeURIComponent(part);
    } catch {
      return part;
    }
  });
  if (parts[0] !== 'staff' || !parts[1]) return { kind: 'list' };
  return { kind: 'person', staffId: parts[1] };
}

export function staffHash(route: StaffRoute): string {
  if (route.kind === 'list') return '';
  return `#staff/${encodeURIComponent(route.staffId)}`;
}

export function navigateHash(hash: string, mode: 'push' | 'replace' = 'push') {
  if (typeof window === 'undefined') return;
  const next = `${window.location.pathname}${window.location.search}${hash}`;
  const current = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  if (next === current) return;
  if (mode === 'replace') window.history.replaceState(null, '', next);
  else window.history.pushState(null, '', next);
  window.dispatchEvent(new HashChangeEvent('hashchange'));
}

export function navigateProject(route: ProjectRoute, mode: 'push' | 'replace' = 'push') {
  navigateHash(projectHash(route), mode);
}

export function navigateStaff(route: StaffRoute, mode: 'push' | 'replace' = 'push') {
  navigateHash(staffHash(route), mode);
}
