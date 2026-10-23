# Assumptions — сводный список (Gate B)

**Revision:** `rev-gate-b-final-candidate` · **Gate B APPROVED 2026-10-23**  
**Правило:** не silently adopt. Категории: **resolved/approved** (Gate A и шесть Gate B решений) · **proposed awaiting owner** · **deferred nonblocking**.  
Owner table: [gate-b-decisions-for-owner.md](./gate-b-decisions-for-owner.md). [Owner approval](./gate-b-owner-approval-2026-10-23.md).

---

## Resolved / approved (Gate A — не переоткрывать)

| ID | Решение | Источник |
|----|---------|----------|
| GA-ADR-002 | Project → Rooms над ObjectsPanel | ADR-002 |
| GA-ADR-003 | Запрет стека несвязанных модулей | ADR-003 |
| GA-ADR-004 | Deal ≠ Room.status; Quote ≠ outcome SoT | ADR-004 |
| GA-ADR-007 | Quick-entry: tool→result→Save→bind | ADR-007 |
| GA-ADR-008 | Sequential dealId; closed immutable; Quote.dealId | ADR-008 |

---

## Resolved / approved (Gate B · 2026-10-23)

| ID | Утверждённое правило | Статус | AC / ссылка |
|---|---|---|---|
| A-06 | Sales/owner явно закрывает Deal после монтажа ordered; не авто из room.closed; accepted ≠ fulfilled | **approved 2026-10-23** | D5 §3.1 AC-A06-* |
| A-09 | Hybrid auto-stage (assessed/calculated/sent); outcome/pause/decline manual only | **approved 2026-10-23** | D5 §3.1 AC-A09-* |
| A-11 | Atomic Project+Room+Deal + Idempotency-Key; draft≠Deal | **approved 2026-10-23** | D5 §3.1 AC-A11-* |
| A-12 | **Superseded LWW:** append-only CalculationRevision + expectedRevision/409 | **approved 2026-10-23** | D5 §1.8, D7, AC-D5-09 |
| Pause-canon | early_paused nonterminal; early_declined terminal; resume≠new dealId | **approved 2026-10-23** | D5/D8/D11 |
| M-assent | Migration: sent≠ordered; unknown/needs_review | **approved 2026-10-23** | D5 §4 |

---

## Proposed awaiting owner (пока не утверждены)

A-05 (waive checklist) и A-07 (confirm_sent channel) требуют отдельного решения до имплементации. A-28 — калибровка на пилоте. Другие proposals/deferred указаны ниже.

---

## Продукт / процесс (прочие)

| ID | Assumption | Категория | Источник |
|----|------------|-----------|----------|
| A-01 | Inbox home ≤8 next actions | deferred nonblocking | D4 home |
| A-02 | Measurer: свои + assigned projects | proposed | D4 projects |
| A-03 | Явный archive проекта | proposed | D3/D5 |
| A-04 | Open blocker блокирует room.closed | proposed | D4 install / D11 |
| A-05 | Waive чек-листа — owner + reason | proposed awaiting owner | D5/D8 |
| A-07 | confirm_sent: warning не hard-block | proposed awaiting owner | D8 |
| A-08 | Один справочник lossReason | proposed | D8 |
| A-10 | Snapshot-поля Quote (точный JSON later) | deferred nonblocking | D5/D8 |

---

## Данные / sync

| ID | Assumption | Категория | Источник |
|----|------------|-----------|----------|
| A-13 | SessionDraft TTL 7 дней | deferred nonblocking | D5 |
| A-14 | История calc ≥5 save / 30 дней | deferred nonblocking | D7 |
| A-15 | Quote version monotonic per dealId | proposed (align ADR-008) | D5 |
| A-16 | Admin repair closed Deal — не P0 | deferred nonblocking | D5 |
| A-17 | draftId / Idempotency-Key на POST | proposed (с A-11) | D5/D7 |

---

## PM / Calc

| ID | Assumption | Категория | Источник |
|----|------------|-----------|----------|
| A-18 | Пол сверху = unknown по умолчанию | deferred | D6 |
| A-19 | Расширенный не-натяжной вне main path | deferred | D6 |
| A-20 | ≥1 версия answers на комнате | deferred | D6 |
| A-21 | Start PM в кабинете можно схлопнуть | deferred | D6 |
| A-22 | Wall escape hatch не P0 | deferred | D7 |
| A-23 | Host calc UI может смениться; Save контракт стабилен | proposed | D7 |

---

## Академия / StP

| ID | Assumption | Категория | Источник |
|----|------------|-----------|----------|
| A-24 | Порог сдачи ≥70; равные веса | deferred | D9 |
| A-25 | P0: один NPC; objections = 3 секции | deferred | D9 |
| A-26 | LLM не обязателен в P0 | deferred | D9 |
| A-27 | Calc/install sandbox — отдельный storage | deferred | D9 |
| A-28 | Пороги сигналов StP | proposed awaiting owner (пилот) | D10 |
| A-29 | Гипотеза «почему не MF» вручную | deferred | D10 |
| A-30 | Окна verify 14+14 | deferred | D10 |
| A-31 | Диагностика admin без ФИО клиентов | proposed (privacy) | D10 |
| A-32 | Proactive Intervention без SupportCase | deferred | D10 |
| A-36 | Consultation denominator = app-logged sessions only; show coverage warning | **proposed** (GB-P1-02) | D10 |

---

## Приёмка

| ID | Assumption | Категория | Источник |
|----|------------|-----------|----------|
| A-33 | До Gate C AC ссылаются на E-* | deferred | D11 |
| A-34 | RBAC-negative на API+UI | proposed | D11 |
| A-35 | Export аналитики — P1 | deferred | D4 analytics |
| A-37 | UX usability AC — specified in Gate B; observed results = Gate C | proposed | D11 §7 |
