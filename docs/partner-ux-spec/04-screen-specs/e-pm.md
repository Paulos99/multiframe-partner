# E-pm — Проблемомер (кабинет)

**Revision:** `rev-gate-b-draft-1` · **Gate B APPROVED 2026-10-23** · зависит от [D3](../03-information-architecture.md)

## Кто
sales, owner, measurer.

## Зачем
Сформировать потребность в ЗИ в контексте натяжного; сохранить профиль в комнату.

## Вход
Из комнаты / tools / quick-entry.

## Иерархия viewport (одна работа)
См. полный сценарий [D6](../06-probleмомер-ceiling.md). Viewport: один шаг потока (Room params → Result), не стек с проектом.

## CTA (primary → secondary)
Next steps на Result: Сохранить в комнату · Рассчитать · Bind · К проекту (не только lead StP).

## Данные
Acoustic answers snapshot; profile document; roomId.

## Переходы
Save → E-room / bind; Calc → E-calc; Back → E-room/tools.

## Состояния
loading Processing; error model fail; offline draft answers.

## Mobile
Mobile sticky CTA.

## RBAC
crew read-only profile.

## Acceptance Criteria
- AC-PM-01: нет вопроса типа потолка в main path  
- AC-PM-02: можно пропустить PM → calc  
- AC-PM-03: next step сохраняет project/room context  
Детали AC — D6.

