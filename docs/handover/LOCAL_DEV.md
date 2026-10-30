# Запуск для разработки

Нужны Node.js 22 и npm. Для проверки сборок — Docker (необязательно).

## Только интерфейс (без сервера)

```bash
cd apps/web
npm ci
npm run dev            # http://localhost:5173
```

Без `VITE_API_URL` кабинет работает в локальном режиме: данные в `localStorage` браузера, демо-пользователи
встроены. Реальных данных здесь нет.

## Интерфейс + свой API

Терминал 1 — API (демо-данные и локальный файл вместо бакета):

```bash
cd apps/api
npm ci
export JWT_SECRET=$(openssl rand -hex 32)
export ANALYTICS_ADMIN_KEY=$(openssl rand -hex 32)
export CORS_ORIGIN=http://localhost:5173
export DEMO_SEED=1                     # демо-кабинеты с известными паролями — только для разработки
export PLATFORM_FILE=/tmp/platform-dev.json
PORT=8080 node server.mjs
```

Терминал 2 — интерфейс:

```bash
cd apps/web
VITE_API_URL=http://localhost:8080 npm run dev
```

Вход: учётные записи демо описаны в корневом `README.md` (только для разработки!).

Чистый запуск как на боевом сервере (без демо, с созданием администратора):

```bash
export DEMO_SEED=0 NODE_ENV=production
export ADMIN_BOOTSTRAP_LOGIN=admin ADMIN_BOOTSTRAP_PASSWORD='длинный-пароль-12+'
export PLATFORM_FILE=/tmp/platform-prod-like.json
node server.mjs
```

## Проверки

Из корня репозитория (Node.js 22): `npm run install:all`, затем `npm run check`: границы архитектуры, lint, typecheck и тесты API и интерфейса. Правила для агентов — [AGENTS.md](../../AGENTS.md).

По частям:

```bash
cd apps/api && npm run lint && npm test          # 190+ проверок, хранилище подменяется в памяти
cd apps/web && npm run lint && npm run typecheck && npm run test:unit
cd apps/web && npx playwright install chromium && npm run test:e2e   # сквозные проверки, нужен локальный запуск API (см. apps/web/e2e/api-server.mjs)
```

Хранилище в тестах подменяется функцией `setObjectStoreTransport` (`apps/api/objectStore.js`) — настоящий бакет не нужен.

## Сборка под /cabinet вручную

```bash
cd apps/web
VITE_BASE=/cabinet VITE_API_URL=/cabinet-api VITE_DISABLE_DEMO=1 BUILD_ID=v1.0.0 npm run build
# итог — apps/web/dist; в нём version.json {"id":"v1.0.0"}, manifest со scope /cabinet/
```
