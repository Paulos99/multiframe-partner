# E-partner-card — Карточка партнёра (StP)

**Revision:** `rev-gate-b-draft-2` · **Gate B APPROVED 2026-10-23**  
**Зависит от:** [D10](../10-stp-support-analytics.md)

## Кто
admin (StP). Owner/sales своей org — **не** этот экран (у них E-analytics компании).

## Зачем
Контур помощи: сигнал → диагностика → intervention → verify → outcomes. Агрегаты + ограниченная диагностика; **не** полевой CRM.

## Вход
E-home-admin сигнал · E-partners список · E-support case context.

## Иерархия (одна работа за раз)
1. Шапка org: имя, health badges, sample confidence  
2. Активные сигналы (коды D10)  
3. Диагностика: hypothesis + module + N / coverage warning  
4. Interventions / open cases  
5. Outcomes panel (Deal.outcome aggregates) **отдельно** от training block  
**Не** стек: полный список чужих проектов/клиентов с ПД.

## CTA
Открыть case · Создать intervention · Назначить training · Материалы · Verify adoption.

## Данные
Aggregates funnel/tools/early_loss; SupportCase (no PII); Intervention; **denominator + coverage** для consultation metrics (D10 §3.3).

## Состояния
insufficient N → «недостаточно наблюдений»; loading aggregates; error.

## RBAC
Нет delete чужих projects; нет plaintext client CRM.

## AC
- AC-PC-01: нет ObjectsPanel-операционки чужой org  
- AC-PC-02: training block ≠ conversion widget  
- AC-PC-03: DELETE project → 403  
- AC-PC-04: показаны denominator / sample size для offer rate  
