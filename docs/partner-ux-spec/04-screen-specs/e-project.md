# E-project — Карточка проекта

**Revision:** `rev-gate-b-draft-1` · **Gate B APPROVED 2026-10-23** · зависит от [D3](../03-information-architecture.md)

## Кто
sales, owner, measurer (read/write по правам); crew — только если assigned room (ограниченно); admin — диагностика без delete.

## Зачем
Обзор комнат + активная Deal; вход в комнату/сделку; увидеть deferred после закрытой Deal.

## Вход
Из списка / inbox / после bind.

## Иерархия viewport (одна работа)
1. Шапка: клиент/адрес/ярлык (минимальные поля OK)  
2. Вкладки/сегменты: **Комнаты** | **Сделка** | **История Deal** (если >1)  
3. На Комнатах: список Room + статус исполнения + calc badges (prelim/detailed)  
4. Предварительный итог (anti-double-count) — **скрыт от crew**  
**Запрет:** calc iframe + полный quote editor + ObjectsPanel на одном viewport.

## CTA (primary → secondary)
Primary зависит от фазы: Добавить комнату · Открыть сделку · Создать sequential Deal (если closed+deferred) · Назначить  
Secondary: Изменить контакты · Архив (**Assumption:** явный archive)

## Данные
Project; Rooms[]; Deals[] (active + history); QuoteRevisions активной Deal; Assignments.

## Переходы
Room → E-room; Deal tab → E-quote-deal; Sequential CTA → create Deal (new dealId) → E-quote-deal.

## Состояния
- loading: skeleton  
- empty rooms: CTA добавить комнату  
- error: partial fail banner  
- offline: read cache; write queued

## Mobile
Вкладки sticky; комнаты списком.

## RBAC
crew: нет commercial total; видит только assigned install rooms.  
admin: read aggregates/diagnose; **no delete**.  
sales: outcome/confirm; owner: A на закрытие Deal.

## Acceptance Criteria
- AC-PR-01: при Deal closed + deferred проект **не** в UX Done; видна CTA новая Deal  
- AC-PR-02: история показывает прошлые dealId immutable  
- AC-PR-03: crew не видит сумму принятого заказа проекта  
- AC-PR-04: вкладка Сделка не смешивает монтажный чек-лист

