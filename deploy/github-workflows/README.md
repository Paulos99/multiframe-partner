# Рабочие процессы GitHub — перенести вручную

Токен, которым подготовлена эта правка, не имеет права менять `.github/workflows/`, поэтому файлы лежат здесь.
Владелец репозитория переносит их одной командой после слияния (с учётной записи, у которой есть право на рабочие процессы):

```bash
git mv deploy/github-workflows/release.yml .github/workflows/release.yml
git apply deploy/github-workflows/deploy-api.yml.patch
git rm deploy/github-workflows/deploy-api.yml.patch deploy/github-workflows/README.md
git commit -m "Рабочие процессы: выпуск по метке, права deploy-api"
```

- `release.yml` — проверка кода, сборка статики под `/cabinet`, выпуск на GitHub при метке `v*`.
- `deploy-api.yml.patch` — блок `permissions: contents: read` и передача `DEMO_SEED`, `ALLOW_DEMO_RESET`, `SHARE_LINK_TTL_DAYS` из переменных репозитория.
