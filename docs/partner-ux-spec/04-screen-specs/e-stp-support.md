# E-stp-support — Помощь StP / Partner support

**Revision:** `rev-gate-b-draft-1` · **Gate B APPROVED 2026-10-23** · зависит от [D3](../03-information-architecture.md)

## Кто
Партнёр (owner/sales/…) создаёт case; admin ведёт контур.

## Зачем
Сигнал → диагностика → intervention → verify tools → outcomes.

## Вход
CTA «Помощь» / admin сигнал / PartnerCard.

## Иерархия viewport (одна работа)
1. Контекст модуля (без ПД клиента)  
2. Категория / описание  
3. Для admin: диагностика · intervention · verify  
**Не** полевой CRM чужой компании.

## CTA (primary → secondary)
Primary: Отправить обращение / Зафиксировать intervention. Secondary: Открыть Academy материал.

## Данные
SupportCase; Intervention; tool-usage aggregates; без client PII в payload.

## Переходы
Admin → PartnerCard; verify → analytics training vs sales.

## Состояния
loading; error unsafe PII blocked; offline queue.

## Mobile
Desktop admin; mobile create case.

## RBAC
admin no delete foreign projects; org isolation.

## Acceptance Criteria
- AC-S-01: payload без client PII  
- AC-S-02: контур 5 шагов документирован в UI admin  
Детали — D10.

