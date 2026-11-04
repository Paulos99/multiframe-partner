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
 * файлы лежат в apps/web/public/videos как <file>.mp4 и <file>.jpg (афиша); после замены обновите
 * здесь `duration` и поднимите `version`. У роли admin ролика нет.
 */
const VIDEOS: Partial<Record<UserRole, RoleVideo>> = {
  owner: { file: 'role-owner', title: 'Владелец компании', duration: '2:13', description: 'Что это за сервис и как им пользоваться владельцу.', version: '1' },
  sales: { file: 'role-sales', title: 'Менеджер по продажам', duration: '2:23', description: 'Как вести клиентов, считать потолок и собирать предложение.', version: '1' },
  measurer: { file: 'role-measurer', title: 'Замерщик', duration: '1:57', description: 'Как делать замеры и вести комнату объекта.', version: '1' },
  crew: { file: 'role-crew', title: 'Монтажник', duration: '1:38', description: 'Что видно на монтаже и как отправлять фотоотчёт.', version: '1' },
  stp_manager: { file: 'role-stp', title: 'Менеджер StP', duration: '1:03', description: 'Материалы, тренажёр, проблемомер и калькулятор.', version: '1' },
};

export function roleVideoFor(role: UserRole): RoleVideo | null {
  return VIDEOS[role] ?? null;
}

export function roleVideoSrc(v: RoleVideo, base = '/'): { video: string; poster: string } {
  const b = base.replace(/\/?$/, '/');
  const q = `?v=${encodeURIComponent(v.version)}`;
  return { video: `${b}videos/${v.file}.mp4${q}`, poster: `${b}videos/${v.file}.jpg${q}` };
}
