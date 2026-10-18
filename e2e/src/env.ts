export const SITE =
  process.env.E2E_BASE_URL || 'https://paulos99.github.io/multiframe-partner/';

export const API =
  process.env.E2E_API_URL ||
  'https://d5dff69141o8r1ehqm09.l5v6loqa.apigw.yandexcloud.net';

export const CREW_OBJECT_NAME = 'ТЕСТ доступ монтажника';

export type RoleId = 'admin' | 'owner' | 'sales' | 'measurer' | 'crew' | 'owner-b';

export type RoleCase = {
  id: RoleId;
  loginEnv: string;
  passwordEnv: string;
  /** Заголовок h1 кабинета. */
  title: RegExp;
  /** Своя сводка на главной. */
  summaryRegion: string;
  summaryTitle: string;
  /** null — у админа нет списка объектов, открываем список партнёров. */
  objectsHeading: 'Объекты' | 'Задания на монтаж' | null;
  /** Заголовок личной инструкции в «Обучении». */
  trainingTitle: string;
};

export const ROLES: RoleCase[] = [
  {
    id: 'admin',
    loginEnv: 'E2E_ADMIN_LOGIN',
    passwordEnv: 'E2E_ADMIN_PASSWORD',
    title: /^Сеть STP MultiFrame партнёра$/,
    summaryRegion: 'Управление партнёрской сетью',
    summaryTitle: 'Партнёры и поддержка команды',
    objectsHeading: null,
    trainingTitle: 'Ваша работа · Админ StP',
  },
  {
    id: 'owner',
    loginEnv: 'E2E_OWNER_LOGIN',
    passwordEnv: 'E2E_OWNER_PASSWORD',
    title: /^Владелец · Потолки Столицы$/,
    summaryRegion: 'Рабочая сводка',
    summaryTitle: 'Продолжите работу с клиентами',
    objectsHeading: 'Объекты',
    trainingTitle: 'Ваша работа · Владелец',
  },
  {
    id: 'sales',
    loginEnv: 'E2E_SALES_LOGIN',
    passwordEnv: 'E2E_SALES_PASSWORD',
    title: /^Менеджер · Потолки Столицы$/,
    summaryRegion: 'Рабочая сводка',
    summaryTitle: 'Продолжите работу с клиентами',
    objectsHeading: 'Объекты',
    trainingTitle: 'Ваша работа · Менеджер',
  },
  {
    id: 'measurer',
    loginEnv: 'E2E_MEASURER_LOGIN',
    passwordEnv: 'E2E_MEASURER_PASSWORD',
    title: /^Замерщик · Потолки Столицы$/,
    summaryRegion: 'Рабочая сводка',
    summaryTitle: 'От жалобы клиента к точному замеру',
    objectsHeading: 'Объекты',
    trainingTitle: 'Ваша работа · Замерщик',
  },
  {
    id: 'crew',
    loginEnv: 'E2E_CREW_LOGIN',
    passwordEnv: 'E2E_CREW_PASSWORD',
    title: /^Монтажник · Потолки Столицы$/,
    summaryRegion: 'Рабочая сводка',
    summaryTitle: 'Схема, материалы и задания — под рукой',
    objectsHeading: 'Задания на монтаж',
    trainingTitle: 'Ваша работа · Монтажник',
  },
  {
    id: 'owner-b',
    loginEnv: 'E2E_OWNER_B_LOGIN',
    passwordEnv: 'E2E_OWNER_B_PASSWORD',
    title: /^Владелец · Северный Потолок$/,
    summaryRegion: 'Рабочая сводка',
    summaryTitle: 'Продолжите работу с клиентами',
    objectsHeading: 'Объекты',
    trainingTitle: 'Ваша работа · Владелец',
  },
];

export function roleById(id: RoleId): RoleCase {
  const role = ROLES.find((item) => item.id === id);
  if (!role) throw new Error(`Неизвестная роль ${id}`);
  return role;
}

/** Читает секрет из окружения. В ошибке только имя переменной. */
export function credential(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Не задана переменная окружения ${name}. Имена перечислены в e2e/README.md.`);
  }
  return value;
}
