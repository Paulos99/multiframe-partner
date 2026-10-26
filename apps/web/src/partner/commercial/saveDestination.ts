/**
 * Решение «куда сохранить» результат консультации или калькулятора.
 * Чистая проверка: проект создаётся только после явного подтверждения.
 */

export type SaveMode = 'existing' | 'new';
export type AreaChoice = 'consultation' | 'room';

export type ConsultSnapshot = {
  areaM2: number | null;
  summary: string;
  totalCost: number | null;
  panels: number | null;
};

export type SaveDraftView = {
  tool: 'problemomer' | 'calculator';
  areaM2: number | null;
  totalCost: number | null;
  hasProfile: boolean;
  preliminary: boolean;
  hasScheme: boolean;
};

export type SaveIntent = {
  mode: SaveMode;
  projectId: string | null;
  roomId: string | null;
  projectName: string;
  roomName: string;
  phone: string;
  address: string;
  areaChoice: AreaChoice | null;
  roomAreaM2: number | null;
};

export function areasDiffer(roomArea: number | null | undefined, incoming: number | null | undefined): boolean {
  if (roomArea == null || incoming == null) return false;
  if (!(roomArea > 0) || !(incoming > 0)) return false;
  return Math.abs(roomArea - incoming) > 0.05;
}

export function saveSummary(draft: SaveDraftView): string[] {
  const lines: string[] = [];
  if (draft.hasProfile) lines.push('Профиль акустического комфорта');
  if (draft.preliminary) lines.push('Предварительный расчёт по площади, без схемы');
  if (draft.hasScheme) lines.push('Расчёт со схемой раскладки');
  if (draft.areaM2 != null && draft.areaM2 > 0) {
    lines.push(`Площадь ${draft.areaM2.toLocaleString('ru-RU')} м²`);
  }
  if (draft.totalCost != null) {
    lines.push(`Сумма ${Math.round(draft.totalCost).toLocaleString('ru-RU')} ₽`);
  }
  return lines;
}

export function validateSave(draft: SaveDraftView, intent: SaveIntent): string | null {
  if (draft.tool === 'calculator' && !(draft.areaM2 != null && draft.areaM2 > 0)) {
    return 'Площадь должна быть больше нуля';
  }
  if (intent.mode === 'existing') {
    if (!intent.projectId) return 'Выберите проект';
    if (!intent.roomId) return 'Выберите комнату';
  } else {
    if (!intent.projectName.trim()) return 'Укажите название проекта';
    if (!intent.roomName.trim()) return 'Укажите название комнаты';
  }
  const comparable = intent.mode === 'existing' ? intent.roomAreaM2 : null;
  if (areasDiffer(comparable, draft.areaM2) && !intent.areaChoice) {
    return 'Площадь не совпадает с комнатой. Выберите, какую оставить.';
  }
  return null;
}

/** Проект в базе появляется только вместе с подтверждённым созданием. */
export function shouldCreateProject(confirmed: boolean, mode: SaveMode): boolean {
  return confirmed && mode === 'new';
}

export function chosenArea(intent: SaveIntent, incoming: number | null): number | null {
  if (intent.areaChoice === 'room' && intent.roomAreaM2 != null && intent.roomAreaM2 > 0) {
    return intent.roomAreaM2;
  }
  return incoming;
}
