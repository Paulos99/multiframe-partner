/** Входы в инструменты. Проблемомер — один, калькулятор — отдельно. */

export type WorkEntryId = 'consultation' | 'quick_calc';

export type WorkEntry = {
  id: WorkEntryId;
  title: string;
  description: string;
  route: 'problemomer' | 'calculator';
  startMode: 'consultation' | 'calculator' | 'problemomer';
};

export const WORK_ENTRIES: WorkEntry[] = [
  {
    id: 'consultation',
    title: 'Проблемомер',
    description: 'Покажет клиенту акустический комфорт и зачем нужно решение. Результат остаётся в текущей комнате или дожидается выбора места.',
    route: 'problemomer',
    startMode: 'problemomer',
  },
  {
    id: 'quick_calc',
    title: 'Калькулятор',
    description: 'Предварительная цена по площади или расчёт со схемой. Результат остаётся в текущей комнате или дожидается выбора места.',
    route: 'calculator',
    startMode: 'calculator',
  },
];
