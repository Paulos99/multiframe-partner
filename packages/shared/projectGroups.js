/** Один список: проект (клиент и адрес) и его комнаты. Доска и аналитика зовут эту функцию. */

export function buildProjectCards(projects, rooms) {
  const grouped = new Map();
  const loose = [];
  for (const room of rooms || []) {
    if (room?.projectId) {
      const list = grouped.get(room.projectId) || [];
      list.push(room);
      grouped.set(room.projectId, list);
    } else loose.push(room);
  }
  const cards = (projects || []).map((project) => ({
    key: project.id,
    project,
    title: project.clientName || project.name,
    subtitle: [project.address, project.city].filter(Boolean).join(' · ') || 'Добавить адрес',
    rooms: grouped.get(project.id) || [],
    loose: false,
  }));
  for (const [projectId, projectRooms] of grouped) {
    if ((projects || []).some((project) => project.id === projectId)) continue;
    const sample = projectRooms[0];
    cards.push({
      key: projectId,
      project: null,
      title: sample.clientName || 'Клиент',
      subtitle: [sample.address, sample.city].filter(Boolean).join(' · ') || 'Добавить адрес',
      rooms: projectRooms,
      loose: false,
    });
  }
  for (const room of loose) {
    cards.push({
      key: `room:${room.id}`,
      project: null,
      title: room.clientName || 'Клиент',
      subtitle: [room.address, room.city].filter(Boolean).join(' · ') || 'Добавить адрес',
      rooms: [room],
      loose: true,
    });
  }
  return cards;
}

export function cardMatches(card, query, status) {
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

export function visibleRooms(rooms, status) {
  if (status === 'all') return rooms;
  return rooms.filter((room) => room.status === status);
}
