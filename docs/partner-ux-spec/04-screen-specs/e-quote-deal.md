# E-quote-deal — Сделка: КП и follow-up

**Revision:** `rev-gate-b-draft-2` · **Gate B · APPROVED 2026-10-23** · aliases: `E-project-deal`, `E-deal`, `E-quote`  
**Зависит от:** [D3](../03-information-architecture.md), [D8](../08-commercial-process.md), [D5](../05-data-model-contracts.md)

## Кто
sales (R), owner (A); measurer — limited create? (**Assumption:** measurer не confirm_sent — D2).

## Зачем
Вести воронку Deal; версии КП; confirm_sent; outcome; roomAssent; early loss/**pause**; sequential next Deal.

## Вход
Вкладка Сделка на E-project; inbox next actions.

## Иерархия viewport (одна работа)
1. Шапка активной Deal: stage · outcome · dealId · (если paused — бейдж «Пауза»)  
2. Секция КП: список QuoteRevision **этой** Deal (N…); статус lifecycle  
3. Секция согласия: roomAssent per room (`ordered|deferred|out_of_scope|unknown|needs_review`)  
4. Секция follow-up: nextActionAt · lossReason · early outcome  
5. История: read-only прошлые Deal (другие dealId)  
**Одна работа за раз:** редактор КП **или** outcome/pause sheet — не оба полноэкранно.

## CTA (primary → secondary)
Primary по stage: Создать КП · Confirm sent · Зафиксировать outcome · **Возобновить** (pause) · Создать следующую Deal (только после closed)  
Secondary: Share · PDF · Copy (≠ sent) · **Пауза** · Early decline  
**Раздельные CTA:** Пауза ≠ Отказ ≠ Закрыть.

## UX texts (высокие ставки)
- Copy/PDF: «Скопировано / PDF готов» — **не** «КП отправлено»  
- Confirm: «Отправка подтверждена»  
- Pause: «Сделка на паузе — можно возобновить»  
- Decline: «Сделка закрыта отказом»  
- needs_review assent: «Требует сверки — не в монтаже»

## Данные
Deal; QuoteRevision[] where dealId; roomAssent; Assignments; lossReason; stageAtOutcome.

## Переходы
confirm_sent → stage quote_sent_confirmed.  
pause → active+early_paused; resume → same dealId.  
early_declined → closed.  
outcome accepted → tech-ready gate для install (только ordered).  
closed + deferred → CTA новая Deal (new dealId).  
N+1 quote → новый экземпляр на той же Deal.

## Состояния
- empty quotes: CTA создать (Deal без Quote = норма)  
- error: идемпотентность confirm  
- offline: queue outcome/confirm с предупреждением  
- immutable: UI блокирует edit sent; предлагает N+1

## Mobile
Desktop preferred; mobile: секции accordion.

## RBAC
sales confirm_sent+outcome+pause; owner A; crew нет; admin read aggregates.

## Acceptance Criteria
- AC-D-01: dealId на каждой QuoteRevision обязателен (новые)  
- AC-D-02: sent immutable; edit → N+1  
- AC-D-03: early decline требует reason+stage → closed  
- AC-D-04: sequential = новый dealId; старая в истории  
- AC-D-05: copy/PDF не ставят sent  
- AC-D-06: partial assent: deferred/unknown/needs_review не в crew inbox  
- AC-D-07: pause resume same dealId; pause ≠ close  
См. D8.

