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
| Монтажник | `crew1` / `crew2` | `exec1234` | Москва / СПб |

При `VITE_DEMO_MODE=true` (или `?demo=1`) на входе и в кабинете — переключатель ролей одним кликом.

Сброс серверных данных к демо-seed: `node apps/api/scripts/reset-and-seed-demo.mjs` (нужен задеплоенный `POST /admin/demo/reset`).

Презентация для руководства: [docs/leadership-demo/](docs/leadership-demo/).

В кабинете — вкладка **Обучение** (у замерщика и монтажника — кнопка в шапке). Внутри две подвкладки: методические материалы STP MultiFrame (папки и файлы, правка только у админа) и личная инструкция по работе с кабинетом.

Город партнёра выбирается из справочника городов РФ (`apps/api/data/ru-cities.tsv`, источник — статья Википедии «Список городов России», лицензия CC BY-SA 4.0). Произвольный текст не сохраняется. Уже записанный город не из справочника остаётся на карточке и подсвечивается админу.

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
- `GET|POST /objects`, `PATCH /objects/:id`, `POST /objects/:id/documents`, `GET /objects/:id/documents/:docId`
- Analytics: `/analytics/events`, `/analytics/dashboard`
- Материалы: `GET /materials` (все роли), папки и файлы — только `admin`. Байты файла: Object Storage, ключ `materials/{id}`. Метаданные: поле `materials` в `platform-v2.json`. Пока админ ничего не менял, API отдаёт демо-набор и не записывает его в бакет. Загрузка через API — до 2 МБ (тело запроса шлюза около 3,5 МБ).

Новые маршруты шлюза (`/objects/{objectId}/documents`, `/objects/{objectId}/documents/{docId}`, `/materials`, `/materials/folders`, `/materials/files`, `/materials/{materialId}`, `/materials/{materialId}/content`) попадают в API Gateway при следующем `infra/deploy_yc.py`. Отдельных секретов не нужно: используются уже заданные `PARTNERS_BUCKET`, `YC_ACCESS_KEY_ID`, `YC_SECRET_ACCESS_KEY`. Файлы крупнее 2 МБ потребуют отдельной настройки CORS бакета и прямой загрузки по presigned URL — в этом изменении её нет.

Пароли на сервере — bcrypt. Сессия — JWT 12ч. Для монтажника API отдаёт прайс и суммы КП без денег. PDF в объект прикладывается после расчёта «по размерам» или «начертить схему»: это тот же файл, что собирает калькулятор, со схемой раскладки. Расчёт «по площади» объект не создаёт. Имя файла — «Клиент — спецификация — ГГГГ-ММ-ДД.pdf». У монтажника та же схема без цен.

## Профиль партнёра

Поля кабинета (включая город) применяются в калькуляторе, смете, PDF и аналитике сети.

Данные платформы в Object Storage: ключ `platform-v2.json` (или `PLATFORM_KEY`). Старый `partners.json` мигрирует при первом чтении.

## Передеплой API

```bash
cd apps/api && npm install
py -3 infra/deploy_yc.py
```

Ключ SA: `%USERPROFILE%\.yc\agent-project-creator-key.json`
