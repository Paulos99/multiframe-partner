# ADR-004 — Deal отдельно от статуса комнаты; одна активная сделка; SoT коммерции

- **Статус:** Accepted (`rev-gate-a-approved-20261022`); уточнение идентичности — [ADR-008](./008-deal-quote-project-identity.md)
- **Дата:** 2026-10-22
- **Опора:** SDD rulings, `packages/shared/deal.ts`, `quote.ts`; ревизии draft-2, final-candidate, approved

## Контекст

Исторически `JobObjectStatus` включает `quote_sent` и `closed`. Коммерческий процесс вынесен в Deal/Quote: copy≠sent, closed≠accepted. UI nextActions всё ещё опирается на статусы объекта — источник путаницы (P0-разрыв A1 в D0).

В draft-1 D1 фиксировал «одна активная Deal», а review оставлял это открытым вопросом — противоречие. Также Quote-диаграмма содержала accept/decline на самом КП, дублируя outcome сделки.

В draft-2: S-x-07 допускал `deferred→ordered` на той же активной Deal, а D3 закрывал Deal после ordered — противоречие с повторным заказом. Воронка фиксировала outcome только после КП — StP не видел потери на консультации/демо. Живой calc мог неявно «обновлять» уже отправленное КП.

## Решение

### A. Источники истины (SoT)

| Вопрос | SoT | Производное / не SoT |
|--------|-----|----------------------|
| Исход сделки (продажа / отказ / отложено / early) | **Deal.outcome** (явный) | — |
| Этап при early decline/pause | **Deal.stageAtOutcome** (или эквивалент) | — |
| Позиция в коммерческой воронке | **Deal.stage** | UX-индикаторы проекта (`ReadyForQuote`, `InCommercial`…) |
| Версия и lifecycle документа КП | **QuoteRevision** (`created` → `shared` → `sent_confirmed`) | после `sent_confirmed` — **immutable** |
| Факт «КП ушло клиенту» | **confirm_sent** на QuoteRevision | copy / PDF / share **не** = sent |
| Исполнение помещения | **Room.status** (draft → measured → tech-ready → install → closed) | ярлык `quote_sent` на комнате — **убрать из нового UI**; совместимость данных сохранить |
| Успешная продажа | `Deal.outcome = accepted` | ≠ все комнаты closed |
| Завершённый монтаж | комнаты `ordered` + tech-ready → `closed` | ≠ конверсия |
| Конверсия в аналитике | **Deal.outcome = accepted** (по dealId) | отдельно — **сумма принятого заказа**; не `quote_created`, не `room.closed`, не training |

Правило: `jobClosedImpliesDealAccepted === false`. Система **не** ставит outcome из `room.closed`.

### B. Quote ↔ Deal (без двойной записи исхода; immutability sent)

- QuoteRevision **не** несёт accept/decline/postponed — только жизненный цикл **документа**.  
- После `sent_confirmed` revision **неизменна**: изменение calc комнаты **не** пересчитывает суммы/состав уже отправленной версии.  
- Новые параметры / пересчёт → **новый экземпляр** QuoteRevision (N+1), привязанный к **той же активной Deal** (`dealId` обязателен). Деталь snapshot — Gate B / D5.  
- После `sent_confirmed` sales фиксирует **Deal.outcome**; при пересмотре создаёт N+1 на **этой** Deal.  
- Advance `Deal.stage` до `quote_sent_confirmed` — следствие confirm_sent; исход — отдельный явный шаг.  
- Уточнение: [ADR-008](./008-deal-quote-project-identity.md).

### C. Одна активная Deal + sequential следующая (первая версия)

- **Всегда:** одна **активная** коммерческая сделка на проект.  
- **После `closed`:** **новый `dealId`** — следующая sequential Deal в том же проекте (повторный заказ deferred / новый заказ). Закрытая Deal **неизменна** в истории.  
- **Нет** reopen того же `dealId`; **нет** параллельного multi-order UI в первой версии.  
- Параллельные КП разным ЛПР в одной активной сделке = **версии QuoteRevision**, не вторая Deal.  
- **Закрытие Deal ≠ завершение Project**, если есть deferred или последующие заказы ([ADR-008](./008-deal-quote-project-identity.md)).

### D. Частичное согласие (partial assent) и повторный заказ deferred

В рамках одной Deal клиент может заказать не все комнаты:

| Согласие по комнате | Смысл |
|---------------------|--------|
| `ordered` | Входит в принятый заказ / монтаж **текущей** Deal |
| `deferred` | Отложена; остаётся в проекте, не в текущем монтаже |
| `out_of_scope` | Не в этой сделке |

Отражение:

- **КП** — явно помечает, какие комнаты в этой версии / какие отложены.  
- **Deal** — хранит карту согласия; outcome `accepted` допускает частичный набор `ordered`.  
- **Монтаж** — в install только `ordered` + **tech-ready**; `deferred` не в inbox crew.  
- **Активация deferred:** после закрытия текущей Deal — **новая sequential Deal с новым `dealId`** в том же проекте (`deferred→ordered` в новой сделке + новая QuoteRevision на **новой** Deal). Не держать «вечную» активную Deal ради отложенных; Project при этом **не** обязан стать Done.

### E. Ранние отказы / паузы до КП

На этапах contact / offered / assessed / calculated sales может зафиксировать **early_declined** или **early_paused** с **причиной** и указанием **этапа**. Иначе StP не видит потери до воронки КП.

### F. Монтаж только после accepted + tech-ready

Передача бригаде — после `outcome=accepted` (не раньше). Preliminary в КП ≠ готовность к монтажу (см. D1 §5.6).

## Отвергнутые альтернативы

| Альтернатива | Почему нет |
|--------------|------------|
| Вернуть всю воронку в JobObjectStatus | Невозможно честно моделировать КП по нескольким комнатам и assignments |
| Автосинк room.quote_sent ↔ deal | Скрытая связность; двойная запись |
| Убрать статусы комнаты совсем | Бригаде и замеру нужен операционный прогресс |
| Accept/decline на Quote как SoT | Дубль с Deal.outcome; версии КП путаются с исходом |
| `deferred→ordered` на закрытой / «вечной» активной Deal | Противоречит закрытию Deal после ordered; путает повторный заказ |
| Параллельные активные Deal в P0 | Усложняет UX; заказчик выбрал sequential |
| Живой пересчёт sent QuoteRevision | Ломает историю обещания клиенту |
| Outcome только после КП | Слепая воронка для StP на консультации/демо |

## Следствия

- Next actions sales строить от Deal.stage/outcome + готовности комнат + early losses.  
- Аналитика: конверсия = accepted; отдельно сумма принятого заказа; early losses по этапу.  
- `quote_sent` на комнате — убрать из нового UI; совместимость данных — Gate B.  
- D1/D2/D3/review согласованы: одна активная + sequential следующая; sent immutable.
