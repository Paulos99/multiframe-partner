export type ProjectCardLike<R, P> = {
  key: string;
  project: P | null;
  title: string;
  subtitle: string;
  rooms: R[];
  loose: boolean;
};

export function buildProjectCards<R extends { id: string; projectId?: string | null }, P extends { id: string }>(
  projects: P[],
  rooms: R[],
): ProjectCardLike<R, P>[];

export function cardMatches(
  card: { rooms: Array<{ status?: string }>; title?: string; subtitle?: string; project?: object | null },
  query: string,
  status: string,
): boolean;

export function visibleRooms<R extends { status?: string }>(rooms: R[], status: string): R[];
