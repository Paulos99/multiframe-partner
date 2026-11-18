# E-inquiry — Создать проект / inquiry

**Revision:** `rev-gate-b-draft-1` · **Gate B APPROVED 2026-10-23** · зависит от [D3](../03-information-architecture.md)

## Кто
sales, owner, measurer (с поля).

## Зачем
Создать Project + первая Room + active Deal(contact) с минимальными полями.

## Вход
Home CTA / E-projects / после решения «полный проект» (не quick-entry).

## Иерархия viewport (одна работа)
1. Заголовок «Новый проект»  
2. Поля: имя/ярлык, клиент (опц.), телефон (опц.), адрес (опц.), город, имя первой комнаты  
3. Submit  
**Не** требовать полный CRM до первой консультации.

## CTA (primary → secondary)
Primary: Создать. Secondary: Отмена · «Сначала быстрый расчёт» → quick-entry.

## Данные
ProjectInput → Project + Room + Deal.

## Переходы
Успех → E-project (или E-room если с поля measurer).

## Состояния
- loading: submit disabled  
- validation error: inline  
- offline: создать local pendingSync → sync later  
- conflict: merge policy D5

## Mobile
Одна колонка; крупные поля.

## RBAC
crew/admin: нет create org projects (admin — сеть). measurer: да (§8.3).

## Acceptance Criteria
- AC-I-01: после create есть projectId, roomId, dealId (active)  
- AC-I-02: телефон не обязателен  
- AC-I-03: нет orphan room без projectId

