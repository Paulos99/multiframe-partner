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
 * Встроенные обучающие ролики (горизонтальные 16:9, с озвучкой): файл, длительность и версия по ключу ролика.
 * Кто какой ролик видит, решает не код, а админ StP в «Обучении» (роли видимости, packages/shared/materialsLib.js):
 * сначала каждый ролик виден своей роли, потом админ меняет роли или удаляет ролик.
 * Как заменить файл: docs/TRAINING_VIDEOS.md (скрипт `npm run video:swap`). Если коротко:
 * файлы лежат в apps/web/public/videos как <file>.mp4 и <file>.jpg (афиша), качество 1920×1080;
 * после замены обновите здесь `duration` и поднимите `version`.
 */
const VIDEOS: Partial<Record<UserRole, RoleVideo>> = {
  owner: { file: 'role-owner', title: 'Владелец компании', duration: '2:13', description: 'Что это за сервис и как им пользоваться владельцу.', version: '4' },
  sales: { file: 'role-sales', title: 'Менеджер по продажам', duration: '2:32', description: 'Как вести клиентов, считать потолок и собирать предложение.', version: '3' },
  measurer: { file: 'role-measurer', title: 'Замерщик', duration: '2:22', description: 'Калькулятор со схемой потолка, раскладка панелей для монтажника и Проблемомер на объекте.', version: '4' },
  crew: { file: 'role-crew', title: 'Монтажник', duration: '1:35', description: 'Обучение, схема монтажа по комнате и фотоотчёт до, во время и после монтажа.', version: '4' },
};

/** Встроенный ролик по ключу (owner, sales, measurer, crew). */
export function roleVideoFor(key: UserRole | string): RoleVideo | null {
  return VIDEOS[key as UserRole] ?? null;
}

export function roleVideoSrc(v: RoleVideo, base = '/'): { video: string; poster: string } {
  const b = base.replace(/\/?$/, '/');
  const q = `?v=${encodeURIComponent(v.version)}`;
  return { video: `${b}videos/${v.file}.mp4${q}`, poster: `${b}videos/${v.file}.jpg${q}` };
}
