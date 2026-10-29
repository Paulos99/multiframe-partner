# E-install — Монтажное задание

**Revision:** `rev-gate-b-draft-1` · **Gate B APPROVED 2026-10-23** · зависит от [D3](../03-information-architecture.md)

## Кто
crew (R); sales/owner — обзор/снятие blocker.

## Зачем
Пройти чек-лист; зафиксировать blocker; закрыть комнату. Не коммерция.

## Вход
Crew home / room CTA когда ordered+tech-ready+accepted.

## Иерархия viewport (одна работа)
1. Комната · адрес · техсмета (цены OK)  
2. Чек-лист (обязателен; N/A с причиной)  
3. Blockers  
4. Закрыть комнату  
**Нет:** project commercial total; клиентское КП; Deal outcome.

## CTA (primary → secondary)
Primary: Отметить пункт / Закрыть комнату. Secondary: Зафиксировать препятствие · Связаться с ответственным.

## Данные
Room.status; InstallChecklist; Blockers; tech estimate docs; Assignments.

## Переходы
Close → room closed (Deal не auto-accepted). Blocker → notify sales/owner.

## Состояния
- empty checklist: шаблон по умолчанию  
- error: нельзя closed при open blocker (**Assumption** D11)  
- offline: checklist local + sync  
- waive: только по политике Gate B (**Assumption** — редкие исключения owner)

## Mobile
Mobile-first крупные чекбоксы.

## RBAC
crew execute; sales/owner resolve blocker; measurer может снять tech blocker.

## Acceptance Criteria
- AC-IN-01: чек-лист обязателен для closed  
- AC-IN-02: N/A требует reason  
- AC-IN-03: closed ≠ Deal.accepted  
- AC-IN-04: нет commercial total проекта у crew  
- AC-IN-05: вход только ordered+tech-ready+accepted

