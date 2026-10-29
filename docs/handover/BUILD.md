# Сборка под адрес /cabinet

Обычно собирать вручную не нужно: `./deploy/release.sh vX.Y.Z` собирает образы сам ([DEPLOY.md](DEPLOY.md)).
Этот документ — для тех, кто собирает статику своими средствами.

## Требования

Node.js 22, npm. Исходники — метка выпуска из `https://github.com/Paulos99/multiframe-partner` (не ветка).

## Статика интерфейса

```bash
git clone --branch vX.Y.Z --depth 1 https://github.com/Paulos99/multiframe-partner.git
cd multiframe-partner/apps/web
npm ci
VITE_BASE=/cabinet VITE_API_URL=/cabinet-api VITE_DISABLE_DEMO=1 BUILD_ID=vX.Y.Z npm run build
```

Результат — каталог `apps/web/dist`. Его содержимое отдаётся по адресу `/cabinet/`.

| Переменная сборки | Значение для боевого |
|---|---|
| `VITE_BASE` | `/cabinet` |
| `VITE_API_URL` | `/cabinet-api` (тот же домен) |
| `VITE_DISABLE_DEMO` | `1` |
| `BUILD_ID` | имя метки, например `v1.0.0`: по нему страница обновляется сама |

Остальные переменные — в [ENV.md](ENV.md). Всё, что начинается с `VITE_`, попадает в код и видно любому посетителю: секретов там быть не должно.

## Проверка сборки

- `dist/version.json` содержит номер метки.
- Страница `https://stp-multiframe.ru/cabinet/` открывается, адреса файлов начинаются с `/cabinet/`.
- Обновление страницы (F5) в любом разделе не даёт «404»: работает `404.html` и правило nginx для `/cabinet/`.
- `https://stp-multiframe.ru/cabinet/?demo=1` не показывает выбор ролей.

## API

Образ собирается из `deploy/Dockerfile.api`; запуск без Docker: `cd apps/api && npm ci && node server.mjs` (переменные — в [ENV.md](ENV.md)).
