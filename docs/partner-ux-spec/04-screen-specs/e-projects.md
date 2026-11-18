# E-projects — Список проектов

**Revision:** `rev-gate-b-draft-1` · **Gate B APPROVED 2026-10-23** · зависит от [D3](../03-information-architecture.md)

## Кто
owner, sales, measurer (свои/org); admin — **не** как полевой каталог (см. PartnerCard).

## Зачем
Найти/открыть проект; создать inquiry; фильтр по стадии UX / ответственному.

## Вход
Nav «Проекты»; secondary с home.

## Иерархия viewport (одна работа)
1. Поиск + фильтры  
2. Список проектов (клиент/адрес/фаза UX/активная Deal stage)  
3. FAB/кнопка «Новый проект»  
**Не** встраивать редактор КП и iframe calc.

## CTA (primary → secondary)
Primary: Новый проект. Row → E-project. Filter: active Deal / deferred / install.

## Данные
Project[]; active Deal summary (stage, outcome); room counts; **не** double-count totals.

## Переходы
→ E-project; → E-inquiry; пустой поиск → empty state.

## Состояния
- loading: skeleton list  
- empty: «Нет проектов» + CTA создать  
- error: retry  
- offline: cached list + badge

## Mobile
Список карточек; sticky search.

## RBAC
measurer: видит свои + созданные с поля (**Assumption:** политика org «все проекты» vs «свои» — default свои+assigned).  
crew: не этот экран (задания).  
admin: запрет delete; каталог чужих проектов не CRM.

## Acceptance Criteria
- AC-P-01: создание → projectId + первая room + active Deal contact  
- AC-P-02: фильтр deferred показывает проекты с roomAssent.deferred на closed/active deal  
- AC-P-03: итог в списке coalesce per room, не prelim+detailed

