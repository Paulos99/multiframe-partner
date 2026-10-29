#!/usr/bin/env bash
# Установка проверенного выпуска одной командой:   ./deploy/release.sh v1.2.0
# Откат на предыдущий выпуск:                       ./deploy/rollback.sh
# Код в этом каталоге НЕ правится: скрипт берёт только метку (tag) из репозитория владельца и пересобирает контейнеры.
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

CURRENT="$(cat "$STATE/current" 2>/dev/null || true)"
if [[ "$CURRENT" == "$TAG" && "${FORCE:-0}" != "1" ]]; then
  echo "Выпуск $TAG уже установлен (для переустановки: FORCE=1)."
  exit 0
fi

echo "==> Переключаемся на $TAG"
git checkout --quiet --detach "$TAG"

if [[ ! -f "$ROOT/deploy/docker-compose.yml" ]]; then
  echo "В выпуске $TAG нет каталога deploy (он появился позже). Возвращаем $CURRENT." >&2
  [[ -n "$CURRENT" ]] && git checkout --quiet --detach "$CURRENT"
  exit 1
fi

echo "==> Собираем и запускаем"
export BUILD_ID="$TAG"
"${COMPOSE[@]}" up -d --build --remove-orphans

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
    BUILD_ID="$CURRENT" "${COMPOSE[@]}" up -d --build --remove-orphans
  fi
  exit 1
fi

if [[ -n "$CURRENT" && "$CURRENT" != "$TAG" ]]; then
  echo "$CURRENT" > "$STATE/previous"
fi
echo "$TAG" > "$STATE/current"
echo "==> Готово: установлен $TAG (предыдущий: $(cat "$STATE/previous" 2>/dev/null || echo нет))"
