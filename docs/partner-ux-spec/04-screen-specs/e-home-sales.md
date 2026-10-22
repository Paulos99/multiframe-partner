# E-home-sales — Home менеджера продаж

**Revision:** `rev-gate-b-draft-2` · **Gate B · NOT approved** · aliases: часть `E-home`  
**Зависит от:** [D3](../03-information-architecture.md), [D8](../08-commercial-process.md)

## Кто / зачем
Sales: сфокусировать день на next actions сделки (confirm_sent, outcome, pause resume, tech-ready, sequential Deal) без стека модулей.

## Первый viewport (только)
1. Заголовок «Сегодня · Продажи»  
2. Inbox ≤8 next actions (приоритет ниже)  
3. Primary CTA-группа: **Новый проект** | **Быстрая консультация** | **Быстрый расчёт**  
**Запрет:** ObjectsPanel + CommercialPanel + Academy + EntryPoints на одном scroll (ADR-003).

## Сортировка / приоритет inbox
1. `early_paused` с просроченным `nextActionAt` → «Возобновить» (тот же dealId)  
2. `sent_confirmed` без outcome  
3. `quote_created` / shared без confirm_sent  
4. `accepted` + не tech-ready  
5. Closed + deferred → «Новая сделка» (новый dealId)  
6. Остальные follow-up

## Primary CTA → destination
| CTA | Destination |
|-----|-------------|
| Новый проект | [E-inquiry](./e-create-inquiry.md) → Project+Room+Deal (A-11) |
| Быстрая консультация | E-pm (quick) → Save → [E-quick-bind](./e-quick-bind.md) |
| Быстрый расчёт | E-calc → [E-calc-save](./e-calc-save.md) → bind |
| Карточка inbox | E-project-deal / E-room / E-project по типу action |

## Что скрыто
Create staff; чужие org; полный каталог сети; training KPI; вертикальный стек tools+КП.

## Состояния
| State | UX |
|-------|-----|
| loading | skeleton 3–5 строк inbox |
| empty | «Нет задач — начните с нового проекта или быстрой консультации» + primary CTA |
| error | баннер sync; кэш inbox если есть |
| offline | inbox из cache + «данные могут быть устаревшими» |
| first-time | short tip: один CTA «Новый проект»; без перечисления всех модулей |
| returning expert | сразу inbox + quick CTA |

## Mobile
Inbox list → tap → сущность; CTA в sticky bottom bar (макс. 2 primary).

## RBAC
Org-only; без delete project; без staff create.

## AC
- AC-HS-01: нет ≥3 несвязанных модулей на home  
- AC-HS-02: pause item → resume same dealId (не «Новая сделка»)  
- AC-HS-03: deferred+closed → CTA sequential new dealId  
- AC-HS-04: empty state ведёт в inquiry или quick-entry  
