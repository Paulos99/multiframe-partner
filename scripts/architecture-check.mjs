#!/usr/bin/env node
/**
 * Проверка границ между частями репозитория (`npm run architecture:check`).
 *
 * Правила:
 * - интерфейс (apps/web) не импортирует apps/api;
 * - API (apps/api) не импортирует apps/web;
 * - общий код (packages/shared) не импортирует ни одно приложение.
 * Общее для API и интерфейса живёт в packages/shared.
 *
 * Не проверяются: node_modules, сборка (dist), отчёты тестов, public и e2e-стенд интерфейса
 * (apps/web/e2e): он намеренно запускает настоящий API для браузерных тестов.
 */
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SOURCE_EXTENSION = /\.(?:[cm]?[jt]sx?)$/;
const SKIPPED_DIRECTORIES = new Set(['node_modules', 'dist', 'test-results', 'playwright-report', 'public', '.git']);

/** Правила: откуда (каталог) → какие каталоги импортировать нельзя. */
export const RULES = [
  { from: 'apps/web', forbids: ['apps/api'], skip: ['apps/web/e2e'] },
  { from: 'apps/api', forbids: ['apps/web'], skip: [] },
  { from: 'packages/shared', forbids: ['apps/api', 'apps/web'], skip: [] },
];

const IMPORT_PATTERNS = [
  /\bfrom\s+['"]([^'"]+)['"]/g,
  /\bimport\s*\(\s*['"]([^'"]+)['"]/g,
  /(?:^|[^\w$.])import\s+['"]([^'"]+)['"]/g,
  /\brequire\s*\(\s*['"]([^'"]+)['"]/g,
];

/** Спецификаторы импорта из текста файла. Строки комментариев пропускаются. */
export function importSpecifiers(source) {
  const found = [];
  for (const line of source.split('\n')) {
    const trimmed = line.trimStart();
    if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) continue;
    for (const pattern of IMPORT_PATTERNS) {
      for (const match of line.matchAll(pattern)) found.push(match[1]);
    }
  }
  return found;
}

function isInside(file, directory) {
  return file === directory || file.startsWith(`${directory}/`);
}

/**
 * @param {{ path: string, source: string }[]} files пути от корня репозитория, с «/»
 * @returns {string[]} описания нарушений
 */
export function checkBoundaries(files) {
  const violations = [];
  for (const file of files) {
    const rule = RULES.find((item) => isInside(file.path, item.from));
    if (!rule || rule.skip.some((dir) => isInside(file.path, dir))) continue;
    const folder = path.posix.dirname(file.path);
    for (const specifier of importSpecifiers(file.source)) {
      const target = specifier.startsWith('.')
        ? path.posix.normalize(path.posix.join(folder, specifier))
        : specifier.replace(/^\/+/, '');
      const hit = rule.forbids.find((dir) => isInside(target, dir) || target.includes(`/${dir}/`));
      if (hit) violations.push(`${file.path}: «${specifier}» ведёт в ${hit}, а из ${rule.from} это запрещено`);
    }
  }
  return violations;
}

function collect(root, relative, out) {
  for (const entry of readdirSync(path.join(root, relative), { withFileTypes: true })) {
    if (SKIPPED_DIRECTORIES.has(entry.name)) continue;
    const next = path.posix.join(relative, entry.name);
    if (entry.isDirectory()) collect(root, next, out);
    else if (SOURCE_EXTENSION.test(entry.name)) {
      out.push({ path: next, source: readFileSync(path.join(root, next), 'utf8') });
    }
  }
}

export function collectSources(root) {
  const files = [];
  for (const rule of RULES) collect(root, rule.from, files);
  return files;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const violations = checkBoundaries(collectSources(root));
  if (violations.length) {
    console.error('Нарушены границы между частями репозитория:');
    for (const violation of violations) console.error(`  ${violation}`);
    process.exit(1);
  }
  console.log('Границы между apps/web, apps/api и packages/shared соблюдены.');
}
