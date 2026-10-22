# E-analytics — Аналитика партнёра / сети

**Revision:** `rev-gate-b-draft-1` · **Gate B** · зависит от [D3](../03-information-architecture.md)

## Кто
admin (сеть); owner/sales (компания).

## Зачем
Воронка по Deal.outcome; сумма accepted отдельно; early losses; tool use; training **отдельный** срез.

## Вход
Nav Аналитика.

## Иерархия viewport (одна работа)
1. Переключатель: Продажи | Обучение  
2. Воронка dealId-based  
3. Early loss by stage  
4. Tool adoption  
**Не** смешивать training в conversion.

## CTA (primary → secondary)
Primary: Drill to PartnerCard (admin) / to Deal list filter. Secondary: Export (**Assumption** P1).

## Данные
Deal funnel aggregates; accepted amount; training aggregates.

## Переходы
Click segment → filtered projects/deals.

## Состояния
empty org: zeros; error query; offline last snapshot.

## Mobile
Desktop charts; mobile KPI cards.

## RBAC
canSeeOrgAnalytics; crew нет.

## Acceptance Criteria
- AC-AN-01: conversion = count outcome=accepted by dealId  
- AC-AN-02: accepted amount — отдельная метрика  
- AC-AN-03: training не входит в conversion  
- AC-AN-04: early_* видны в потерях до КП

