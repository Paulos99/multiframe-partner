# Схема YDB

Источник истины для проектов, комнат, сделок, КП и расчётов — serverless-база `multiframe-partner-db`.

Путь базы и endpoint в репозиторий не записаны. Функция читает `YDB_ENDPOINT` и `YDB_DATABASE`. В Cloud Function доступ идёт через сервисный аккаунт и метаданные (`MetadataAuthService`), без ключа в коде.

`001_commercial_schema.yql` на прод не применялся. После приёмки его выполняет владелец в этой базе (консоль YDB или `node apps/api/scripts/apply-ydb-schema.mjs --apply` при уже выставленных переменных). Без флага `--apply` скрипт к базе не подключается.
