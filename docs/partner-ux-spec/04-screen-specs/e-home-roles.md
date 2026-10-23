# E-home — индекс домашних экранов по ролям

**Revision:** `rev-gate-b-draft-2` · **Gate B APPROVED 2026-10-23**  
**Зависит от:** [D3](../03-information-architecture.md)

Каждая роль — **отдельная спека** (GB-P0-05). Общий запрет ADR-003: не стековать Inbox + каталог + CommercialPanel + EntryPoints.

| Роль | Файл | Фокус |
|------|------|-------|
| sales | [e-home-sales.md](./e-home-sales.md) | confirm_sent, outcome, pause resume, quick-entry |
| owner | [e-home-owner.md](./e-home-owner.md) | вмешательство, назначения, новый проект |
| measurer | [e-home-measurer.md](./e-home-measurer.md) | assigned rooms → detailed save |
| crew | [e-home-crew.md](./e-home-crew.md) | ordered+tech-ready install |
| admin | [e-home-admin.md](./e-home-admin.md) | сигналы сети → PartnerCard |

## Общий каркас
1. Заголовок роли  
2. Inbox ≤8 (**Assumption A-01**)  
3. Одна primary CTA-зона  

## Cross-cutting AC
- AC-H-01: нет вертикального стека ≥3 несвязанных модулей  
- AC-H-02: crew inbox без deferred / unknown / needs_review / non-tech-ready  
- AC-H-03: sales «sequential Deal» при closed+deferred  
- AC-H-04: admin home ≠ чужой CRM список проектов  
