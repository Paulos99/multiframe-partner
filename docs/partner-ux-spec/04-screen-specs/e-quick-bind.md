# E-quick-bind — Привязка draft после tool

**Revision:** `rev-gate-b-draft-2` · **Gate B · APPROVED 2026-10-23**  
**Зависит от:** [D3 §3b](../03-information-architecture.md), [ADR-007](../adr/007-quick-entry-without-full-client-card.md), [D5 A-11](../05-data-model-contracts.md)

## Кто
sales, owner, measurer (не crew/admin).

## Зачем
После результата PM/Calc и Save — выбрать или создать Project+Room (+ Deal при create) до persist. Нет безымянных объектов.

## Вход
Save из session draft без room context ([E-calc-save](./e-calc-save.md) / E-pm).

## Иерархия (одна работа)
1. Заголовок: «Куда сохранить?» + тип (предварительный / со схемой / профиль PM)  
2. Вкладка **Выбрать существующие**: поиск проекта → список комнат → preview (имя, адрес опц., последний calc)  
3. Вкладка **Создать**: ярлык проекта (обязателен) · имя комнаты (обязателен) · телефон/адрес опциональны  
4. Confirm persist · Cancel → обратно в draft

## Поля / валидация
| Поле | Create | Pick | Правила |
|------|--------|------|---------|
| projectLabel / name | required | — | не пустой, trim |
| roomName | required | required (выбор) | не пустой |
| clientPhone / address | optional | — | до confirm_sent можно дополнить на E-project |
| Idempotency-Key | = draftId | = draftId | повтор confirm → те же ids (A-11) |

## Preview данных
Перед confirm: тип save, сумма/площадь если есть, «будет создана Deal (contact)» при create.

## CTA
Primary: **Сохранить в комнату**. Secondary: Отмена (draft жив). Contextual back: в tool с dirty draft intact.

## Переходы
Success → E-room; Cancel → tool session; Stale project list → refresh + toast.

## Состояния
loading search; empty search «Создайте проект»; error network + retry; offline: queue bind после sync с тем же draftId; recovery: повтор не дублирует (AC-A11-02).

## UX texts
- «Черновик ещё не на сервере» до confirm  
- После: «Сохранено в комнату «X»»  
- При create: «Созданы проект, комната и сделка»

## RBAC
По правам create project/room в org.

## AC
- AC-QB-01: Save без confirm bind не создаёт Project  
- AC-QB-02: create atomic Project+Room+Deal  
- AC-QB-03: duplicate draftId → один roomId  
- AC-QB-04: cancel → 0 новых сущностей  
- AC-QB-05: повторный save того же draft → та же комната  
