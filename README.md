# MultiFrame · Кабинет партнёра

Отдельный сервис для коммерческих партнёров: **логин → кабинет (РРЦ, монтаж, крепёж) → проблемомер + калькулятор**.

Публичные [проблемомер](https://github.com/Paulos99/multiframe-problemomer) и [калькулятор MF_StP](https://github.com/Paulos99/MF_StP) не меняются.

## Структура

- `apps/web` — React-оболочка + копия проблемомера + встроенный калькулятор
- `apps/api` — HTTP API (Yandex Cloud Function): `/auth/login`, `/auth/me`, `/partner/profile`
- `packages/shared` — типы профиля партнёра
- `infra/deploy_yc.py` — деплой Function + API Gateway

## Локально

```bash
cd apps/api && npm install
cd ../web && npm install
# в apps/web/.env:
# VITE_API_URL=http://localhost:8080
npm run dev
```

Демо-логин после деплоя с дефолтным сидом: `partner1` / `demo1234`.

## Деплой API (Yandex Cloud)

Нужен authorized key SA в `%USERPROFILE%\.yc\agent-project-creator-key.json`.

```bash
py -3 infra/deploy_yc.py
```

Скрипт создаёт Cloud Function и API Gateway в каталоге `b1gibd821or94p6f9v1q` и печатает `VITE_API_URL`.
