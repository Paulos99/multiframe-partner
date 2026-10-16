# MultiFrame · Кабинет партнёра

Сервис для коммерческих партнёров (натяжные потолки): **логин → кабинет по роли → проблемомер + калькулятор + объекты**.

Публичные проблемомер и калькулятор MF_StP не меняются.

## Роли и демо-компании

Две демо-компании: **Потолки Столицы** (Москва) и **Северный Потолок** (СПб).

| Роль | Логин | Пароль | Компания |
|------|-------|--------|----------|
| Админ StP | `admin` | `admin1234` | — |
| Владелец | `partner1` / `partner2` | `demo1234` | Москва / СПб |
| Менеджер | `sales1` / `sales2` | `exec1234` | Москва / СПб |
| Замерщик | `exec1` / `exec2` | `exec1234` | Москва / СПб |
| Бригада | `crew1` / `crew2` | `exec1234` | Москва / СПб |

При `VITE_DEMO_MODE=true` (или `?demo=1`) на входе и в кабинете — переключатель ролей одним кликом.

Сброс серверных данных к демо-seed: `node apps/api/scripts/reset-and-seed-demo.mjs` (нужен задеплоенный `POST /admin/demo/reset`).

Презентация для руководства: [docs/leadership-demo/](docs/leadership-demo/).

В кабинете — вкладка **Обучение** (у замерщика и бригады — кнопка в шапке): личная инструкция только для своей роли.

## Уже задеплоено (Yandex Cloud)

- API Gateway: `https://d5dff69141o8r1ehqm09.l5v6loqa.apigw.yandexcloud.net`
- Cloud Function: `multiframe-partner-api` (`d4et50596cl0hu9o3d7k`)

Локальный фронт подхватывает URL из `apps/web/.env`:

```
VITE_API_URL=https://d5dff69141o8r1ehqm09.l5v6loqa.apigw.yandexcloud.net
```

Без `VITE_API_URL` кабинет работает в локальном режиме (`localStorage`), с теми же ролями и объектами.

## Структура

- `apps/web` — React: логин, кабинеты по ролям, проблемомер, iframe-калькулятор, карточка объекта
- `apps/api` — HTTP API: auth (JWT + bcrypt), org, staff, objects, analytics
- `packages/shared` — роли, права, OrgSettings, JobObject, агрегатор аналитики
- `infra/deploy_yc.py` — деплой Function + Gateway

## Локально

```bash
cd apps/web
npm install
npm run dev
```

## API (v2)

- `POST /auth/login` → `{ token, user }`
- `GET /auth/me`
- `PATCH /org/settings`
- `GET|POST /admin/partners`, `DELETE /admin/partners/:id`
- `GET|POST /org/staff`, `DELETE /org/staff/:id`
- `GET|POST /objects`, `PATCH /objects/:id`
- Analytics: `/analytics/events`, `/analytics/dashboard`

Пароли на сервере — bcrypt. Сессия — JWT 12ч. Для бригады API отдаёт прайс и суммы КП без денег.

## Профиль партнёра

Поля кабинета (включая город) применяются в калькуляторе, смете, PDF и аналитике сети.

Данные платформы в Object Storage: ключ `platform-v2.json` (или `PLATFORM_KEY`). Старый `partners.json` мигрирует при первом чтении.

## Передеплой API

```bash
cd apps/api && npm install
py -3 infra/deploy_yc.py
```

Ключ SA: `%USERPROFILE%\.yc\agent-project-creator-key.json`
