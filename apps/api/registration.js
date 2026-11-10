/**
 * Самостоятельная регистрация владельца: состояние заявки хранится в записи компании (org.registration).
 *
 * Статусы: pending — ждёт решения StP, approved — подтверждена, rejected — отклонена.
 * Компании, созданные администратором, поля registration не имеют и считаются обычными.
 * Владелец с заявкой pending входит и работает сразу (решение владельца продукта от 10 ноября 2026).
 * Отклонённая заявка закрывает вход всем пользователям компании, пока StP её не подтвердит.
 */

export const REGISTRATION_STATUSES = ['pending', 'approved', 'rejected'];

/** Частота регистраций с одного адреса. Переменная REGISTER_IP_LIMIT меняет предел (для проверок). */
export function registerRateLimit() {
  const limit = Number(process.env.REGISTER_IP_LIMIT);
  return { limit: Number.isFinite(limit) && limit > 0 ? limit : 5, windowMs: 60 * 60 * 1000 };
}

/** Статус заявки компании или null, если компания заведена администратором. */
export function registrationStatus(org) {
  const status = org?.registration?.status;
  return REGISTRATION_STATUSES.includes(status) ? status : null;
}

export function registrationRejected(org) {
  return registrationStatus(org) === 'rejected';
}

/** Текст для входа в отклонённый кабинет. */
export function rejectionMessage(org) {
  const reason = String(org?.registration?.reason || '').trim();
  return reason
    ? `Регистрация отклонена StP. Причина: ${reason}`
    : 'Регистрация отклонена StP. Если это ошибка, свяжитесь с вашим менеджером StP.';
}

/** Ошибка API для пользователя отклонённой компании: интерфейс по коду закрывает сеанс. */
export function rejectionError(org) {
  return Object.assign(new Error(rejectionMessage(org)), {
    status: 403,
    code: 'registration_rejected',
  });
}

/** Новая заявка: личные данные заявителя для раздела «Кабинеты». */
export function newRegistration({ firstName, lastName, at }) {
  return { status: 'pending', source: 'self', firstName, lastName, submittedAt: at };
}

/** Решение по заявке. Прежние данные заявки сохраняются; причина есть только у отклонения. */
export function decideRegistration(registration, { status, reason = '', by, at }) {
  const next = { ...(registration || {}), status, decidedAt: at, decidedBy: by };
  if (status === 'rejected' && reason) next.reason = reason;
  else delete next.reason;
  return next;
}

/** Что отдаётся пользователю в сеансе: статус и причина, без данных о том, кто решал. */
export function publicRegistration(org) {
  const status = registrationStatus(org);
  if (!status) return null;
  return status === 'rejected' && org.registration.reason
    ? { status, reason: String(org.registration.reason) }
    : { status };
}
