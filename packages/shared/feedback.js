/**
 * Обратная связь от партнёров администраторам StP: ошибки, предложения, вопросы, с фото.
 * Общие правила для API и интерфейса: типы, статусы, кто что может, проверка текста и контекста.
 *
 * Отправляют все роли партнёра (владелец, менеджер, замерщик, монтажник) и видят только свои обращения.
 * Разбирают только администраторы StP: видят все, меняют статус и пишут ответ, который видит отправитель.
 * Менеджер StP сюда не допущен: его роль — обучение и инструменты, а в обращениях бывают снимки с данными клиентов.
 */

export const FEEDBACK_TYPES = ['bug', 'idea', 'question'];
export const FEEDBACK_TYPE_LABELS = { bug: 'Ошибка', idea: 'Предложение', question: 'Вопрос' };

export const FEEDBACK_STATUSES = ['new', 'in_progress', 'fixed', 'rejected'];
export const FEEDBACK_STATUS_LABELS = {
  new: 'Новое',
  in_progress: 'В работе',
  fixed: 'Исправлено',
  rejected: 'Отклонено',
};

export const FEEDBACK_TEXT_MAX = 3000;
export const FEEDBACK_REPLY_MAX = 2000;
export const FEEDBACK_PHOTO_LIMIT = 5;

const SENDER_ROLES = new Set(['owner', 'sales', 'measurer', 'crew']);

/** Может ли роль отправлять обращения и видеть «Мои обращения». */
export function canSendFeedback(role) {
  return SENDER_ROLES.has(String(role || ''));
}

/** Может ли роль разбирать обращения всех партнёров. */
export function canManageFeedback(role) {
  return String(role || '') === 'admin';
}

export function isFeedbackType(value) {
  return FEEDBACK_TYPES.includes(String(value || ''));
}

export function isFeedbackStatus(value) {
  return FEEDBACK_STATUSES.includes(String(value || ''));
}

function clip(value, max) {
  return String(value ?? '')
    .replace(/\r\n?/g, '\n')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .trim()
    .slice(0, max);
}

/** Текст обращения: обязателен, не длиннее предела. */
export function cleanFeedbackText(raw) {
  const text = clip(raw, FEEDBACK_TEXT_MAX);
  if (!text) return { error: 'Опишите, что случилось или что предлагаете' };
  return { value: text };
}

export function cleanFeedbackReply(raw) {
  return clip(raw, FEEDBACK_REPLY_MAX);
}

/**
 * Контекст, который присылает приложение: страница, устройство, версия.
 * Компанию, сотрудника, роль и время сервер подставляет сам и из запроса их не берёт.
 */
export function cleanFeedbackContext(raw) {
  const src = raw && typeof raw === 'object' ? raw : {};
  return {
    page: clip(src.page, 300),
    pageTitle: clip(src.pageTitle, 120),
    device: clip(src.device, 300),
    screen: clip(src.screen, 40),
    appVersion: clip(src.appVersion, 40),
    online: typeof src.online === 'boolean' ? src.online : null,
  };
}

/** Сколько новых обращений: для значка у администратора. */
export function countNewFeedback(items) {
  return (Array.isArray(items) ? items : []).filter((item) => item && item.status === 'new').length;
}

/**
 * Фильтр списка администратора. Пустое значение — без фильтра.
 * @param {Array<object>} items
 * @param {{ status?: string|null, type?: string|null, orgId?: string|null }} filter
 */
export function filterFeedback(items, { status = null, type = null, orgId = null } = {}) {
  return (Array.isArray(items) ? items : [])
    .filter((item) => item && (!status || item.status === status))
    .filter((item) => !type || item.type === type)
    .filter((item) => !orgId || item.orgId === orgId)
    .sort((a, b) => (String(a.createdAt) < String(b.createdAt) ? 1 : -1));
}
