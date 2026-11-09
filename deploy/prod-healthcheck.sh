#!/usr/bin/env bash
# Проверка версии и health на ВМ. Вызов: TAG=v1.2.1 ./deploy/prod-healthcheck.sh
# или: ./deploy/prod-healthcheck.sh v1.2.1
set -euo pipefail
TAG="${1:-${TAG:-}}"
[[ -n "$TAG" ]] || { echo "Нужна метка TAG (например v1.2.1)"; exit 2; }
for i in 1 2 3 4 5 6 7 8 9 10; do
  VER=$(curl -fsS http://127.0.0.1:8081/cabinet/version.json || true)
  HEALTH=$(curl -fsS http://127.0.0.1:8081/cabinet-api/health || true)
  echo "try $i ver=$VER health=$HEALTH"
  echo "$VER" | grep -q "\"id\":\"$TAG\"" || { sleep 3; continue; }
  echo "$HEALTH" | grep -q '"ok":true' || { sleep 3; continue; }
  curl -fsS https://partner.stp-multiframe.ru/cabinet-api/health | grep -q '"ok":true'
  echo HEALTH_OK
  exit 0
done
echo HEALTH_FAIL
exit 1
