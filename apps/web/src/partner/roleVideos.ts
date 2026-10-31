import type { UserRole } from '../../../../packages/shared/partner';

export type RoleVideo = {
  /** Имя файла без расширения в public/videos: role-<имя>.mp4 и role-<имя>.jpg (афиша). */
  file: string;
  title: string;
  /** Длительность для подписи, «м:сс». */
  duration: string;
  description: string;
};

/**
 * Обучающие ролики по ролям (горизонтальные, с озвучкой).
 * Чтобы заменить ролик, положите новый mp4 с тем же именем в apps/web/public/videos и обновите длительность здесь.
 * У роли admin ролика нет.
 */
const VIDEOS: Partial<Record<UserRole, RoleVideo>> = {
  owner: { file: 'role-owner', title: 'Владелец компании', duration: '2:13', description: 'Что это за сервис и как им пользоваться владельцу.' },
  sales: { file: 'role-sales', title: 'Менеджер по продажам', duration: '2:23', description: 'Как вести клиентов, считать потолок и собирать предложение.' },
  measurer: { file: 'role-measurer', title: 'Замерщик', duration: '1:57', description: 'Как делать замеры и вести комнату объекта.' },
  crew: { file: 'role-crew', title: 'Монтажник', duration: '1:38', description: 'Что видно на монтаже и как отправлять фотоотчёт.' },
  stp_manager: { file: 'role-stp', title: 'Менеджер StP', duration: '1:03', description: 'Материалы, тренажёр, проблемомер и калькулятор.' },
};

export function roleVideoFor(role: UserRole): RoleVideo | null {
  return VIDEOS[role] ?? null;
}

export function roleVideoSrc(v: RoleVideo, base = '/'): { video: string; poster: string } {
  const b = base.replace(/\/?$/, '/');
  return { video: `${b}videos/${v.file}.mp4`, poster: `${b}videos/${v.file}.jpg` };
}
