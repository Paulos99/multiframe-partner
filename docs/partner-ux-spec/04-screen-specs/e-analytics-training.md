# E-analytics-training — Срез обучения (отдельно от продаж)

**Revision:** `rev-gate-b-draft-2` · **Gate B · NOT approved**  
**Alias:** не смешивать с `E-analytics`

## Кто
admin (сеть); owner — опционально org training progress (read).

## Зачем
LearningAttempt / training_* метрики; **не** конверсия Deal.

## Вход
Nav «Обучение / аналитика обучения» · deep-link с PartnerCard training_gap.

## Иерархия
1. Заголовок «Обучение» + явное предупреждение «не KPI продаж»  
2. Attempts: assigned / started / completed / abandoned  
3. Score distribution · errorTypes  
4. Scenario breakdown (sell_multiframe, objections, …)

## CTA
Открыть Academy hub · Assign training (admin).

## Данные
context=training only; excluded from countsTowardSalesKpi.

## AC
- AC-AT-01: виджет не пишет в sales funnel  
- AC-AT-02: completed attempt не создаёт Deal.outcome  
- AC-AT-03: визуально отделён от E-analytics conversion  
