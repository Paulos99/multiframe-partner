/**
 * Демо-сотрудники без известного пароля.
 * Случайный bcrypt-хеш нужен только как замок: исходная строка нигде не хранится,
 * поэтому текущий API (сравнение хеша) отвечает «неверный пароль», а не падает.
 * Новые версии API дополнительно смотрят на loginDisabled.
 */
import { randomBytes } from 'node:crypto';
import bcrypt from 'bcryptjs';

export function sealDisabledDemoUsers(platform) {
  if (!platform?.users?.length) return platform;
  let changed = false;
  const users = platform.users.map((user) => {
    if (!user?.demo || user.loginDisabled !== true) return user;
    const locked =
      typeof user.passwordHash === 'string' && user.passwordHash.startsWith('$2');
    if (locked && !Object.prototype.hasOwnProperty.call(user, 'password')) return user;
    changed = true;
    const rest = { ...user };
    delete rest.password;
    return {
      ...rest,
      demo: true,
      loginDisabled: true,
      passwordHash: locked
        ? user.passwordHash
        : bcrypt.hashSync(randomBytes(24).toString('hex'), 10),
    };
  });
  return changed ? { ...platform, users } : platform;
}
