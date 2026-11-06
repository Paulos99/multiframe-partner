import type { UserRole } from '../../../../packages/shared/partner';

export type RoleVideo = {
  /** Имя файла без расширения в public/videos: role-<имя>.mp4 и role-<имя>.jpg (афиша). */
  file: string;
  title: string;
  /** Длительность для подписи, «м:сс». */
  duration: string;
  description: string;
  /**
   * Версия файла. Меняйте при замене ролика: адрес получит «?v=…», и браузер с сервером кэша
   * не покажут старое видео.
   */
  version: string;
};

/**
 * Обучающие ролики по ролям (горизонтальные 16:9, с озвучкой): единственное место, где роль связана с файлом.
 * Как заменить ролик: docs/TRAINING_VIDEOS.md (скрипт `npm run video:swap`). Если коротко:
 * файлы лежат в apps/web/public/videos как <file>.mp4 и <file>.jpg (афиша), качество 1920×1080;
 * после замены обновите здесь `duration` и поднимите `version`. У менеджера StP своего ролика нет; администратор StP видит все четыре ролика, но только смотрит: удаления в кабинете нет, заменяются ролики кодом (docs/TRAINING_VIDEOS.md).
 */
const VIDEOS: Partial<Record<UserRole, RoleVideo>> = {
  owner: { file: 'role-owner', title: 'Владелец компании', duration: '2:13', description: 'Что это за сервис и как им пользоваться владельцу.', version: '3' },
  sales: { file: 'role-sales', title: 'Менеджер по продажам', duration: '2:32', description: 'Как вести клиентов, считать потолок и собирать предложение.', version: '3' },
  measurer: { file: 'role-measurer', title: 'Замерщик', duration: '2:22', description: 'Калькулятор со схемой потолка, раскладка панелей для монтажника и Проблемомер на объекте.', version: '3' },
  crew: { file: 'role-crew', title: 'Монтажник', duration: '1:35', description: 'Обучение, схема монтажа по комнате и фотоотчёт до, во время и после монтажа.', version: '3' },
};

/** Порядок показа администратору StP: все ролики ролей. */
const ADMIN_ORDER = ['owner', 'sales', 'measurer', 'crew'] as const satisfies readonly UserRole[];

/** Ролики, которые видит роль: свой (рабочие роли) или все четыре (admin). Менеджер StP — ни одного. */
export function roleVideosFor(role: UserRole): Array<{ role: UserRole; video: RoleVideo }> {
  if (role === 'admin') return ADMIN_ORDER.map((r) => ({ role: r, video: VIDEOS[r]! }));
  const own = VIDEOS[role];
  return own ? [{ role, video: own }] : [];
}

export function roleVideoFor(role: UserRole): RoleVideo | null {
  return VIDEOS[role] ?? null;
}

export function roleVideoSrc(v: RoleVideo, base = '/'): { video: string; poster: string } {
  const b = base.replace(/\/?$/, '/');
  const q = `?v=${encodeURIComponent(v.version)}`;
  return { video: `${b}videos/${v.file}.mp4${q}`, poster: `${b}videos/${v.file}.jpg${q}` };
}
