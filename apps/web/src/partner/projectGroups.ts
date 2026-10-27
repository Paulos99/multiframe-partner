/** Один список: проект (клиент и адрес) и его комнаты. Отдельной сущности нет. */
import {
  buildProjectCards as buildProjectCardsJs,
  cardMatches as cardMatchesJs,
  visibleRooms as visibleRoomsJs,
} from '../../../../packages/shared/projectGroups.js';

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

export const buildProjectCards = buildProjectCardsJs as <R extends RoomLike, P extends ProjectLike>(
  projects: P[],
  rooms: R[],
) => ProjectCard<R, P>[];

export const cardMatches = cardMatchesJs as <R extends RoomLike, P extends ProjectLike>(
  card: ProjectCard<R, P>,
  query: string,
  status: string,
) => boolean;

export const visibleRooms = visibleRoomsJs as <R extends RoomLike>(rooms: R[], status: string) => R[];
