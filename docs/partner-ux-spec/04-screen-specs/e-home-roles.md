# E-home — Пять домашних экранов (тонкие маршрутизаторы фокуса)

**Revision:** `rev-gate-b-draft-1` · **Gate B** · зависит от [D3](../03-information-architecture.md)

## Кто
admin / owner / sales / measurer / crew — **разный фокус, одна IA**.

## Зачем
Показать next actions и быстрый вход в сущность; не дублировать полный каталог + КП + tools стеком.

## Вход
После login; пункт «Сегодня / Inbox» в nav.

## Иерархия viewport (одна работа)
**Общий каркас (все роли):**  
1. Заголовок роли + краткий фокус дня  
2. Inbox next actions (макс. N карточек, N **Assumption**=8)  
3. Одна primary CTA зона (новый проект / quick-entry / открыть задание)  
**Запрет:** ObjectsPanel + CommercialPanel + EntryPoints + Academy на одном scroll (ADR-003).

| Роль | Inbox focus | Primary CTA | Secondary |
|------|-------------|-------------|-----------|
| admin | Сигналы сети / открытые cases | Открыть PartnerCard / сигнал | Материалы |
| owner | Сегодня: сделки + назначения + проекты без next action | Новый проект | Staff / Компания |
| sales | Сделки: confirm_sent, outcome, tech-ready, sequential Deal | Quick-entry **или** Новый проект | Проекты |
| measurer | Черновики / замеры / detailed pending | Продолжить комнату / Новый с поля | Tools |
| crew | Задания install (ordered+tech-ready) | Открыть монтаж | — |

## CTA (primary → secondary)
Зависит от роли (таблица выше). Quick-entry у sales/owner/measurer — не у crew/admin.

## Данные
NextAction[] (производное от Deal.stage/outcome, Room.status, tech-ready, SupportCase, signals). Не SoT.

## Переходы
Карточка inbox → E-project / E-room / E-project-deal / E-room-install / E-partner-card.  
CTA новый проект → E-inquiry. Quick → E-pm или E-calc.

## Состояния
- loading: skeleton inbox  
- empty: «Нет задач на сегодня» + primary CTA создать/quick  
- error: баннер sync; действия доступны из кэша если есть  
- offline: inbox из local cache; пометка устарело

## Mobile
Mobile-first для measurer/crew: inbox → tap → сущность. Desktop для owner/sales/admin.

## RBAC
admin: только сеть. crew: только свои assignments. sales: без create staff.

## Acceptance Criteria
- AC-H-01: на home нет вертикального стека ≥3 несвязанных модулей  
- AC-H-02: crew inbox не содержит deferred и не-tech-ready  
- AC-H-03: sales видит next action «создать sequential Deal» при closed+deferred  
- AC-H-04: admin home не показывает чужие проекты списком CRM

