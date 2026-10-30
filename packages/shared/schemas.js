/**
 * Схемы проверки критичных запросов API (вход, пользователи, проекты, комнаты, материалы).
 *
 * Модуль не импортирует zod сам: библиотеку передаёт вызывающий код (`createSchemas(z)`).
 * Так один и тот же файл работает и в API (zod лежит в apps/api/node_modules, в архиве облачной
 * функции и в образе Docker), и в интерфейсе, где у сборки свой каталог зависимостей.
 *
 * Схемы повторяют прежние правила сервера: те же тексты ошибок, те же статусы и пределы.
 * Нарушение правила — замечание (issue) со статусом в params.status (по умолчанию 400).
 * Разбор выполняет `parseWith` / `firstIssue`: берётся первое замечание.
 */

/** Предельная длина логина при создании пользователя. */
export const LOGIN_MAX = 64;
/** Сколько символов логина учитывается при входе. */
export const LOGIN_LOOKUP_MAX = 200;
/** Роли сотрудников компании, которых создаёт владелец. */
export const STAFF_ASSIGNABLE_ROLES = ['sales', 'measurer', 'crew'];
/** Допустимый идентификатор комнаты, присланный клиентом при создании. */
export const OBJECT_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;
/** Предел размера расчёта или комнаты в объекте (символов JSON). */
export const OBJECT_PAYLOAD_MAX = 400_000;
/** Предельные длины полей проекта. */
export const PROJECT_LIMITS = Object.freeze({ name: 250 });
/** Предел одного объекта в хранилище материалов (5 ТБ) и число частей multipart. */
export const MATERIAL_DIRECT_MAX_BYTES = 5 * 1024 * 1024 * 1024 * 1024;
export const MATERIAL_MAX_PARTS = 10000;
/** Ключ загруженного материала. */
export const MATERIAL_KEY_PATTERN = /^materials\/mat_[a-z0-9_]+$/i;

const NOT_OBJECT = 'Некорректный запрос';

/** Пустое значение (undefined, null, 0, false, '') даёт '', остальное — строку. */
function textOf(value) {
  return value ? String(value) : '';
}

function has(object, key) {
  return Object.prototype.hasOwnProperty.call(object, key);
}

/**
 * @param {any} z библиотека zod (v4)
 */
export function createSchemas(z) {
  const issue = (ctx, message, status = 400) =>
    ctx.addIssue({ code: 'custom', message, params: { status } });

  /** Тело запроса: объект с любыми полями. Не-объект (null, число, массив) — 400. */
  const body = () =>
    z.custom((value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value), {
      message: NOT_OBJECT,
      params: { status: 400 },
    });

  /**
   * Общая часть создания пользователя: логин и пароль обрезаются по краям.
   * @param {{ checkLength: boolean }} options
   */
  const credentials = ({ checkLength }) =>
    body().transform((raw, ctx) => {
      const login = textOf(raw.login).trim();
      const password = textOf(raw.password).trim();
      if (!login || !password) {
        issue(ctx, 'Укажите логин и пароль');
        return z.NEVER;
      }
      if (checkLength && login.length > LOGIN_MAX) {
        issue(ctx, 'Логин слишком длинный');
        return z.NEVER;
      }
      return { ...raw, login, password };
    });

  /** POST /auth/login */
  const loginRequest = body().transform((raw) => ({
    ...raw,
    login: textOf(raw.login).trim().slice(0, LOGIN_LOOKUP_MAX),
    password: textOf(raw.password),
  }));

  /** POST /admin/partners: владелец новой компании. */
  const partnerCreate = credentials({ checkLength: true }).transform((value) => ({
    ...value,
    companyName: textOf(value.companyName).trim() || value.login,
  }));

  /** POST /admin/stp-managers. */
  const stpManagerCreate = credentials({ checkLength: false }).transform((value) => ({
    ...value,
    displayName: textOf(value.displayName || value.login).trim() || value.login,
  }));

  /** POST /org/staff: роль проверяется раньше логина и пароля. */
  const staffCreate = body().transform((raw, ctx) => {
    const requested = String(raw.role ?? '').trim();
    const role = !requested || requested === 'executor' ? 'measurer' : requested;
    if (!STAFF_ASSIGNABLE_ROLES.includes(role)) {
      issue(ctx, 'Роль: sales, measurer или crew');
      return z.NEVER;
    }
    const checked = credentials({ checkLength: true }).safeParse(raw);
    if (!checked.success) {
      const first = checked.error.issues[0];
      issue(ctx, first.message, first.params?.status);
      return z.NEVER;
    }
    const { login } = checked.data;
    return { ...checked.data, role, displayName: textOf(raw.displayName || login).trim() };
  });

  /** PATCH /org/staff/:id: имя обязательно. */
  const staffUpdate = body().transform((raw, ctx) => {
    if (!has(raw, 'displayName')) {
      issue(ctx, 'Укажите имя');
      return z.NEVER;
    }
    return raw;
  });

  /** PATCH /admin/partners/:id: город обязателен (значение проверяет справочник городов). */
  const partnerCityUpdate = body().transform((raw, ctx) => {
    if (!has(raw, 'city')) {
      issue(ctx, 'Укажите город');
      return z.NEVER;
    }
    return raw;
  });

  /**
   * POST и PATCH комнаты (/objects). Новый идентификатор проверяется только при создании.
   * @param {{ isNew: boolean }} options
   */
  const objectInput = ({ isNew }) =>
    body().transform((raw, ctx) => {
      if (isNew && raw.id != null && !OBJECT_ID_PATTERN.test(String(raw.id))) {
        issue(ctx, 'Некорректный идентификатор комнаты');
        return z.NEVER;
      }
      for (const field of ['room', 'estimate']) {
        if (raw[field] != null && JSON.stringify(raw[field]).length > OBJECT_PAYLOAD_MAX) {
          issue(ctx, 'Слишком большие данные расчёта', 413);
          return z.NEVER;
        }
      }
      return raw;
    });

  /**
   * POST и PATCH проекта (/projects): итоговое название (своё или сохранённое) не пустое.
   * @param {string | undefined} existingName название уже сохранённого проекта
   */
  const projectInput = (existingName) =>
    body().transform((raw, ctx) => {
      const name = String(raw.name !== undefined ? raw.name ?? '' : existingName ?? '')
        .trim()
        .slice(0, PROJECT_LIMITS.name);
      if (!name) {
        issue(ctx, 'Укажите название проекта');
        return z.NEVER;
      }
      return { ...raw, name };
    });

  /** POST /materials/files/multipart (начало): размер файла. */
  const materialMultipartStart = body().transform((raw, ctx) => {
    const size = Number(raw.size);
    if (!Number.isFinite(size) || size < 1) {
      issue(ctx, 'Файл пустой');
      return z.NEVER;
    }
    if (size > MATERIAL_DIRECT_MAX_BYTES) {
      issue(ctx, 'Файл больше 5 ТБ', 413);
      return z.NEVER;
    }
    return { ...raw, size };
  });

  /** POST /materials/files/multipart/{parts,complete,abort}: ключ и uploadId. */
  const materialMultipartRef = body().transform((raw, ctx) => {
    const storageKey = String(raw.storageKey || '');
    const uploadId = String(raw.uploadId || '');
    if (!MATERIAL_KEY_PATTERN.test(storageKey)) {
      issue(ctx, 'Некорректный ключ материала');
      return z.NEVER;
    }
    if (!uploadId || uploadId.length > 1024) {
      issue(ctx, 'Нет uploadId');
      return z.NEVER;
    }
    return { ...raw, storageKey, uploadId };
  });

  /** POST /materials/files/multipart/parts: номера частей (1…10000, не больше 100 за раз). */
  const materialMultipartParts = body().transform((raw, ctx) => {
    const numbers = [...new Set((Array.isArray(raw.partNumbers) ? raw.partNumbers : []).map(Number))];
    if (!numbers.length || numbers.length > 100) {
      issue(ctx, 'Нужно от 1 до 100 номеров частей');
      return z.NEVER;
    }
    if (numbers.some((n) => !Number.isInteger(n) || n < 1 || n > MATERIAL_MAX_PARTS)) {
      issue(ctx, 'Некорректный номер части');
      return z.NEVER;
    }
    return { ...raw, partNumbers: numbers };
  });

  return {
    loginRequest,
    partnerCreate,
    stpManagerCreate,
    staffCreate,
    staffUpdate,
    partnerCityUpdate,
    objectInput,
    projectInput,
    materialMultipartStart,
    materialMultipartRef,
    materialMultipartParts,
  };
}

/**
 * Разбор данных схемой: либо `{ ok: true, data }`, либо `{ ok: false, message, status }`
 * с первым замечанием.
 * @param {{ safeParse(value: unknown): any }} schema
 */
export function parseWith(schema, value) {
  const result = schema.safeParse(value);
  if (result.success) return { ok: true, data: result.data };
  const first = result.error.issues[0];
  return {
    ok: false,
    message: first?.message || NOT_OBJECT,
    status: Number(first?.params?.status) || 400,
  };
}
