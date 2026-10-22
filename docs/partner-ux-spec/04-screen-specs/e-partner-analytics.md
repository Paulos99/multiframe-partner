# E-analytics — Аналитика партнёра / сети

**Revision:** `rev-gate-b-draft-2` · **Gate B · NOT approved** · зависит от [D3](../03-information-architecture.md), [D10](../10-stp-support-analytics.md)

## Кто
admin (сеть); owner/sales (компания).

## Зачем
Воронка по Deal.outcome; сумма accepted отдельно; early losses; tool use; training **отдельный** срез; честный знаменатель консультаций.

## Вход
Nav Аналитика.

## Иерархия viewport (одна работа)
1. Переключатель: Продажи | Обучение (→ [E-analytics-training](./e-analytics-training.md))  
2. Воронка dealId-based  
3. Early loss by stage  
4. Tool adoption + **offer rate with N + coverage warning** (D10 §3.3)  
**Не** смешивать training в conversion; **не** подписывать offer rate как «все консультации компании».

## CTA (primary → secondary)
Primary: Drill to PartnerCard (admin) / to Deal list filter. Secondary: Export (**Assumption** A-35 P1).

## Данные
Deal funnel aggregates; accepted amount; consultation_started (work) denominator; training aggregates separately.

## Переходы
Click segment → filtered projects/deals.

## Состояния
empty org: zeros; insufficient N label; error query; offline last snapshot.

## Mobile
Desktop charts; mobile KPI cards.

## RBAC
canSeeOrgAnalytics; crew нет.

## Acceptance Criteria
- AC-AN-01: conversion = count outcome=accepted by dealId  
- AC-AN-02: accepted amount — отдельная метрика  
- AC-AN-03: training не входит в conversion  
- AC-AN-04: early_* видны в потерях до КП  
- AC-AN-05: offer rate показывает N + coverage warning (AC-D10-09)  
