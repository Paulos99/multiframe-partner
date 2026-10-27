/**
 * Поднимает демо-показатели «Потолков Столицы» до round(Северный Потолок × 1.3).
 * Только добавление: чужие компании, объекты и уже существующие записи не меняются.
 */

export const BOOST_RATIO = 1.3;
export const CAPITAL_COMPANY = 'Потолки Столицы';
export const NORTH_COMPANY = 'Северный Потолок';
export const BOOST_EVENT_PREFIX = 'ev_boost_capital_';

const STAFF_ROLES = new Set(['sales', 'measurer', 'crew']);

export const METRIC_LABELS = [
  ['employees', 'Сотрудники'],
  ['logins', 'Входы'],
  ['problemomerOpens', 'Открытия проблемомера'],
  ['problemomerResults', 'Проблемомер'],
  ['problemomerPdf', 'PDF проблемомера'],
  ['calculatorOpens', 'Открытия калькулятора'],
  ['calculatorDone', 'Калькулятор'],
  ['calculatorPdf', 'PDF калькулятора'],
  ['pdf', 'PDF'],
  ['shares', 'Отправки'],
  ['areaM2', 'Площадь, м²'],
  ['panels', 'Панели'],
];

const EVENT_SPECS = [
  { key: 'login', tool: 'cabinet', action: 'login', withObject: false, metric: 'logins' },
  { key: 'pm_open', tool: 'problemomer', action: 'open', withObject: false, metric: 'problemomerOpens' },
  { key: 'pm_result', tool: 'problemomer', action: 'result', withObject: true, metric: 'problemomerResults' },
  { key: 'pm_pdf', tool: 'problemomer', action: 'pdf', withObject: true, metric: 'problemomerPdf' },
  { key: 'share', tool: 'problemomer', action: 'share', withObject: true, metric: 'shares' },
  { key: 'calc_open', tool: 'calculator', action: 'open', withObject: false, metric: 'calculatorOpens' },
  { key: 'calc_done', tool: 'calculator', action: 'calc_done', withObject: true, metric: 'calculatorDone' },
  { key: 'calc_pdf', tool: 'calculator', action: 'pdf', withObject: true, metric: 'calculatorPdf' },
];

export function normalizeCompanyName(value) {
  return String(value || '')
    .trim()
    .toLocaleLowerCase('ru-RU')
    .replace(/ё/g, 'е');
}

export function normalizeRole(role) {
  if (role === 'partner') return 'owner';
  if (role === 'executor' || role === 'exec') return 'measurer';
  if (role === 'manager') return 'sales';
  if (role === 'installer' || role === 'install') return 'crew';
  if (
    role === 'admin' ||
    role === 'owner' ||
    role === 'sales' ||
    role === 'measurer' ||
    role === 'crew'
  ) {
    return role;
  }
  return 'measurer';
}

export function findCompanyOrg(platform, companyName) {
  const want = normalizeCompanyName(companyName);
  return (
    (platform?.orgs || []).find(
      (org) => normalizeCompanyName(org?.settings?.companyName) === want,
    ) || null
  );
}

export function eventBelongs(event, org, companyName) {
  const want = normalizeCompanyName(companyName);
  if (event?.companyName && normalizeCompanyName(event.companyName) === want) return true;
  if (org && event?.orgId === org.id) {
    const named = normalizeCompanyName(event?.companyName);
    return !named || named === want;
  }
  return false;
}

function isStaff(user) {
  return STAFF_ROLES.has(normalizeRole(user?.role));
}

function isCompleted(event) {
  return event?.action === 'result' || event?.action === 'calc_done';
}

function matchSpec(event, spec) {
  if (spec.action === 'login') return event?.action === 'login';
  if (spec.action === 'share') return event?.action === 'share';
  return event?.tool === spec.tool && event?.action === spec.action;
}

function rawSum(events, field) {
  let sum = 0;
  for (const event of events) {
    if (!isCompleted(event)) continue;
    const value = Number(event.object?.[field]);
    if (Number.isFinite(value)) sum += value;
  }
  return sum;
}

export function companyMetrics(platform, events, companyName) {
  const org = findCompanyOrg(platform, companyName);
  const rows = (events || []).filter((event) => eventBelongs(event, org, companyName));
  const employees = org
    ? (platform?.users || []).filter((user) => user.orgId === org.id && isStaff(user)).length
    : 0;
  const count = (spec) => rows.filter((event) => matchSpec(event, spec)).length;
  const byKey = Object.fromEntries(EVENT_SPECS.map((spec) => [spec.key, count(spec)]));
  return {
    employees,
    logins: byKey.login,
    problemomerOpens: byKey.pm_open,
    problemomerResults: byKey.pm_result,
    problemomerPdf: byKey.pm_pdf,
    calculatorOpens: byKey.calc_open,
    calculatorDone: byKey.calc_done,
    calculatorPdf: byKey.calc_pdf,
    pdf: rows.filter((event) => event.action === 'pdf').length,
    shares: byKey.share,
    areaM2: Math.round(rawSum(rows, 'areaM2')),
    panels: Math.round(rawSum(rows, 'panels')),
  };
}

export function boostSummary(beforePlatform, beforeEvents, afterPlatform, afterEvents) {
  const north = companyMetrics(beforePlatform, beforeEvents, NORTH_COMPANY);
  const before = companyMetrics(beforePlatform, beforeEvents, CAPITAL_COMPANY);
  const after = companyMetrics(afterPlatform, afterEvents, CAPITAL_COMPANY);
  return METRIC_LABELS.map(([key, label]) => ({
    key,
    label,
    north: north[key],
    before: before[key],
    target: Math.round(Number(north[key]) * BOOST_RATIO),
    after: after[key],
    added: after[key] - before[key],
  }));
}

function sameJson(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function assertBoostIsAdditive(beforePlatform, beforeEvents, afterPlatform, afterEvents) {
  const errors = [];
  if (!sameJson(beforePlatform?.objects || [], afterPlatform?.objects || [])) {
    errors.push('изменились объекты');
  }
  if (!sameJson(beforePlatform?.orgs || [], afterPlatform?.orgs || [])) {
    errors.push('изменились компании');
  }
  if (!sameJson(beforePlatform?.activity || [], afterPlatform?.activity || [])) {
    errors.push('изменилась лента активности');
  }
  for (const user of beforePlatform?.users || []) {
    const found = (afterPlatform?.users || []).find((item) => item.id === user.id);
    if (!found || !sameJson(found, user)) errors.push(`изменён пользователь ${user.login || user.id}`);
  }
  const capital = findCompanyOrg(beforePlatform, CAPITAL_COMPANY);
  for (const user of afterPlatform?.users || []) {
    if ((beforePlatform?.users || []).some((item) => item.id === user.id)) continue;
    if (user.demo !== true || user.loginDisabled !== true) {
      errors.push('новый пользователь не помечен как демо без входа');
    }
    if (Object.prototype.hasOwnProperty.call(user, 'password')) {
      errors.push('у нового пользователя есть поле пароля');
    }
    if (!capital || user.orgId !== capital.id) {
      errors.push('новый пользователь не в компании Потолки Столицы');
    }
  }
  for (const event of beforeEvents || []) {
    const found = (afterEvents || []).find((item) => item.id === event.id);
    if (!found || !sameJson(found, event)) errors.push(`изменено событие ${event.id}`);
  }
  const northOrg = findCompanyOrg(beforePlatform, NORTH_COMPANY);
  const northBefore = (beforeEvents || []).filter((event) =>
    eventBelongs(event, northOrg, NORTH_COMPANY),
  );
  const northAfter = (afterEvents || []).filter((event) =>
    eventBelongs(event, northOrg, NORTH_COMPANY),
  );
  if (!sameJson(northBefore, northAfter)) errors.push('изменились события Северного Потолка');
  if (errors.length) {
    throw new Error(`Повышение демо-аналитики небезопасно: ${errors.join('; ')}`);
  }
}

function roleLabel(role) {
  if (role === 'sales') return 'Демо-менеджер';
  if (role === 'measurer') return 'Демо-замерщик';
  return 'Демо-монтажник';
}

function nextDemoIndex(users) {
  const ids = new Set((users || []).map((user) => user.id));
  const logins = new Set((users || []).map((user) => user.login));
  let index = 1;
  while (ids.has(`u_demo_capital_boost_${index}`) || logins.has(`demo-capital-${index}`)) {
    index += 1;
  }
  return index;
}

export function boostCapitalStaff(platform) {
  if (!platform?.users || !platform?.orgs) return platform;
  const capital = findCompanyOrg(platform, CAPITAL_COMPANY);
  const north = findCompanyOrg(platform, NORTH_COMPANY);
  if (!capital || !north) return platform;
  const northStaff = platform.users.filter((user) => user.orgId === north.id && isStaff(user)).length;
  const capitalStaff = platform.users.filter((user) => user.orgId === capital.id && isStaff(user)).length;
  const deficit = Math.max(0, Math.round(northStaff * BOOST_RATIO) - capitalStaff);
  if (!deficit) return platform;
  const roles = ['crew', 'measurer', 'sales'];
  const added = [];
  const users = platform.users.slice();
  for (let offset = 0; offset < deficit; offset += 1) {
    const index = nextDemoIndex(users);
    const role = roles[(index - 1) % roles.length];
    const user = {
      id: `u_demo_capital_boost_${index}`,
      login: `demo-capital-${index}`,
      role,
      displayName: `${roleLabel(role)} · ${capital.settings?.companyName || CAPITAL_COMPANY}`,
      orgId: capital.id,
      createdAt: new Date().toISOString(),
      demo: true,
      loginDisabled: true,
    };
    users.push(user);
    added.push(user);
  }
  return { ...platform, users };
}

/** Равномерно по всему месяцу, а не пачкой в последние дни. */
function sampleEvenly(templates, count) {
  if (!count || !templates.length) return [];
  const sorted = templates.slice().sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  const picked = [];
  for (let index = 0; index < count; index += 1) {
    const at = Math.min(sorted.length - 1, Math.floor((index * sorted.length) / count));
    picked.push(sorted[at]);
  }
  return picked;
}

function shiftMinutes(iso, minutes) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  date.setMinutes(date.getMinutes() + minutes);
  return date.toISOString();
}

function syntheticTemplate(sample, spec) {
  const base = sample || {
    at: new Date().toISOString(),
    orgId: 'org_demo',
    userId: 'u_sales1',
    login: 'sales1',
    role: 'sales',
    companyName: CAPITAL_COMPANY,
    city: 'Москва',
  };
  return {
    at: base.at,
    orgId: base.orgId,
    userId: base.userId,
    login: base.login,
    role: base.role,
    companyName: base.companyName || CAPITAL_COMPANY,
    city: base.city || 'Москва',
    tool: spec.tool,
    action: spec.action,
    object: spec.withObject
      ? {
          areaM2: 18,
          panels: 44,
          city: base.city || 'Москва',
          roomType: 'living',
          houseType: 'panel',
          objectStage: 'renovation',
          classBefore: 'V',
          classAfter: 'B',
          mode: 'area',
        }
      : null,
  };
}

function nextEventIndex(used, key) {
  let index = 0;
  while (used.has(`${BOOST_EVENT_PREFIX}${key}_${index}`)) index += 1;
  return index;
}

function cloneEvents(templates, count, spec, used, anchor) {
  const source = templates.length ? templates : [syntheticTemplate(anchor, spec)];
  const picked = sampleEvenly(source, count);
  let index = nextEventIndex(used, spec.key);
  return picked.map((template, offset) => {
    const id = `${BOOST_EVENT_PREFIX}${spec.key}_${index}`;
    index += 1;
    used.add(id);
    const object = template.object ? { ...template.object } : template.object ?? null;
    return {
      ...template,
      id,
      at: shiftMinutes(template.at, (offset % 17) + 1),
      orgId: anchor?.orgId || template.orgId,
      companyName: anchor?.companyName || template.companyName || CAPITAL_COMPANY,
      city: anchor?.city || template.city,
      tool: spec.tool,
      action: spec.action,
      object,
    };
  });
}

function assignExact(hosts, field, deficit, integer) {
  if (!hosts.length) return;
  if (!(deficit > 0)) {
    for (const event of hosts) {
      event.object = { ...(event.object || {}), [field]: 0 };
    }
    return;
  }
  if (integer) {
    const whole = Math.floor(deficit);
    const base = Math.floor(whole / hosts.length);
    let remainder = whole - base * hosts.length;
    for (const event of hosts) {
      const extra = remainder > 0 ? 1 : 0;
      if (remainder > 0) remainder -= 1;
      event.object = { ...(event.object || {}), [field]: base + extra };
    }
  } else {
    const base = Math.round((deficit / hosts.length) * 10) / 10;
    let used = 0;
    hosts.forEach((event, index) => {
      const value = index === hosts.length - 1 ? deficit - used : base;
      event.object = { ...(event.object || {}), [field]: value };
      used += value;
    });
  }
  const last = hosts[hosts.length - 1];
  const sum = hosts.reduce((total, event) => total + Number(event.object?.[field] || 0), 0);
  last.object[field] = Number(last.object[field] || 0) + (deficit - sum);
}

function tuneVolumes(added, capitalEvents, northEvents) {
  const hosts = added.filter((event) => isCompleted(event));
  if (!hosts.length) return;
  const areaTarget = Math.round(Math.round(rawSum(northEvents, 'areaM2')) * BOOST_RATIO);
  const panelTarget = Math.round(Math.round(rawSum(northEvents, 'panels')) * BOOST_RATIO);
  assignExact(hosts, 'areaM2', areaTarget - rawSum(capitalEvents, 'areaM2'), false);
  assignExact(hosts, 'panels', panelTarget - rawSum(capitalEvents, 'panels'), true);
}

function assignDemoLogins(added, demoUsers) {
  const logins = added.filter((event) => event.action === 'login');
  if (!logins.length || !demoUsers?.length) return;
  const share = Math.max(1, Math.floor(logins.length / (demoUsers.length + 1)));
  let cursor = 0;
  for (const user of demoUsers) {
    for (let taken = 0; taken < share && cursor < logins.length; taken += 1, cursor += 1) {
      logins[cursor].userId = user.id;
      logins[cursor].login = user.login;
      logins[cursor].role = user.role;
    }
  }
}

function planAdditions(northEvents, capitalEvents) {
  const plan = {};
  for (const spec of EVENT_SPECS) {
    const north = northEvents.filter((event) => matchSpec(event, spec)).length;
    const capital = capitalEvents.filter((event) => matchSpec(event, spec)).length;
    plan[spec.key] = Math.max(0, Math.round(north * BOOST_RATIO) - capital);
  }
  const northPdf = northEvents.filter((event) => event.action === 'pdf').length;
  const capitalPdf = capitalEvents.filter((event) => event.action === 'pdf').length;
  const pdfTarget = Math.round(northPdf * BOOST_RATIO);
  let drift = capitalPdf + plan.pm_pdf + plan.calc_pdf - pdfTarget;
  if (drift > 0) {
    const cut = Math.min(plan.pm_pdf, drift);
    plan.pm_pdf -= cut;
    drift -= cut;
    plan.calc_pdf = Math.max(0, plan.calc_pdf - drift);
  } else if (drift < 0) {
    plan.pm_pdf += -drift;
  }
  return plan;
}

export function boostCapitalEvents(events, addedUsers = [], platform = null) {
  const list = Array.isArray(events) ? events : [];
  const capitalOrg = platform ? findCompanyOrg(platform, CAPITAL_COMPANY) : null;
  const northOrg = platform ? findCompanyOrg(platform, NORTH_COMPANY) : null;
  const capital = list.filter((event) => eventBelongs(event, capitalOrg, CAPITAL_COMPANY));
  const north = list.filter((event) => eventBelongs(event, northOrg, NORTH_COMPANY));
  if (!capital.length || !north.length) return list;
  const plan = planAdditions(north, capital);
  const anchor = capital.find((event) => event.companyName) || capital[0];
  const originals = capital.filter((event) => !String(event.id || '').startsWith(BOOST_EVENT_PREFIX));
  const used = new Set(list.map((event) => event.id));
  const added = [];
  for (const spec of EVENT_SPECS) {
    const count = plan[spec.key] || 0;
    if (!count) continue;
    const templates = (originals.length ? originals : capital).filter((event) => matchSpec(event, spec));
    added.push(...cloneEvents(templates, count, spec, used, anchor));
  }
  if (!added.length) return list;
  tuneVolumes(added, capital, north);
  assignDemoLogins(added, addedUsers);
  return added.concat(list).sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
}

export function applyCapitalDemoBoost(platform, events) {
  const nextPlatform = boostCapitalStaff(platform);
  const known = new Set((platform?.users || []).map((user) => user.id));
  const addedUsers = (nextPlatform?.users || []).filter((user) => !known.has(user.id));
  const nextEvents = boostCapitalEvents(events, addedUsers, nextPlatform);
  const knownEvents = new Set((events || []).map((event) => event.id));
  const addedEvents = nextEvents.filter((event) => !knownEvents.has(event.id));
  return { platform: nextPlatform, events: nextEvents, addedUsers, addedEvents };
}
