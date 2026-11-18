# E-room — Карточка комнаты

**Revision:** `rev-gate-b-draft-1` · **Gate B APPROVED 2026-10-23** · зависит от [D3](../03-information-architecture.md)

## Кто
measurer, sales, owner; crew при install assignment.

## Зачем
Исполнение помещения: профиль, calc types, документы, tech-ready, вход в монтаж.

## Вход
Из проекта / inbox / после save tool.

## Иерархия viewport (одна работа)
1. Шапка: roomName · статус исполнения · badges prelim/detailed/tech-ready  
2. Блок документов (профиль / сметы версии)  
3. CTA зона: PM · Calc prelim · Calc detailed · Монтаж (если allowed)  
4. Assignments / blocker summary  
**Не** показывать: редактор КП, commercial total проекта, wall mode.

## CTA (primary → secondary)
Primary: контекстный next step (Save detailed / Открыть монтаж / Запустить PM)  
Secondary: История документов · Запросить помощь StP

## Данные
Room (JobObject); calculation.preliminary/detailed; documents; checklist summary; Blockers; Deal.roomAssent для этой room.

## Переходы
→ E-pm, E-calc, E-install, E-room-docs; назад → E-project.

## Состояния
- loading: skeleton  
- empty docs: CTA запустить PM/Calc  
- error: sync fail на pendingSync  
- offline: работа с draft; Save в outbox

## Mobile
Sticky CTA; документы списком.

## RBAC
sales detailed — при разрешении (§8.12).  
crew: техсмета с ценами; **не** клиентское КП; **не** project commercial total.  
ярлык quote_sent — **нет** в UI.

## Acceptance Criteria
- AC-R-01: preliminary не помечается как схема  
- AC-R-02: tech-ready только при detailed+материалы+ответственный  
- AC-R-03: изменение calc не меняет sent QuoteRevision  
- AC-R-04: deferred room не предлагает «Открыть монтаж» текущей Deal

