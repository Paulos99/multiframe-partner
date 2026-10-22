/** Три равноправные точки входа в работу (PRD §3.1). */

export type WorkEntryId = 'consultation' | 'quick_calc' | 'acoustic';

export type WorkEntry = {
  id: WorkEntryId;
  title: string;
  description: string;
  /** Куда ведёт UI. */
  route: 'problemomer' | 'calculator' | 'cabinet';
  startMode: 'consultation' | 'calculator' | 'problemomer';
};

export const WORK_ENTRIES: WorkEntry[] = [
  {
    id: 'consultation',
    title: 'Новый клиент / консультация',
    description: 'Короткая карточка и вопросы о помещении — предложить MultiFrame.',
    route: 'problemomer',
    startMode: 'consultation',
  },
  {
    id: 'quick_calc',
    title: 'Быстрый расчёт',
    description: 'Сразу калькулятор. Потом можно привязать к проекту.',
    route: 'calculator',
    startMode: 'calculator',
  },
  {
    id: 'acoustic',
    title: 'Оценить акустический комфорт',
    description: 'Проблемомер для диагностики и демонстрации.',
    route: 'problemomer',
    startMode: 'problemomer',
  },
];
