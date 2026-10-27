/**
 * Личное имя в профиле. Название роли («Владелец · Компания») именем не считается.
 * Телефон сюда не входит.
 */

const ROLE_WORD =
  /^(владелец|менеджер|замерщик|монтажник|админ|администратор|admin)$/i;

export const DEMO_PERSONAL_NAMES = {
  u_admin: 'Марина Белова',
  u_partner1: 'Андрей Соколов',
  u_sales1: 'Елена Крылова',
  u_measurer1: 'Игорь Лебедев',
  u_exec1: 'Игорь Лебедев',
  u_crew1: 'Павел Орлов',
  u_crew1b: 'Дмитрий Волков',
  u_partner2: 'Ольга Смирнова',
  u_sales2: 'Наталья Фролова',
  u_measurer2: 'Кирилл Егоров',
  u_exec2: 'Кирилл Егоров',
  u_crew2: 'Антон Белов',
};

export function personName(displayName) {
  const raw = String(displayName ?? '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!raw) return '';
  const first = raw.split(/[\s·•|]+/).filter(Boolean)[0] || '';
  if (!first || ROLE_WORD.test(first)) return '';
  return raw;
}

export function greetingName(displayName) {
  const full = personName(displayName);
  if (!full) return '';
  return full.split(/\s+/)[0] || '';
}

export function greetingLine(displayName, hour) {
  const h = Number.isFinite(hour) ? hour : new Date().getHours();
  const hello = h < 12 ? 'Доброе утро' : h < 18 ? 'Добрый день' : 'Добрый вечер';
  const name = greetingName(displayName);
  return name ? `${hello}, ${name}` : hello;
}

export function normalizePersonName(value) {
  const name = String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim();
  if (name.length > 80) {
    throw Object.assign(new Error('Имя: не длиннее 80 символов'), { status: 400 });
  }
  return name;
}

/** Старые демо-подписи «Роль · Компания» заменяет на личные имена. Пустое и уже заданное имя не трогает. */
export function applyDemoPersonalNames(users) {
  let changed = false;
  for (const user of users || []) {
    const next = user?.id ? DEMO_PERSONAL_NAMES[user.id] : '';
    if (!next) continue;
    const current = String(user.displayName || '').trim();
    if (!current || current === next || personName(current)) continue;
    user.displayName = next;
    changed = true;
  }
  return changed;
}
