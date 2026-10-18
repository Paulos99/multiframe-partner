/**
 * Каждому объекту без проекта — свой проект в его компании.
 * Пишет только POST /projects и PATCH объекта. Бакет не открывает.
 * Уже привязанные объекты и prj_f20um0dq5eqq не трогает. Повторный запуск безопасен.
 *
 * На боевой API не запускать, пока Павел не попросит и пока не задеплоен фикс кэша.
 *
 *   node apps/api/scripts/link-objects-to-projects.mjs --dry-run
 *
 * Env: API_BASE, MF_STAFF_LOGIN, MF_STAFF_PASSWORD.
 * Логин — владелец или менеджер одной компании. Чужие компании скрипт не видит и не меняет.
 */
import { readConfig, runFromConfig } from './link-objects-to-projects-lib.mjs';

const config = readConfig(process.env, process.argv.slice(2));

try {
  const { report } = await runFromConfig({ config, fetchImpl: globalThis.fetch });
  const safe = JSON.stringify(report);
  if (config.password && safe.includes(config.password)) {
    throw new Error('Сводка содержит секрет, печать остановлена');
  }
  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) process.exitCode = 1;
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Ошибка');
  process.exitCode = 1;
}
