/** Комнаты без projectId получают общий проект по компании, клиенту и адресу. */
export function groupOrphanRooms(
  doc:
    | {
        projects?: object[];
        objects?: object[];
      }
    | null
    | undefined,
): boolean;
