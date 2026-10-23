# E-tools — Инструменты (хаб PM / Calc)

**Revision:** `rev-gate-b-draft-1` · **Gate B APPROVED 2026-10-23** · зависит от [D3](../03-information-architecture.md)

## Кто
sales, owner, measurer; crew — secondary просмотр схемы (без persist сметы).

## Зачем
Выбрать инструмент с явным контекстом комнаты **или** quick-entry.

## Вход
Nav Инструменты.

## Иерархия viewport (одна работа)
1. Две карточки: Проблемомер · Калькулятор потолка  
2. Переключатель контекста: «В комнате X» / «Быстрый старт без проекта»  
3. **Не** стек последних объектов + CommercialPanel.

## CTA (primary → secondary)
Primary: Открыть PM / Открыть Calc. Secondary: Выбрать комнату.

## Данные
Опциональный roomId/projectId в session; иначе SessionDraft.

## Переходы
→ E-pm / E-calc; Save без контекста → E-calc-save bind / E-quick-bind.

## Состояния
- empty: нет комнат → предложить quick или создать проект  
- offline: tool может работать локально; persist в outbox

## Mobile
Две крупные кнопки.

## RBAC
crew: calc/PM persist запрещён (просмотр help).

## Acceptance Criteria
- AC-T-01: вход без комнаты не создаёт orphan до Save→bind  
- AC-T-02: walls не в UI потолочников

