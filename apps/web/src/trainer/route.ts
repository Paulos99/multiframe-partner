/** Адреса тренажёра внутри «Обучения»: #trainer, #trainer/drill, #trainer/scenarios/<id>/talk и т. д. */
export type TrainerRoute =
  | { page: 'home' }
  | { page: 'drill'; objectionId?: string }
  | { page: 'scenarios' }
  | { page: 'scenario'; id: string; step: 'situation' | 'talk' | 'result' }
  | { page: 'quiz'; step: 'start' | 'run' | 'result' }
  | { page: 'progress' }
  | { page: 'bank'; id?: string };

function parts(hash: string): string[] {
  return hash
    .replace(/^#/, '')
    .replace(/^\/+/, '')
    .split('/')
    .filter(Boolean)
    .map((p) => {
      try {
        return decodeURIComponent(p);
      } catch {
        return p;
      }
    });
}

export function trainerHashOpen(hash = typeof window === 'undefined' ? '' : window.location.hash): boolean {
  return parts(hash)[0] === 'trainer';
}

export function parseTrainerHash(hash: string): TrainerRoute {
  const p = parts(hash);
  if (p[0] !== 'trainer') return { page: 'home' };
  switch (p[1]) {
    case 'drill':
      return p[2] ? { page: 'drill', objectionId: p[2] } : { page: 'drill' };
    case 'scenarios':
      if (!p[2]) return { page: 'scenarios' };
      return { page: 'scenario', id: p[2], step: p[3] === 'talk' ? 'talk' : p[3] === 'result' ? 'result' : 'situation' };
    case 'quiz':
      return { page: 'quiz', step: p[2] === 'run' ? 'run' : p[2] === 'result' ? 'result' : 'start' };
    case 'progress':
      return { page: 'progress' };
    case 'bank':
      return p[2] ? { page: 'bank', id: p[2] } : { page: 'bank' };
    default:
      return { page: 'home' };
  }
}

export function trainerHash(route: TrainerRoute): string {
  const e = encodeURIComponent;
  switch (route.page) {
    case 'home':
      return '#trainer';
    case 'drill':
      return route.objectionId ? `#trainer/drill/${e(route.objectionId)}` : '#trainer/drill';
    case 'scenarios':
      return '#trainer/scenarios';
    case 'scenario':
      return `#trainer/scenarios/${e(route.id)}${route.step === 'situation' ? '' : `/${route.step}`}`;
    case 'quiz':
      return route.step === 'start' ? '#trainer/quiz' : `#trainer/quiz/${route.step}`;
    case 'progress':
      return '#trainer/progress';
    case 'bank':
      return route.id ? `#trainer/bank/${e(route.id)}` : '#trainer/bank';
  }
}
