/**
 * Подписи для аналитики обучения. Темы отказа и темы викторины короткие и лежат здесь, чтобы не грузить весь
 * тренажёр (около 280 КБ) ради таблицы; совпадение ключей с содержимым тренажёра проверяет тест.
 */
import type { WeakTopic } from '../../../../packages/shared/trainingStats.js';

export const REASON_TITLES: Record<string, string> = {
  price_too_high: 'Дорого',
  cheaper_alternative: 'Нашли дешевле',
  other_solution: 'Выбрали другое решение',
  doubt_effect: 'Сомнения в эффекте',
  unrealistic_expectation: 'Ждёт полной тишины',
  doubt_safety: 'Здоровье и экология',
  install_too_long: 'Долгий монтаж',
  postpone_decision: 'Отложит решение',
  not_needed: 'Шум не мешает',
  lose_space: 'Жалко высоту и площадь',
  decision_maker: 'Решает не он один',
  need_details: 'Нужны подробности',
};

export const QUIZ_TOPIC_TITLES: Record<string, string> = {
  material: 'Материал и состав',
  product: 'Панели Wave и Flat',
  principle: 'Принцип работы',
  install: 'Монтаж',
  space: 'Высота потолка',
  tests: 'Проблемомер и сравнение материалов',
  safety: 'Безопасность и экология',
  honesty: 'Честные формулировки',
  sales: 'Как продавать',
};

export const MODE_LABELS: Record<string, string> = {
  objection: 'Быстрая отработка',
  roleplay: 'Сценарий',
  quiz: 'Викторина',
};

export const ROLE_TITLES: Record<string, string> = {
  sales: 'Менеджер',
  measurer: 'Замерщик',
  crew: 'Монтажник',
  owner: 'Владелец',
};

export function topicLabel(topic: Pick<WeakTopic, 'kind' | 'key'>): string {
  return (topic.kind === 'quiz' ? QUIZ_TOPIC_TITLES[topic.key] : REASON_TITLES[topic.key]) || 'Другая тема';
}

export function percent(share: number | null | undefined): string {
  return typeof share === 'number' ? `${Math.round(share * 100)}%` : '—';
}

function plural(n: number, one: string, few: string, many: string): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}

/** «сегодня», «вчера», «3 дня назад»; дальше месяца — «больше месяца назад». */
export function sinceLabel(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return 'ещё не занимался';
  const days = Math.floor((now - Date.parse(iso)) / 86400000);
  if (days <= 0) return 'сегодня';
  if (days === 1) return 'вчера';
  if (days > 30) return 'больше месяца назад';
  return `${days} ${plural(days, 'день', 'дня', 'дней')} назад`;
}

export function dateLabel(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export const employeesWord = (n: number) => `${n} ${plural(n, 'сотрудник', 'сотрудника', 'сотрудников')}`;
export const setsWord = (n: number) => `${n} ${plural(n, 'подход', 'подхода', 'подходов')}`;
