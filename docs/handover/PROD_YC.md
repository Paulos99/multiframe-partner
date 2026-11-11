# Рабочий сервис в Яндекс Облаке (production)

Отдельно от тестового стенда (GitHub Pages + облачные функции). Данные, ключи и выкладка не пересекаются со стендом.

## Архитектура

| Что | Где |
|---|---|
| Домен | `https://partner.stp-multiframe.ru` (`www` → без www, HTTP → HTTPS) |
| ВМ | Yandex Compute Cloud, каталог `default`, зона `ru-central1-d`, имя `mfp-prod` |
| Размер ВМ | 2 vCPU (50%), 2 ГБ RAM, диск 20 ГБ network-HDD, статичный публичный IP |
| Приложение | `/opt/multiframe-cabinet`, Docker Compose: `api` + `web` + `caddy` |
| Прокси / TLS | контейнер Caddy, сертификаты Let's Encrypt (автовыпуск и продление) |
| Данные | Object Storage: бакеты `PARTNERS_BUCKET` и `MATERIALS_BUCKET` (имена в секретах на сервере) |
| Сервисный аккаунт | `mfp-prod-storage` (статический ключ только для этих бакетов по смыслу; роль `storage.editor` на каталог `default` — см. замечание ниже) |

Стенд (Pages, API Gateway, облачные функции, бакеты стенда, ключи `smm-deployer` / профили стенда) **не трогать**.

### Замечание по IAM

Квота сетей облака была 2/2, отдельную VPC для каталога `multiframe-partner` создать нельзя. Бакеты рабочего сервиса лежат в каталоге `default` рядом с сетью. Роль `storage.editor` выдана сервисному аккаунту на каталог `default` (привязка на отдельный каталог `multiframe-partner` / `mfp-prod` этим ключом CLI недоступна). По возможности позже перенесите бакеты в отдельный каталог и сузьте права.

## Первый запуск (уже сделан)

1. Созданы ВМ, IP, security group (22/80/443), два бакета, SA и ключ.
2. На ВМ: Docker, приложение из метки `v1.2.0`, Caddy с HTTPS.
3. Секреты приложения — только в `/opt/multiframe-cabinet/deploy/.env` (права `600`), копии на машине агента: `/workspace/handover/prod-secrets/` (не коммитить).
4. Первый администратор создаётся из `ADMIN_BOOTSTRAP_*` в `.env`. После входа смените пароль и уберите эти строки, затем `FORCE=1 ./deploy/release.sh <текущая-метка>`. Следующих администраторов добавляйте в кабинете («Кабинеты» → «Администраторы StP»), не через переменные окружения.

## Включение workflow в GitHub

Процесс лежит в `.github/workflows/deploy-prod.yml`. Один раз создайте Environment `production` с required reviewers и секреты из таблицы ниже.
Образы сервер скачивает из GHCR ([PREBUILT_IMAGES.md](PREBUILT_IMAGES.md)): пакеты публичные или в `deploy/.env` задан вход на чтение `GHCR_USER`/`GHCR_TOKEN`.

## Выкладка новой версии

Только вручную, после отдельного «да» владельца.

1. Убедитесь, что нужная метка `vX.Y.Z` есть на `main` и прошла проверки.
2. GitHub → Actions → **Deploy production** → Run workflow:
   - `tag`: например `v1.2.0`
   - `confirm`: ровно `deploy-prod`
3. Workflow: резервная копия бакетов → переключение на метку и `./deploy/release.sh` по SSH (скачивает готовые образы) → проверка `/cabinet/version.json` и `/cabinet-api/health` → при ошибке `./deploy/rollback.sh`.

Либо с сервера:

```bash
ssh deploy@<IP>
cd /opt/multiframe-cabinet
./deploy/release.sh vX.Y.Z
```

## Откат

```bash
cd /opt/multiframe-cabinet
./deploy/rollback.sh          # на предыдущий успешный выпуск
./deploy/rollback.sh v1.1.0   # на указанную метку
```

## Резервные копии

- Перед каждой выкладкой через workflow: префикс `s3://PARTNERS_BUCKET/_backups/<UTC>-<tag>/`.
- Версионирование включено на бакете партнёров (где позволяет API).
- Регулярные копии — см. [BACKUPS.md](BACKUPS.md).

## Стоимость (ориентир, ₽/мес с НДС)

Конфигурация близка к минимальной на сайте Yandex Cloud (~1659 ₽ за 2×50% vCPU / 2 ГБ / HDD) плюс статичный IP (~190 ₽) и Object Storage (копейки при малом объёме). **Ориентир: около 1 900–2 300 ₽/мес.** Точная сумма — в биллинге облака.

## Секреты GitHub (только имена)

Завести в репозитории (Settings → Secrets), значения — из `/workspace/handover/prod-secrets/` на машине агента, **не из чата**:

| Secret | Содержимое |
|---|---|
| `PROD_DEPLOY_HOST` | публичный IP или позже hostname ВМ |
| `PROD_DEPLOY_USER` | `deploy` |
| `PROD_DEPLOY_SSH_KEY` | приватный ключ `mfp-prod-deploy` |
| `PROD_DEPLOY_KNOWN_HOSTS` | строка `known_hosts` для IP |
| `PROD_S3_ACCESS_KEY_ID` | ключ SA `mfp-prod-storage` |
| `PROD_S3_SECRET_ACCESS_KEY` | секрет того же ключа |
| `PROD_PARTNERS_BUCKET` | имя бакета данных |
| `PROD_MATERIALS_BUCKET` | имя бакета материалов |

Окружение GitHub `production` — с обязательным подтверждением перед запуском.

## Как выпустить ключи заново

1. Object Storage: `yc iam access-key create --service-account-name mfp-prod-storage`, обновить `deploy/.env` и секреты GitHub, удалить старый ключ.
2. SSH: новая пара ключей, публичный ключ в `/home/deploy/.ssh/authorized_keys`, приватный — в `PROD_DEPLOY_SSH_KEY`.
3. JWT / analytics: новые значения `openssl rand -hex 32` в `deploy/.env`, перезапуск `api` (`FORCE=1 ./deploy/release.sh <метка>`). Сессии пользователей сбросятся.

## Проверка после DNS / HTTPS

```bash
curl -fsS https://partner.stp-multiframe.ru/cabinet/version.json
curl -fsS https://partner.stp-multiframe.ru/cabinet-api/health
# ожидается {"ok":true,...}
```

HTTP должен отвечать 301 на HTTPS; `www` — 301 на без www.

CORS бакета материалов: origin `https://partner.stp-multiframe.ru`, методы GET/HEAD/PUT.

## Связанные документы

- [SELF_HOST.md](SELF_HOST.md), [ENV.md](ENV.md), [DEPLOY.md](DEPLOY.md), [DATA_LAYER.md](DATA_LAYER.md), [BACKUPS.md](BACKUPS.md)
