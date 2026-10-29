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

/** Список сотрудников теперь вкладка раздела «Компания»; карточка по-прежнему #staff/<id>. */
export function staffHash(route: StaffRoute): string {
  if (route.kind === 'list') return companyHash('staff');
  return `#staff/${encodeURIComponent(route.staffId)}`;
}

export const COMPANY_TABS = ['about', 'staff'] as const;

export type CompanyTab = (typeof COMPANY_TABS)[number];

function hashParts(hash: string): string[] {
  return hash
    .replace(/^#/, '')
    .replace(/^\/+/, '')
    .split('/')
    .filter(Boolean)
    .map((part) => {
      try {
        return decodeURIComponent(part);
      } catch {
        return part;
      }
    });
}

/** #company/<about|staff>. Не адрес раздела — null. «#company» без вкладки — «О компании». */
export function parseCompanyHash(hash: string): CompanyTab | null {
  const parts = hashParts(hash);
  if (parts[0] !== 'company') return null;
  return parts[1] === 'staff' ? 'staff' : 'about';
}

export function companyHash(tab: CompanyTab): string {
  return `#company/${tab}`;
}

/** Старый адрес списка: «#staff» без id. Его переводим на вкладку «Сотрудники». */
export function isLegacyStaffList(hash: string): boolean {
  const parts = hashParts(hash);
  return parts[0] === 'staff' && !parts[1];
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

export function navigateCompany(tab: CompanyTab, mode: 'push' | 'replace' = 'push') {
  navigateHash(companyHash(tab), mode);
}

export type CasesRoute = { kind: 'list' } | { kind: 'case'; objectId: string };

/** #analytics/photo-reports — «Аналитика → Фото отчёты», …/<id комнаты> — страница отчёта. Старый #cases читается так же. */
export function parseCasesHash(hash: string): CasesRoute | null {
  const parts = hashParts(hash);
  const rest = parts[0] === 'cases' ? parts.slice(1) : parts[0] === 'analytics' && parts[1] === 'photo-reports' ? parts.slice(2) : null;
  if (!rest) return null;
  return rest[0] ? { kind: 'case', objectId: rest[0] } : { kind: 'list' };
}

export function casesHash(route: CasesRoute): string {
  return route.kind === 'case'
    ? `#analytics/photo-reports/${encodeURIComponent(route.objectId)}`
    : '#analytics/photo-reports';
}

export function navigateCases(route: CasesRoute, mode: 'push' | 'replace' = 'push') {
  navigateHash(casesHash(route), mode);
}
