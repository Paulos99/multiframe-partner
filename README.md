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
- Материалы: `GET /materials` (все роли кабинета), папки и файлы — только `admin`. Метаданные: поле `materials` в `platform-v2.json`. Пока админ ничего не менял, API отдаёт демо-набор и не записывает его в бакет. `GET /materials/{id}/content` для файла в бакете возвращает `{ name, mime, url }` — подписанная ссылка на 15 минут. Ответ с `base64` остаётся для встроенного `contentBase64`, поле `stub` — для заглушек. Загрузка через кабинет — до 2 МБ.

Новые маршруты шлюза (`/objects/{objectId}/documents`, `/objects/{objectId}/documents/{docId}`, `/materials`, `/materials/folders`, `/materials/files`, `/materials/{materialId}`, `/materials/{materialId}/content`) попадают в API Gateway при следующем `infra/deploy_yc.py`.

## Хранилище

| Переменная | Куда пишет API |
|---|---|
| `PARTNERS_BUCKET` | Данные кабинета: `platform-v2.json`, `analytics-events.json`, PDF смет и спецификаций (`docs/…`). Имя бакета не подставляется само: без переменной деплой не выбирает `multiframe-partner-data`. |
| `MATERIALS_BUCKET` | Только методические материалы, ключи `materials/mat_…`. Секрет уже заведён в GitHub. Не должен совпадать с `PARTNERS_BUCKET`. |
| `YC_ACCESS_KEY_ID`, `YC_SECRET_ACCESS_KEY` | Статический ключ сервисного аккаунта. Регион — `YC_REGION`, по умолчанию `ru-central1`. |

Без `MATERIALS_BUCKET` загрузка файла отвечает `503` «Хранилище материалов не настроено» и не пишет байты в бакет кабинета. Старый узел с `storageKey` и без поля `bucket` по-прежнему открывается чтением из `PARTNERS_BUCKET`. Новый узел хранит `bucket: "materials"`. Функции материалов не удаляют и не перезаписывают ключи бакета кабинета.

Подписанная ссылка указывает на `https://storage.yandexcloud.net`. Чтобы браузер на `https://paulos99.github.io` смог её открыть, CORS бакета материалов выставляется отдельно и идемпотентно:

```bash
MATERIALS_BUCKET=multiframe-partner-materials \
YC_ACCESS_KEY_ID=... YC_SECRET_ACCESS_KEY=... \
node infra/set_materials_bucket_cors.mjs
```

Скрипт не запускается деплоем и не трогает бакет кабинета. Повторный запуск не меняет уже подходящее правило. Разрешены `GET` и `HEAD` (HEAD нужен видео). `PUT` из браузера не открыт.

Крупный файл через интерфейс не загружается: шлюз принимает до 2 МБ. Подписанный `PUT` не делался — для него нужен отдельный CORS на запись и шаг подтверждения. Большой пакет владелец кладёт напрямую в `MATERIALS_BUCKET`. Сами байты в кабинете не появятся, пока в `platform.materials` нет узла с тем же `storageKey` и `bucket: "materials"`. Образец переменных — `apps/api/.env.example`.

Пароли на сервере — bcrypt. Сессия — JWT 12ч. Для монтажника API отдаёт прайс и суммы КП без денег. PDF в объект прикладывается после расчёта «по размерам» или «начертить схему»: это тот же файл, что собирает калькулятор, со схемой раскладки. Расчёт «по площади» объект не создаёт. Имя файла — «Клиент — спецификация — ГГГГ-ММ-ДД.pdf». У монтажника та же схема без цен.

### Тестовый объект монтажника

Скрипт создаёт в «Потолках Столицы» объект «ТЕСТ доступ монтажника» с адресом «Проверка доступа монтажника», сразу назначает его монтажнику и прикладывает два PDF калькулятора: смету и спецификацию. Если объект с таким именем или таким адресом уже есть — назначен он или нет — скрипт останавливается: отчёт `ok: false`, текст ошибки и список id. Никакого PATCH, переназначения и загрузки PDF. Новый объект появляется только когда совпадений ноль. Ничего не удаляет. `platform-v2.json` скрипт не трогает.

PDF собирает сам калькулятор в headless Chrome: комната 4×3,5 м, затем `buildBOM`, `buildPdfSchemeImages` и два `exportCalculationPDF` (`hidePrices` false и true). Нужен Google Chrome (`CHROME_PATH`, иначе `/usr/local/bin/google-chrome`). Учётные данные только из окружения, в коде их нет.

- `MF_STAFF_LOGIN`, `MF_STAFF_PASSWORD` — владелец или менеджер «Потолков Столицы»
- `MF_CREW_LOGIN`, `MF_CREW_PASSWORD` — монтажник (`crew1` на демо)
- необязательно `API_BASE` (иначе шлюз выше), `CALC_URL` (иначе локальные файлы калькулятора), `CHROME_PATH`

```bash
cd apps/api && npm install
node scripts/create-crew-test-object.mjs --dry-run --out ./crew-test-pdfs
```

`--dry-run` не логинится и ничего не пишет в API: в `--out` появляются `estimate.pdf` и `spec.pdf`. Боевой запуск — та же команда без `--dry-run`, с переменными выше. Против прода его выполняет владелец.

Успех — спецификация монтажника 200, смета монтажника 404 и оба PDF владельца 200. Если проверка не сходится, код выхода 1; созданный объект скрипт не удаляет. Уже существующий объект с этим именем или адресом, в том числе от прошлого запуска, тоже даёт код 1 и ноль записей.

## Профиль партнёра

Поля кабинета (включая город) применяются в калькуляторе, смете, PDF и аналитике сети.

Данные платформы в Object Storage: ключ `platform-v2.json` (или `PLATFORM_KEY`). Старый `partners.json` мигрирует при первом чтении.

## Передеплой API

Архив функции собирает общий модуль `infra/function_bundle.py` (его вызывают и `infra/deploy_yc.py`, и `infra/mf_doh_patch_deploy.py`). В архив входят все `apps/api/**/*.js` и `*.mjs`, кроме тестов `*.test.*` и каталога `scripts/`, плюс `package.json` и lock. Если сервер относительно импортирует код снаружи `apps/api`, этот файл кладётся в архив с тем же путём. `projectClient.ts` — клиент кабинета, сервер его не импортирует, в архив он не входит.

`infra/deploy_yc.py` и `infra/mf_doh_patch_deploy.py` после сборки и до любой загрузки в Yandex Cloud проверяют тот самый zip: распаковка во временную папку, `npm ci` по lock из архива, импорт точки входа без облачных ключей и без сети. Если импорт не удался, скрипт завершается с ненулевым кодом и версия не создаётся. Отдельной проверки в GitHub Actions нет, чтобы не прогонять её второй раз на другом архиве. Actions запускает `infra/deploy_verify_guard_test.py`: сломанный архив должен остановить скрипт до заглушки загрузки.

Локально, без деплоя:

```bash
npm install --prefix apps/api
python infra/verify_function_bundle.py
python infra/deploy_verify_guard_test.py
py -3 infra/deploy_yc.py
```

Ключ SA: `%USERPROFILE%\.yc\agent-project-creator-key.json`
