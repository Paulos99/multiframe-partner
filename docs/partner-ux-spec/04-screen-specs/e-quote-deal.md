# E-quote-deal — Сделка: КП и follow-up

**Revision:** `rev-gate-b-draft-1` · **Gate B** · зависит от [D3](../03-information-architecture.md)

## Кто
sales (R), owner (A); measurer — limited create? (**Assumption:** measurer не confirm_sent — D2).

## Зачем
Вести воронку Deal; версии КП; confirm_sent; outcome; roomAssent; early loss; sequential next Deal.

## Вход
Вкладка Сделка на E-project; inbox next actions.

## Иерархия viewport (одна работа)
1. Шапка активной Deal: stage · outcome · dealId  
2. Секция КП: список QuoteRevision **этой** Deal (N…); статус lifecycle  
3. Секция согласия: roomAssent per room  
4. Секция follow-up: nextActionAt · lossReason · early outcome  
5. История: read-only прошлые Deal (другие dealId)  
**Одна работа за раз:** редактор КП **или** outcome sheet — не оба полноэкранно.

## CTA (primary → secondary)
Primary по stage: Создать КП · Confirm sent · Зафиксировать outcome · Создать следующую Deal  
Secondary: Share · PDF · Copy (≠ sent) · Early decline

## Данные
Deal; QuoteRevision[] where dealId; roomAssent; Assignments; lossReason; stageAtOutcome.

## Переходы
confirm_sent → stage quote_sent_confirmed.  
outcome accepted → tech-ready gate для install.  
closed + deferred → CTA новая Deal (new dealId) → contact.  
N+1 quote → новый экземпляр на той же Deal.

## Состояния
- empty quotes: CTA создать  
- error: идемпотентность confirm  
- offline: queue outcome/confirm с предупреждением  
- immutable: UI блокирует edit sent; предлагает N+1

## Mobile
Desktop preferred; mobile: секции accordion.

## RBAC
sales confirm_sent+outcome; owner A; crew нет; admin read aggregates.

## Acceptance Criteria
- AC-D-01: dealId на каждой QuoteRevision обязателен (новые)  
- AC-D-02: sent immutable; edit → N+1  
- AC-D-03: early decline требует reason+stage  
- AC-D-04: sequential = новый dealId; старая в истории  
- AC-D-05: copy/PDF не ставят sent  
- AC-D-06: partial assent: deferred не в crew inbox  
См. D8.

