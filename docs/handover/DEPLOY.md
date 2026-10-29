# Размещение на сервере: https://stp-multiframe.ru/cabinet

Принцип: **код не правится**. Вы берёте проверенный выпуск (метку `vX.Y.Z` на ветке `main` репозитория владельца)
и устанавливаете его одной командой. Все изменения кода делает владелец; вам приходит новая метка.

Сайт открывается по `/cabinet/`, API — по `/cabinet-api/` на том же домене. Один домен — значит нет межсайтовых
запросов, а service worker имеет область действия ровно `/cabinet/`.

## 0. Что нужно на сервере

- Linux, Docker с плагином `docker compose`, `git`, `curl`.
- Внешний обратный прокси с HTTPS (nginx/Caddy/Traefik), который уже обслуживает `stp-multiframe.ru`.
- S3-совместимое хранилище и два бакета (кабинет и материалы) либо ваша база по [DATA_LAYER.md](DATA_LAYER.md). Кабинет целиком (интерфейс, API, хранилище) живёт у вас; сервер стенда владельца не нужен. Полный порядок и проверки — [SELF_HOST.md](SELF_HOST.md).
- Доступ на чтение к репозиторию `https://github.com/Paulos99/multiframe-partner` (он открытый).

## 1. Первая установка (один раз)

```bash
sudo mkdir -p /opt/multiframe-cabinet && sudo chown "$USER" /opt/multiframe-cabinet
git clone https://github.com/Paulos99/multiframe-partner.git /opt/multiframe-cabinet
cd /opt/multiframe-cabinet

cp deploy/.env.example deploy/.env
chmod 600 deploy/.env
# Заполните deploy/.env: секреты (openssl rand -hex 32 — для каждого свой), бакеты, ключи хранилища,
# CORS_ORIGIN=https://stp-multiframe.ru, ADMIN_BOOTSTRAP_LOGIN / ADMIN_BOOTSTRAP_PASSWORD.
# Названия всех переменных — в ENV.md. Значения не присылайте владельцу и не коммитьте.

# Перед первым запуском проверьте хранилище (SELF_HOST.md, шаг 4):
# docker compose --env-file deploy/.env -f deploy/docker-compose.yml run --rm --no-deps api node checkStorage.mjs

./deploy/release.sh v1.0.0        # подставьте актуальную метку из раздела «Выпуски» на GitHub
```

Скрипт:
1. проверяет имя метки, права файла `.env` (600) и что в каталоге нет правок кода;
2. подтягивает метки из репозитория и проверяет, что метка лежит на `main`
   (при `REQUIRE_SIGNED_TAG=1` — ещё и подпись);
3. переключает рабочую копию на метку, собирает образы и запускает контейнеры (`api` и `web`);
4. ждёт ответа: `/cabinet/version.json` должен вернуть номер этой метки, `/cabinet-api/health` — `"ok":true`;
5. если проверка не прошла, возвращает предыдущий выпуск сам и завершается с ошибкой;
6. запоминает текущий и предыдущий выпуск в `.release/`.

Контейнер `web` слушает только `127.0.0.1:8081` (порт — `WEB_PORT`). Наружу его отдаёт ваш внешний прокси.

## 2. Подключение внешнего прокси (HTTPS)

Пример для nginx, уже обслуживающего `stp-multiframe.ru` (TLS-настройки у вас свои):

```nginx
location /cabinet/ {
    proxy_pass http://127.0.0.1:8081;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $remote_addr;      # перезаписать, а не дополнить
    proxy_set_header X-Forwarded-Proto $scheme;
}
location = /cabinet { return 301 /cabinet/; }
location /cabinet-api/ {
    proxy_pass http://127.0.0.1:8081;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $remote_addr;
    proxy_set_header X-Forwarded-Proto $scheme;
    client_max_body_size 10m;
}
# Общий ограничитель частоты на входе (рекомендуется), в блоке http:
#   limit_req_zone $binary_remote_addr zone=cabinet_login:10m rate=10r/m;
# и в location /cabinet-api/auth/login:  limit_req zone=cabinet_login burst=10 nodelay;
```

Заголовок `Strict-Transport-Security` добавьте на этом уровне (после проверки HTTPS), остальные заголовки безопасности
уже выставляет контейнер `web` (`deploy/nginx/security-headers.conf`).
Контейнер `web` доверяет заголовку `X-Forwarded-For` только от частных адресов (внешний прокси на этом же сервере или
в вашей внутренней сети). Если ваш внешний прокси имеет публичный адрес, сообщите об этом владельцу: он выпустит новую метку
с нужной настройкой (файл `deploy/nginx/cabinet.conf` — часть кода, на сервере его не правят).

## 3. Первый вход

Создайте администратора по [ADMIN_BOOTSTRAP.md](ADMIN_BOOTSTRAP.md), войдите на `https://stp-multiframe.ru/cabinet/`
и смените пароль. Затем удалите `ADMIN_BOOTSTRAP_*` из `deploy/.env` и перезапустите: `./deploy/release.sh <метка>` с `FORCE=1`.

## 4. Обновление

Владелец сообщает: «Выпущена метка `v1.3.0`». Тогда:

```bash
cd /opt/multiframe-cabinet
./deploy/release.sh v1.3.0
```

Автоматически, без захода на сервер: пример рабочего процесса для вашей системы сборки —
`deploy/examples/deploy-over-ssh.yml` (запуск вручную с номером метки, ключ SSH лежит в секретах вашей системы).

Метки создаёт и проверяет владелец: перед выпуском проходят автоматические проверки
(`.github/workflows/release.yml`, до переноса — `deploy/github-workflows/release.yml`: проверка API, проверка интерфейса, сборка под `/cabinet`), в выпуске на GitHub
лежит архив статики и контрольная сумма.

Данные при обновлении не затрагиваются: они в хранилище, а не в контейнерах. Миграции схемы не требуются —
документ платформы читается с учётом старых версий (`apps/api/index.js`, `migrateLegacyPartners`).

## 5. Откат на предыдущий выпуск

```bash
cd /opt/multiframe-cabinet
./deploy/rollback.sh                # на предыдущий установленный выпуск
./deploy/rollback.sh v1.2.0         # или на любую указанную метку
```

Откат — это та же установка, только со старой меткой: тот же порядок проверок. Повторный вызов `rollback.sh`
возвращает обратно на более новый выпуск. Откатываться можно только на метки, в которых уже есть каталог `deploy/`
(первая такая — `v1.0.0`); скрипт сам откажется и вернёт текущий выпуск.

Если новый выпуск после установки проходит проверку, но работает плохо: откат занимает 1–2 минуты (образы собираются
из кэша). Данные откат не трогает. Если в новом выпуске менялся формат данных, владелец явно напишет об этом
в описании выпуска; без такого предупреждения старая версия читает данные новой.

## 6. Установка без Docker (запасной вариант)

```bash
# статика
curl -LO https://github.com/Paulos99/multiframe-partner/releases/download/v1.0.0/multiframe-cabinet-v1.0.0.tar.gz
curl -LO https://github.com/Paulos99/multiframe-partner/releases/download/v1.0.0/multiframe-cabinet-v1.0.0.sha256
sha256sum -c multiframe-cabinet-v1.0.0.sha256
sudo mkdir -p /var/www/cabinet && sudo tar -xzf multiframe-cabinet-v1.0.0.tar.gz -C /var/www/cabinet
# API
git clone --branch v1.0.0 --depth 1 https://github.com/Paulos99/multiframe-partner.git /opt/mf && cd /opt/mf/apps/api
npm ci --omit=dev
# запуск: systemd-служба с EnvironmentFile=/etc/multiframe/api.env (права 600), ExecStart=/usr/bin/node server.mjs,
# NODE_ENV=production, HOST=127.0.0.1, PORT=8080, TRUST_PROXY=1, User=непривилегированный
```

В nginx: `location /cabinet/ { alias /var/www/cabinet/; try_files $uri $uri/ /cabinet/index.html; }` и
`location /cabinet-api/ { proxy_pass http://127.0.0.1:8080/; }`.
Для файлов `index.html`, `sw.js`, `sw-sync.js`, `version.json`, `manifest.webmanifest` задайте `Cache-Control: no-cache`,
для `/cabinet/assets/` — `public, max-age=31536000, immutable`: иначе автообновление не заметит новую сборку.

Архив статики из выпуска собран для `/cabinet` и `/cabinet-api` (их менять нельзя без пересборки).
Другой путь или адрес API — сборка из репозитория с `VITE_BASE` и `VITE_API_URL`: это уже изменение конфигурации,
согласуйте его с владельцем.

## 7. PWA и автообновление под /cabinet

Проверено сборкой с `VITE_BASE=/cabinet`:
- манифест: `start_url` и `scope` равны `/cabinet/`;
- service worker регистрируется по `/cabinet/sw.js` с областью `/cabinet/`, чужие страницы домена он не затрагивает;
- `version.json` читается по `/cabinet/version.json` без кэша; при несовпадении номера страница обновляется сама;
- запасная страница `404.html` вычисляет базу из первого сегмента пути.

Если кабинет «не обновляется»: проверьте, что `index.html`, `sw.js` и `version.json` отдаются с `Cache-Control: no-cache`
и что внешний прокси не кэширует `/cabinet/`.

## 8. Проверка после установки

```bash
curl -fsS https://stp-multiframe.ru/cabinet/version.json        # {"id":"v1.3.0"}
curl -fsS https://stp-multiframe.ru/cabinet-api/health          # {"ok":true,...}
curl -sI  https://stp-multiframe.ru/cabinet/ | grep -i -E 'content-security|x-frame|nosniff'
```

Откройте кабинет, войдите администратором. Войдите замерщиком и убедитесь, что цен нет. Проверьте, что `?demo=1`
не включает демонстрационный режим.
