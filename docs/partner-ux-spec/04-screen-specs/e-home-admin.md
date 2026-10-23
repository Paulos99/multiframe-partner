# E-home-admin — Home StP admin

**Revision:** `rev-gate-b-draft-2` · **Gate B · APPROVED 2026-10-23** · aliases: часть `E-home`

## Кто / зачем
StP admin: сигналы сети → PartnerCard / case; не полевой CRM партнёра.

## Первый viewport
1. «Сеть · Сигналы»  
2. Inbox сигналов (funnel_stall, tool_underuse, no_multiframe_offer, early_loss_cluster, support_cta)  
3. Primary CTA: **Открыть сигнал** → PartnerCard

## Приоритет
1. support_cta open  
2. reliable signals (N≥ порога D10)  
3. insufficient_observations — ниже / с меткой

## CTA → destination
| CTA | Destination |
|-----|-------------|
| Сигнал | [E-partner-card](./e-partner-card.md) |
| Training gap | [E-analytics-training](./e-analytics-training.md) (отдельно) |
| Materials (secondary nav) | E-materials |

## Скрыто
Чужие проекты списком CRM; delete partner projects; sales KPI mixed with training on same widget.

## Состояния
empty: «Нет сигналов — смотрите Partners»; first-time: tip контура 5 шагов.

## AC
- AC-HA-01: home ≠ список чужих JobObjects  
- AC-HA-02: training signals ведут в training slice, не в conversion  
- AC-HA-03: delete project недоступен  
