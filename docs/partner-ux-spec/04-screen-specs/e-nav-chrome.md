# E-nav — Chrome и навигация

**Revision:** `rev-gate-b-draft-1` · **Gate B** · зависит от [D3](../03-information-architecture.md)

## Кто
Все авторизованные роли.

## Зачем
Ориентация: зона роли, sync, компания; переход между доменами без потери контекста сущности.

## Вход
Всегда поверх workspace.

## Иерархия viewport (одна работа)
1. Компания · роль · sync indicator  
2. Nav по зоне роли (D3 §1)  
3. Workspace = **один** активный экран  
**Не** дублировать CTA сущности в chrome.

## CTA (primary → secondary)
Пункты nav: Сегодня · Проекты/Сделки · Орг · Аналитика · Инструменты · Обучение — по матрице D3.

## Данные
SessionUser; sync queue length; org name.

## Переходы
Клик nav → соответствующий E-*; deep-link сохраняет projectId/roomId если применимо.

## Состояния
- loading: sync spinner  
- error: toast «не сохранено»  
- offline: badge Offline + очередь

## Mobile
Bottom tab (mobile) для 3–4 primary зон; overflow «Ещё».

## RBAC
Пункты скрыты по RBAC (D3 таблица).

## Acceptance Criteria
- AC-N-01: crew не видит «Компания/Staff create»  
- AC-N-02: admin не видит полевой inbox компании как CRM  
- AC-N-03: смена пункта nav не оставляет второй «стековый» экран под текущим

