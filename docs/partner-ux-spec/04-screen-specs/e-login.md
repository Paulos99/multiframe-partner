# E-login — Вход

**Revision:** `rev-gate-b-draft-1` · **Gate B APPROVED 2026-10-23** · зависит от [D3](../03-information-architecture.md)

## Кто
Все роли (и демо-переключатель в demo-режиме).

## Зачем
Аутентификация; выбор контекста компании; без операционного UI.

## Вход
URL кабинета / deep-link после logout.

## Иерархия viewport (одна работа)
1. Бренд / название кабинета  
2. Форма login/password (или демо-роли)  
3. Ошибка входа (inline)  
**Не** показывать: inbox, ObjectsPanel, EntryPoints.

## CTA (primary → secondary)
Primary: Войти  
Secondary: Демо-роли (только ?demo=1) · Сброс пароля (если доступен)

## Данные
SessionUser (id, role, orgId, org settings).

## Переходы
Успех → E-home роли. Ошибка → остаёмся на E-login.

## Состояния
- loading: кнопка disabled + spinner  
- empty: n/a  
- error: неверный логин/сеть; без утечки «логин существует» сверх политики  
- offline: сообщение + повтор

## Mobile
Полная ширина; крупные поля; sticky CTA.

## RBAC
Публичный экран. После входа RBAC определяет home.

## Acceptance Criteria
- AC-L-01: неверный пароль → ошибка, сессии нет  
- AC-L-02: успех → home роли по UserRole  
- AC-L-03: crew не попадает на admin-only URL (редирект)

