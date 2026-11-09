# Правка Deploy production: unbound TAG

В `.github/workflows/deploy-prod.yml` шаг «Проверка здоровья» использует
`ssh … bash -s <<'REMOTE'`. Кавычки у `REMOTE` не подставляют `$TAG` с раннера,
на ВМ при `set -u` получается `TAG: unbound variable`.

Исправление (одна строка вызова ssh):

```yaml
ssh -o BatchMode=yes -o IdentitiesOnly=yes "$TARGET" \
  env TAG="$TAG" bash -s <<'REMOTE'
```

Готовый файл: `deploy/github-workflows/deploy-prod.yml` — скопировать в
`.github/workflows/deploy-prod.yml` (нужен scope `workflow` у токена или правка
через UI GitHub).

На ВМ можно проверить без workflow: `TAG=vX.Y.Z ./deploy/prod-healthcheck.sh`.
