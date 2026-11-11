#!/usr/bin/env bash
# Установка проверенного выпуска одной командой:   ./deploy/release.sh v1.2.0
# Откат на предыдущий выпуск:                       ./deploy/rollback.sh
# Код в этом каталоге НЕ правится: скрипт берёт только метку (tag) из репозитория владельца.
# Образы api и web готовые: их собирает GitHub Actions и кладёт в GHCR, здесь они только скачиваются.
# Запасной вариант — собрать на сервере: BUILD_ON_VM=1 ./deploy/release.sh vX.Y.Z (нужно много памяти).
set -euo pipefail

TAG="${1:-}"
if [[ -z "$TAG" ]]; then
  echo "Использование: $0 vX.Y.Z" >&2
  exit 2
fi
if [[ ! "$TAG" =~ ^v[0-9]+\.[0-9]+\.[0-9]+([.-][0-9A-Za-z.]+)?$ ]]; then
  echo "Имя выпуска должно быть вида v1.2.3, получено: $TAG" >&2
  exit 2
fi

# Копия скрипта во временном файле: при переключении метки сам файл в каталоге заменяется другой версией.
if [[ -z "${MF_RELEASE_REEXEC:-}" ]]; then
  MF_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
  TMP_SCRIPT="$(mktemp)"
  cp "${BASH_SOURCE[0]}" "$TMP_SCRIPT"
  MF_RELEASE_REEXEC=1 MF_ROOT="$MF_ROOT" exec bash "$TMP_SCRIPT" "$@"
fi
ROOT="$MF_ROOT"
cd "$ROOT"
STATE="$ROOT/.release"
ENV_FILE="${ENV_FILE:-$ROOT/deploy/.env}"
COMPOSE=(docker compose --env-file "$ENV_FILE" -f "$ROOT/deploy/docker-compose.yml")
# Свои дополнения к запуску (тома, адаптер хранилища, свои заголовки): файл на сервере, в репозиторий не попадает.
# Пример: deploy/examples/docker-compose.override.example.yml
if [[ -f "$ROOT/deploy/docker-compose.override.yml" ]]; then
  COMPOSE+=(-f "$ROOT/deploy/docker-compose.override.yml")
fi
mkdir -p "$STATE"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Нет файла $ENV_FILE. Скопируйте deploy/.env.example и заполните." >&2
  exit 1
fi
if [[ "$(stat -c '%a' "$ENV_FILE")" != "600" ]]; then
  echo "Права на $ENV_FILE должны быть 600 (chmod 600)." >&2
  exit 1
fi
if [[ -n "$(git status --porcelain --untracked-files=no)" ]]; then
  echo "В каталоге есть правки кода. Править код здесь нельзя: изменения вносятся только через репозиторий владельца." >&2
  echo "Верните файлы командой: git checkout -- .   (или клонируйте заново)" >&2
  exit 1
fi

git fetch --tags --force origin "+refs/heads/main:refs/remotes/origin/main"
if ! git rev-parse -q --verify "refs/tags/$TAG^{commit}" >/dev/null; then
  echo "Метка $TAG не найдена в репозитории." >&2
  exit 1
fi
# Выпуск обязан быть на ветке main: на ней проходят проверки и принимаются изменения.
if ! git merge-base --is-ancestor "$TAG^{commit}" origin/main; then
  echo "Метка $TAG не входит в ветку main. Установка отменена." >&2
  exit 1
fi
if [[ "${REQUIRE_SIGNED_TAG:-0}" == "1" ]]; then
  git verify-tag "$TAG"
fi

CURRENT="${MF_RELEASE_PREV-$(cat "$STATE/current" 2>/dev/null || true)}"
if [[ "$CURRENT" == "$TAG" && "${FORCE:-0}" != "1" ]]; then
  echo "Выпуск $TAG уже установлен (для переустановки: FORCE=1)."
  exit 0
fi

echo "==> Переключаемся на $TAG"
PREV_HEAD="$(git rev-parse HEAD)"
git checkout --quiet --detach "$TAG"

# При обновлении вперёд скрипт выпуска мог измениться: продолжаем установку его версией из метки.
# При откате на старую метку остаётся текущий скрипт.
if [[ -z "${MF_RELEASE_TAG_SCRIPT:-}" && -f "$ROOT/deploy/release.sh" ]] \
  && git merge-base --is-ancestor "$PREV_HEAD" "$TAG^{commit}" \
  && ! cmp -s "$ROOT/deploy/release.sh" "${BASH_SOURCE[0]}"; then
  NEW_SCRIPT="$(mktemp)"
  cp "$ROOT/deploy/release.sh" "$NEW_SCRIPT"
  MF_RELEASE_TAG_SCRIPT=1 MF_RELEASE_REEXEC=1 MF_ROOT="$ROOT" MF_RELEASE_PREV="$CURRENT" exec bash "$NEW_SCRIPT" "$@"
fi

if [[ ! -f "$ROOT/deploy/docker-compose.yml" ]]; then
  echo "В выпуске $TAG нет каталога deploy (он появился позже). Возвращаем $CURRENT." >&2
  [[ -n "$CURRENT" ]] && git checkout --quiet --detach "$CURRENT"
  exit 1
fi

# Значение из окружения важнее, чем из deploy/.env.
env_get() {
  local key="$1" val
  if [[ -n "${!key:-}" ]]; then printf '%s' "${!key}"; return; fi
  val="$(grep -E "^${key}=" "$ENV_FILE" | tail -1 | cut -d= -f2- || true)"
  val="${val%\"}"; val="${val#\"}"; val="${val%\'}"; val="${val#\'}"
  printf '%s' "$val"
}
BUILD_ON_VM="$(env_get BUILD_ON_VM)"
IMAGE_PREFIX="$(env_get IMAGE_PREFIX)"
IMAGE_PREFIX="${IMAGE_PREFIX:-ghcr.io/paulos99/multiframe-cabinet}"
export IMAGE_PREFIX
PULL_WAIT_SECONDS="$(env_get PULL_WAIT_SECONDS)"
PULL_WAIT_SECONDS="${PULL_WAIT_SECONDS:-900}"

# Образы, которые работают сейчас: к ним возвращаемся, если новый выпуск не поднимется.
OLD_API_IMAGE=""; OLD_WEB_IMAGE=""
running_image() {
  local cid
  cid="$("${COMPOSE[@]}" ps -q "$1" 2>/dev/null | head -1 || true)"
  [[ -n "$cid" ]] && docker inspect -f '{{.Image}}' "$cid" 2>/dev/null || true
}
OLD_API_IMAGE="$(running_image api)"
OLD_WEB_IMAGE="$(running_image web)"

ghcr_login() {
  local user token
  user="$(env_get GHCR_USER)"; token="$(env_get GHCR_TOKEN)"
  if [[ -n "$user" && -n "$token" ]]; then
    printf '%s' "$token" | docker login ghcr.io -u "$user" --password-stdin >/dev/null
    GHCR_LOGGED_IN=1
  fi
}
ghcr_logout() {
  if [[ "${GHCR_LOGGED_IN:-0}" == "1" ]]; then docker logout ghcr.io >/dev/null 2>&1 || true; GHCR_LOGGED_IN=0; fi
}
trap ghcr_logout EXIT

warn_custom_vite() {
  local k v custom=""
  for k in VITE_YM_ID VITE_ANALYTICS_INGEST_URL VITE_STP_PROBLEMOMER_URL VITE_STP_CALCULATOR_URL; do
    v="$(env_get "$k")"; [[ -n "$v" ]] && custom+=" $k"
  done
  v="$(env_get VITE_BASE)"; [[ -n "$v" && "$v" != "/cabinet" ]] && custom+=" VITE_BASE"
  v="$(env_get VITE_API_URL)"; [[ -n "$v" && "$v" != "/cabinet-api" ]] && custom+=" VITE_API_URL"
  if [[ -n "$custom" ]]; then
    echo "!! В deploy/.env заданы параметры интерфейса:$custom." >&2
    echo "!! Готовый образ web собран со значениями из GitHub (Settings → Variables → Actions, имена CABINET_VITE_*)." >&2
    echo "!! Чтобы взять значения из deploy/.env, установите с BUILD_ON_VM=1." >&2
  fi
}

pull_images() {
  local deadline=$(( $(date +%s) + PULL_WAIT_SECONDS )) shown=0
  ghcr_login || { echo "!! Вход в ghcr.io с GHCR_USER/GHCR_TOKEN не удался" >&2; return 1; }
  until "${COMPOSE[@]}" pull --quiet api web; do
    if (( $(date +%s) >= deadline )); then
      ghcr_logout
      echo "!! Не удалось скачать образы $IMAGE_PREFIX-{api,web}:$BUILD_ID за ${PULL_WAIT_SECONDS} с." >&2
      echo "!! Проверьте на GitHub процесс «Образы для сервера (GHCR)» для метки $BUILD_ID и доступ к пакетам" >&2
      echo "!! (пакеты публичные или в deploy/.env заданы GHCR_USER и GHCR_TOKEN с правом read:packages)." >&2
      echo "!! Запасной вариант: BUILD_ON_VM=1 FORCE=1 ./deploy/release.sh $BUILD_ID" >&2
      return 1
    fi
    if [[ "$shown" == "0" ]]; then echo "==> Образы ещё не готовы, ждём сборку на GitHub (до ${PULL_WAIT_SECONDS} с)"; shown=1; fi
    sleep 30
  done
  ghcr_logout
}

start_release() {
  export BUILD_ID="$1"
  if [[ "$BUILD_ON_VM" == "1" ]]; then
    echo "==> Собираем образы на сервере (BUILD_ON_VM=1) и запускаем"
    "${COMPOSE[@]}" up -d --build --remove-orphans || return 1
  else
    echo "==> Скачиваем готовые образы $IMAGE_PREFIX-{api,web}:$BUILD_ID"
    pull_images || return 1
    echo "==> Запускаем"
    "${COMPOSE[@]}" up -d --no-build --remove-orphans || return 1
  fi
}

# Откат: те же образы, что работали до установки (их не нужно ни скачивать, ни собирать).
restore_previous() {
  local prev="$1"
  export BUILD_ID="$prev"
  if [[ "$BUILD_ON_VM" != "1" && -n "$OLD_API_IMAGE" && -n "$OLD_WEB_IMAGE" ]]; then
    docker tag "$OLD_API_IMAGE" "$IMAGE_PREFIX-api:$prev" || return 1
    docker tag "$OLD_WEB_IMAGE" "$IMAGE_PREFIX-web:$prev" || return 1
    "${COMPOSE[@]}" up -d --no-build --remove-orphans || return 1
  else
    start_release "$prev"
  fi
}

[[ "$BUILD_ON_VM" == "1" ]] || warn_custom_vite
if ! start_release "$TAG"; then
  echo "!! Установка $TAG не началась, работающие контейнеры не тронуты." >&2
  [[ -n "$CURRENT" && "$CURRENT" != "$TAG" ]] && git checkout --quiet --detach "$CURRENT"
  exit 1
fi

PORT="$(grep -E '^WEB_PORT=' "$ENV_FILE" | tail -1 | cut -d= -f2 | tr -d '[:space:]' || true)"
PORT="${PORT:-8081}"
ok=0
for _ in $(seq 1 30); do
  served="$(curl -fsS "http://127.0.0.1:$PORT/cabinet/version.json" 2>/dev/null | sed -n 's/.*"id":"\([^"]*\)".*/\1/p' || true)"
  api="$(curl -fsS "http://127.0.0.1:$PORT/cabinet-api/health" 2>/dev/null || true)"
  if [[ "$served" == "$TAG" && "$api" == *'"ok":true'* ]]; then ok=1; break; fi
  sleep 2
done

if [[ "$ok" != "1" ]]; then
  echo "!! Проверка после запуска не прошла (сайт: '${served:-нет ответа}', API: '${api:-нет ответа}')." >&2
  if [[ -n "$CURRENT" && "$CURRENT" != "$TAG" && "${NO_AUTO_ROLLBACK:-0}" != "1" ]]; then
    echo "!! Возвращаем предыдущий выпуск $CURRENT" >&2
    git checkout --quiet --detach "$CURRENT"
    restore_previous "$CURRENT"
  fi
  exit 1
fi

if [[ -n "$CURRENT" && "$CURRENT" != "$TAG" ]]; then
  echo "$CURRENT" > "$STATE/previous"
fi
echo "$TAG" > "$STATE/current"
echo "==> Готово: установлен $TAG (предыдущий: $(cat "$STATE/previous" 2>/dev/null || echo нет))"
