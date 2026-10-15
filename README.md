# MultiFrame · Кабинет партнёра

Отдельный сервис для коммерческих партнёров: **логин → кабинет (РРЦ, монтаж, крепёж) → проблемомер + калькулятор**.

Публичные проблемомер и калькулятор MF_StP не меняются.

## Уже задеплоено (Yandex Cloud)

- API Gateway: `https://d5dff69141o8r1ehqm09.l5v6loqa.apigw.yandexcloud.net`
- Cloud Function: `multiframe-partner-api` (`d4et50596cl0hu9o3d7k`)
- Демо-вход: логин `partner1`, пароль `demo1234`

Локальный фронт подхватывает URL из `apps/web/.env` (не в git).

## Структура

- `apps/web` — React: логин, кабинет, проблемомер, iframe-калькулятор
- `apps/api` — HTTP API: `/auth/login`, `/auth/me`, `/partner/profile`
- `packages/shared` — типы профиля
- `infra/deploy_yc.py` — деплой Function + Gateway

## Локально

```bash
cd apps/web
npm install
npm run dev
```

## Профиль партнёра

Поля кабинета применяются в калькуляторе (query-параметры) и в карточке сметы / PDF проблемомера.

Партнёры по умолчанию в памяти функции (сид). Для постоянных правок профиля задайте Object Storage: `PARTNERS_BUCKET` + ключи доступа в env версии функции.

## Передеплой API

```bash
cd apps/api && npm install
py -3 infra/deploy_yc.py
```

Ключ SA: `%USERPROFILE%\.yc\agent-project-creator-key.json`
