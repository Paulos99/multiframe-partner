/** Текст, пока у открытого проекта нет сделки. Не обещает то, что уже выполнено. */

export function dealGapCopy(input: {
  projectOpen: boolean;
  hasRooms: boolean;
  loading: boolean;
  failed?: boolean;
}): string {
  if (input.loading) return 'Загрузка сделки…';
  if (input.projectOpen && input.hasRooms && input.failed) return 'Сделка для этого проекта ещё не создана.';
  if (input.projectOpen && input.hasRooms) return 'Открываем сделку по этому проекту.';
  if (input.projectOpen) return 'Сделка ведётся по проекту, в котором есть комната.';
  return 'Откройте проект — предложение относится к нему.';
}
