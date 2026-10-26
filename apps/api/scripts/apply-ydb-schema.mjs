/**
 * Применение схемы commercial_records.
 * Без --apply к YDB не подключается и не печатает адрес базы.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const apply = process.argv.includes('--apply');
if (!apply) {
  console.log('Схема не применялась. Для записи в YDB нужен флаг --apply и переменные окружения.');
  process.exit(0);
}

const endpoint = process.env.YDB_ENDPOINT;
const database = process.env.YDB_DATABASE;
if (!endpoint || !database) {
  console.error('Нужны YDB_ENDPOINT и YDB_DATABASE. Значения не печатаются.');
  process.exit(2);
}

const file = join(dirname(fileURLToPath(import.meta.url)), '../../../infra/ydb/001_commercial_schema.yql');
const text = readFileSync(file, 'utf8');
const statements = text
  .split('\n')
  .filter((line) => !line.trim().startsWith('--'))
  .join('\n')
  .split(';')
  .map((part) => part.trim())
  .filter(Boolean);

const sdk = await import('ydb-sdk');
const driver = new sdk.Driver({
  connectionString: endpoint.replace(/\/$/, '') + (database.startsWith('/') ? database : `/${database}`),
  authService: process.env.YDB_ACCESS_TOKEN_CREDENTIALS
    ? new sdk.TokenAuthService(process.env.YDB_ACCESS_TOKEN_CREDENTIALS)
    : new sdk.MetadataAuthService(),
  logger: { fatal() {}, error() {}, warn() {}, info() {}, debug() {}, trace() {} },
});
const ready = await driver.ready(10000);
if (!ready) {
  console.error('YDB не отвечает');
  process.exit(1);
}
try {
  await driver.queryClient.do({
    fn: async (session) => {
      for (const statement of statements) {
        await session.execute({ text: statement });
      }
    },
  });
} finally {
  await driver.destroy();
}
console.log(`Схема записана, операторов: ${statements.length}. Адрес базы не печатается.`);
