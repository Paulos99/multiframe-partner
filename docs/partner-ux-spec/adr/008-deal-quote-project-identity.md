# ADR-008 — Идентичность Deal / QuoteRevision / Project (три корректировки Gate A)

- **Статус:** Accepted (`rev-gate-a-approved-20261022`)
- **Дата:** 2026-10-22
- **Опора:** §8 final-candidate + явные правки заказчика; уточняет [ADR-004](./004-deal-separate-from-room-status.md)

## Контекст

В `rev-gate-a-final-candidate` уже было: sequential Deal после `closed`, sent QuoteRevision immutable, partial assent / deferred. Три места оставались двусмысленными и могли сломать историю или смешать сущности:

1. Диаграмма Deal `closed → contact` читалась как «переоткрыть ту же сделку».  
2. QuoteRevision N+1 не была явно привязана к **конкретной** Deal (в shared `dealId` ещё nullable).  
3. UX-фаза Project `Done` после `deal_closed` выглядела как «закрыли Deal = завершили Project», хотя deferred-комнаты и повторные заказы живут в том же проекте.

## Решение

### 1. Deal: после закрытия — новый `dealId`

| Правило | Смысл |
|---------|--------|
| Закрытая Deal | **Неизменна** в истории проекта (stage/outcome/roomAssent/суммы принятого заказа не переписываются) |
| Следующая sequential Deal | **Новый** экземпляр с **новым `dealId`** в том же `projectId` |
| Запрет | Reopen / recycle того же `dealId`; параллельные активные Deal |

Переход в UX «после closed снова contact» = **создание новой Deal**, не возврат старой в `contact`.

### 2. QuoteRevision: sent immutable; N+1 = новый документ на Deal

| Правило | Смысл |
|---------|--------|
| После `sent_confirmed` | Экземпляр **immutable** (суммы, состав комнат, snapshot calc) |
| Пересмотр / новый calc / новый состав | **Новый** экземпляр QuoteRevision (N+1), не patch sent |
| Привязка | Каждая QuoteRevision **обязательно** принадлежит **одной** Deal (`dealId` обязателен для новых записей) |
| История | Sent-версии прошлых Deal остаются в истории **своей** Deal; не «переезжают» на следующую |

Параллельные КП разным ЛПР в **одной** активной Deal = версии одной Deal, не вторая Deal.

### 3. Project ≠ закрытие одной Deal

| Правило | Смысл |
|---------|--------|
| Закрытие Deal | Завершает **коммерческую нить**, не обязательно Project |
| Project остаётся Active | Есть `deferred`-комнаты, незакрытые комнаты вне текущего заказа, или планируется / создаётся следующая Deal |
| Project Done (UX) | Только когда нет активной Deal **и** нет отложенной работы по комнатам (все релевантные комнаты closed / out_of_scope) **или** явное архивирование проекта (деталь — Gate B) |

Конверсия и аналитика считаются **по `dealId`**, не по «проект закрыт».

## Отвергнутые альтернативы

| Альтернатива | Почему нет |
|--------------|------------|
| Reopen closed Deal тем же id | Ломает историю outcome / сумму принятого заказа / StP-аудит |
| QuoteRevision только на projectId без dealId | Невозможно развести КП первой и второй sequential Deal |
| Project Done = Deal closed | Ломает deferred и повторные заказы в одном адресе клиента |

## Следствия

- D1 иерархия: `Deal → QuoteRevision[]`; Project хранит историю Deal[].  
- D3: Project state diagram не ставит Done только из `deal_closed`; Deal diagram помечает новый `dealId`.  
- D2 S-x-07 / S-sales: следующая Deal = create, не reopen.  
- Gate B / D5: `dealId` на QuoteRevision обязателен для новых; миграция nullable → backfill.  
- ADR-004 остаётся в силе; этот ADR **уточняет идентичность**, не отменяет SoT.
