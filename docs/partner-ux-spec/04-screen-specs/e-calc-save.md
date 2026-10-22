# E-calc-save — Сохранение расчёта и bind (quick)

**Revision:** `rev-gate-b-draft-2` · **Gate B · NOT approved** · зависит от [D3](../03-information-architecture.md), [D5](../05-data-model-contracts.md), [D7](../07-calculator-ceiling.md)

## Кто
sales, owner, measurer.

## Зачем
Явно сохранить preliminary или detailed в комнату; при отсутствии контекста — bind/create; сохранить обе ветки при конфликте.

## Вход
CTA Save из Calc (D7); аналогично Save профиля из PM (D6).

## Иерархия viewport (одна работа)
1. Тип сохранения: Preliminary estimate **или** Detailed (схема+BOM) — явное различие  
2. Если room известна: подтверждение «в комнату X» + индикатор текущей `revision`  
3. Если нет: [E-quick-bind](./e-quick-bind.md) — pick existing / create project+room  
4. Результат: success → E-room  
**Порядок:** result → Save → bind → persist (ADR-007).

## CTA (primary → secondary)
Primary: Сохранить. Secondary: Сохранить как detailed (если из area) · Отмена (draft остаётся) · При 409: Сравнить версии.

## Данные
SessionDraft; CalculationRevision (append-only); `expectedRevision`/ETag; Project/Room ids; pendingSync; Idempotency-Key=draftId.

## Переходы
Успех → E-room; при уже sent КП — warning «нужна Quote N+1» (не авто-patch); conflict → compare sheet → retry с выбранной base.

## Состояния
- loading: persist spinner  
- error: retry; draft не теряется  
- offline: outbox; UI **«Сохранено локально»** (≠ «на сервере»)  
- server ack: **«Сохранено на сервере»**  
- conflict (**409**): обе revision recoverable; **запрет** silent LWW (GB-P0-03)

## Mobile
Full-screen sheet.

## RBAC
По правам detailed (measurer; sales if allowed).

## Acceptance Criteria
- AC-CS-01: Save без bind невозможен  
- AC-CS-02: preliminary не вытесняет detailed без явного подтверждения  
- AC-CS-03: anti-loss: закрытие tool с несохранённым → confirm  
- AC-CS-04: sent Quote не пересчитывается  
- AC-CS-05: stale expectedRevision → 409 + compare; история содержит обе  
- AC-CS-06: тексты local vs server различимы

