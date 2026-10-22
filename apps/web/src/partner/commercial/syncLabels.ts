/** PRD §9: понятные статусы синхронизации без ложной уверенности. */

export type SyncUiKind = 'saved_local' | 'uploading' | 'synced' | 'retry' | 'offline';

export function resolveSyncUi(input: {
  online: boolean;
  pending: number;
  authHold: boolean;
  failed?: boolean;
}): { kind: SyncUiKind; label: string; hint: string } {
  if (input.authHold) {
    return {
      kind: 'saved_local',
      label: 'Сохранено на устройстве',
      hint: 'Сессия истекла. Очередь на устройстве сохранится и уйдёт на сервер после входа.',
    };
  }
  if (!input.online) {
    return {
      kind: 'offline',
      label: input.pending > 0 ? 'Сохранено на устройстве' : 'Офлайн',
      hint: 'Нет сети. Замеры и расчёты остаются на этом устройстве.',
    };
  }
  if (input.failed) {
    return {
      kind: 'retry',
      label: 'Требуется повторить',
      hint: 'Выгрузка не удалась. Данные на устройстве; повторите синхронизацию.',
    };
  }
  if (input.pending > 0) {
    return {
      kind: 'uploading',
      label: 'Выгружается',
      hint: `В очереди ${input.pending}. Отправка продолжается при появлении сети.`,
    };
  }
  return {
    kind: 'synced',
    label: 'Синхронизировано',
    hint: 'Локальные изменения совпадают с сервером.',
  };
}
