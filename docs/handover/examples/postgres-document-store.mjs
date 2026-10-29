// ПРИМЕР адаптера: документы платформы в PostgreSQL. Подключается без правки кода сервиса:
//   DOCUMENT_STORE_MODULE=/etc/multiframe/postgres-document-store.mjs   (файл лежит у вас, не в репозитории)
//   DATABASE_URL=postgres://...                                           (имя переменной выбираете вы)
//   в образе api нужен пакет pg: смонтируйте node_modules или соберите свой образ на основе нашего.
// Таблица (создаётся при первом запуске):
//   CREATE TABLE IF NOT EXISTS mf_documents (
//     key text PRIMARY KEY, body text NOT NULL, etag text NOT NULL, updated_at timestamptz NOT NULL DEFAULT now());
// Фото, PDF и материалы остаются в S3: адаптер берёт только два ключа.
// Проверьте на своей базе до боевого запуска: пример проверен только на уровне контракта (apps/api/documentStore.test.js).
import { createHash } from 'node:crypto';
import pg from 'pg';

const KEYS = new Set(['platform-v2.json', 'analytics-events.json']);
const etagOf = (body) => `"${createHash('md5').update(body).digest('hex')}"`;
const conflict = () => Object.assign(new Error('Precondition Failed'), { name: 'PreconditionFailed', status: 412 });

export default {
  async create() {
    const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 5 });
    await pool.query(`CREATE TABLE IF NOT EXISTS mf_documents (
      key text PRIMARY KEY, body text NOT NULL, etag text NOT NULL, updated_at timestamptz NOT NULL DEFAULT now())`);
    return {
      handles: (key) => KEYS.has(key),

      async head({ key }) {
        const { rows } = await pool.query('SELECT etag FROM mf_documents WHERE key = $1', [key]);
        return rows.length ? { missing: false, etag: rows[0].etag } : { missing: true };
      },

      async read({ key }) {
        const { rows } = await pool.query('SELECT body, etag FROM mf_documents WHERE key = $1', [key]);
        return rows.length ? { missing: false, body: rows[0].body, etag: rows[0].etag } : { missing: true };
      },

      // Условная запись: сервис всегда передаёт либо ifMatch (обновление), либо ifNoneMatch '*' (создание).
      async put({ key, body, ifMatch, ifNoneMatch }) {
        const etag = etagOf(body);
        if (ifNoneMatch === '*') {
          const res = await pool.query(
            'INSERT INTO mf_documents (key, body, etag) VALUES ($1, $2, $3) ON CONFLICT (key) DO NOTHING',
            [key, body, etag],
          );
          if (res.rowCount === 0) throw conflict();
          return { etag };
        }
        if (ifMatch) {
          const res = await pool.query(
            'UPDATE mf_documents SET body = $2, etag = $3, updated_at = now() WHERE key = $1 AND etag = $4',
            [key, body, etag, ifMatch],
          );
          if (res.rowCount === 0) throw conflict();
          return { etag };
        }
        await pool.query(
          `INSERT INTO mf_documents (key, body, etag) VALUES ($1, $2, $3)
           ON CONFLICT (key) DO UPDATE SET body = EXCLUDED.body, etag = EXCLUDED.etag, updated_at = now()`,
          [key, body, etag],
        );
        return { etag };
      },
    };
  },
};
