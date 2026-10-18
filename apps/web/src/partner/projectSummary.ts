/** Предварительная сводка: только помещения с сохранённым итогом. Это не коммерческое предложение. */
export function preliminaryRoomTotal(
  rooms: Array<{ estimate?: { totalCost?: number | null } | null }>,
): { calculated: number; total: number; rooms: number } {
  const complete = rooms.filter(
    (room) =>
      room.estimate != null &&
      typeof room.estimate.totalCost === 'number' &&
      Number.isFinite(room.estimate.totalCost),
  );
  return {
    calculated: complete.length,
    total: complete.reduce((sum, room) => sum + (room.estimate?.totalCost || 0), 0),
    rooms: rooms.length,
  };
}
