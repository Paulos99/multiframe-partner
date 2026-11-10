#!/usr/bin/env bash
# Проверка deploy/release.sh без Docker: заглушки docker/curl, временный репозиторий с метками.
# Запуск из корня репозитория: bash deploy/tests/release-script.test.sh
set -euo pipefail
SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
T="$(mktemp -d)"; trap 'rm -rf "$T"' EXIT
mkdir -p "$T/bin"
git init -q --bare "$T/origin.git"
git clone -q "$T/origin.git" "$T/work" 2>/dev/null
cd "$T/work"; git checkout -q -b main
mkdir deploy; cp "$SRC"/deploy/{release.sh,rollback.sh,docker-compose.yml} deploy/
printf '.env\n.release\n' > .gitignore
G=(git -c user.name=t -c user.email=t@t)
"${G[@]}" add -A; "${G[@]}" commit -qm one; git tag v1.0.0
echo "# два" >> deploy/docker-compose.yml; "${G[@]}" commit -qam two; git tag v1.1.0
git push -q origin main --tags
printf 'WEB_PORT=8081\nGHCR_USER=bot\nGHCR_TOKEN=test-token\n' > deploy/.env; chmod 600 deploy/.env
cat > "$T/bin/docker" <<STUB
#!/usr/bin/env bash
echo "docker \$* BUILD_ID=\${BUILD_ID:-}" >> "$T/docker.log"
case "\$*" in
  *" pull "*) n=\$(cat "$T/pullfail" 2>/dev/null || echo 0); if [ "\$n" -gt 0 ]; then echo \$((n-1)) > "$T/pullfail"; exit 1; fi;;
  *" ps -q "*) echo cid1;;
  inspect*) echo sha256:old;;
  login*) cat > /dev/null;;
esac
STUB
cat > "$T/bin/curl" <<STUB
#!/usr/bin/env bash
case "\$*" in *version.json*) echo "{\"id\":\"\${BUILD_ID}\"}";; *health*) [ -f "$T/unhealthy" ] && exit 22; echo '{"ok":true}';; esac
STUB
printf '#!/usr/bin/env bash\nexit 0\n' > "$T/bin/sleep"
chmod +x "$T"/bin/*
export PATH="$T/bin:$PATH"
fail() { echo "ОШИБКА: $*" >&2; exit 1; }

: > "$T/docker.log"; echo 2 > "$T/pullfail"
./deploy/release.sh v1.0.0 >/dev/null
grep -q "pull --quiet api web BUILD_ID=v1.0.0" "$T/docker.log" || fail "нет скачивания образов"
grep -q -- "--build" "$T/docker.log" && fail "сборка на сервере без BUILD_ON_VM"
grep -q "logout ghcr.io" "$T/docker.log" || fail "нет выхода из ghcr.io"
[[ "$(cat .release/current)" == v1.0.0 ]] || fail "current"
echo "ok: установка со скачиванием образов"

: > "$T/docker.log"; touch "$T/unhealthy"
if ./deploy/release.sh v1.1.0 >/dev/null 2>&1; then fail "должна быть ошибка"; fi
rm -f "$T/unhealthy"
grep -q "tag sha256:old ghcr.io/paulos99/multiframe-cabinet-api:v1.0.0" "$T/docker.log" || fail "откат не на прежние образы"
grep -q -- "--build" "$T/docker.log" && fail "сборка при откате"
[[ "$(git describe --tags)" == v1.0.0 && "$(cat .release/current)" == v1.0.0 ]] || fail "после отката"
echo "ok: откат на работавшие образы"

: > "$T/docker.log"; echo 99 > "$T/pullfail"
if PULL_WAIT_SECONDS=0 ./deploy/release.sh v1.1.0 >/dev/null 2>&1; then fail "должна быть ошибка"; fi
rm -f "$T/pullfail"
grep -q " up " "$T/docker.log" && fail "контейнеры тронуты без образов"
[[ "$(git describe --tags)" == v1.0.0 ]] || fail "рабочая копия не вернулась"
echo "ok: нет образов — контейнеры не тронуты"

: > "$T/docker.log"
BUILD_ON_VM=1 ./deploy/release.sh v1.1.0 >/dev/null
grep -q "up -d --build" "$T/docker.log" || fail "BUILD_ON_VM не собирает"
grep -q "login" "$T/docker.log" && fail "вход в ghcr при сборке на сервере"
echo "ok: запасная сборка на сервере"
echo "Все проверки release.sh прошли"
