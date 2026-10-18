/** Один список: проект (клиент и адрес) и его комнаты. Отдельной сущности нет. */

export type RoomLike = {
  id: string;
  projectId?: string | null;
  status: string;
  clientName?: string;
  clientPhone?: string;
  address?: string;
  city?: string;
  roomName?: string | null;
};

export type ProjectLike = {
  id: string;
  name: string;
  clientName?: string;
  clientPhone?: string;
  address?: string;
  city?: string;
};

export type ProjectCard<R extends RoomLike, P extends ProjectLike> = {
  key: string;
  project: P | null;
  title: string;
  subtitle: string;
  rooms: R[];
  loose: boolean;
};

export function buildProjectCards<R extends RoomLike, P extends ProjectLike>(
  projects: P[],
  rooms: R[],
): ProjectCard<R, P>[] {
  const grouped = new Map<string, R[]>();
  const loose: R[] = [];
  for (const room of rooms) {
    if (room.projectId) {
      const list = grouped.get(room.projectId) || [];
      list.push(room);
      grouped.set(room.projectId, list);
    } else loose.push(room);
  }
  const cards: ProjectCard<R, P>[] = projects.map((project) => ({
    key: project.id,
    project,
    title: project.name,
    subtitle: [project.clientName, project.address, project.city].filter(Boolean).join(' · ') || 'Адрес не заполнен',
    rooms: grouped.get(project.id) || [],
    loose: false,
  }));
  for (const [projectId, projectRooms] of grouped) {
    if (projects.some((project) => project.id === projectId)) continue;
    const sample = projectRooms[0];
    cards.push({
      key: projectId,
      project: null,
      title: sample.clientName || sample.address || 'Проект',
      subtitle: [sample.address, sample.city].filter(Boolean).join(' · ') || 'Комнаты проекта',
      rooms: projectRooms,
      loose: false,
    });
  }
  for (const room of loose) {
    cards.push({
      key: `room:${room.id}`,
      project: null,
      title: room.clientName || room.address || 'Помещение',
      subtitle: room.address || 'Свой проект появится при сохранении на сервере',
      rooms: [room],
      loose: true,
    });
  }
  return cards;
}

export function cardMatches<R extends RoomLike, P extends ProjectLike>(
  card: ProjectCard<R, P>,
  query: string,
  status: string,
): boolean {
  const rooms = status === 'all' ? card.rooms : card.rooms.filter((room) => room.status === status);
  if (status !== 'all' && rooms.length === 0) return false;
  const q = query.trim().toLocaleLowerCase('ru');
  if (!q) return true;
  const hay = [
    card.title,
    card.subtitle,
    card.project?.clientName,
    card.project?.clientPhone,
    card.project?.address,
    card.project?.city,
    ...rooms.flatMap((room) => [room.roomName, room.clientName, room.address, room.city, room.clientPhone]),
  ]
    .filter(Boolean)
    .join(' ')
    .toLocaleLowerCase('ru');
  return hay.includes(q);
}

export function visibleRooms<R extends RoomLike>(rooms: R[], status: string): R[] {
  if (status === 'all') return rooms;
  return rooms.filter((room) => room.status === status);
}
