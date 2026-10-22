# E-calc-save — Сохранение расчёта и bind (quick)

**Revision:** `rev-gate-b-draft-1` · **Gate B** · зависит от [D3](../03-information-architecture.md)

## Кто
sales, owner, measurer.

## Зачем
Явно сохранить preliminary или detailed в комнату; при отсутствии контекста — bind/create.

## Вход
CTA Save из Calc (D7); аналогично Save профиля из PM (D6).

## Иерархия viewport (одна работа)
1. Тип сохранения: Preliminary estimate **или** Detailed (схема+BOM) — явное различие  
2. Если room известна: подтверждение «в комнату X»  
3. Если нет: E-quick-bind — pick existing / create project+room  
4. Результат: success → E-room  
**Порядок:** result → Save → bind → persist (ADR-007).

## CTA (primary → secondary)
Primary: Сохранить. Secondary: Сохранить как detailed (если из area) · Отмена (draft остаётся).

## Данные
SessionDraft; CalculationRevision; Project/Room ids; pendingSync.

## Переходы
Успех → E-room; при уже sent КП — warning «нужна Quote N+1» (не авто-patch).

## Состояния
- loading: persist spinner  
- error: retry; draft не теряется  
- offline: outbox; UI «сохранено локально»  
- conflict: last-write-wins + warning (**Assumption** D7)

## Mobile
Full-screen sheet.

## RBAC
По правам detailed (measurer; sales if allowed).

## Acceptance Criteria
- AC-CS-01: Save без bind невозможен  
- AC-CS-02: preliminary не вытесняет detailed без явного подтверждения  
- AC-CS-03: anti-loss: закрытие tool с несохранённым → confirm  
- AC-CS-04: sent Quote не пересчитывается

