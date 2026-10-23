# D5 — Модель данных и контракты

**Revision:** `rev-gate-b-final-candidate`  
**Gate:** B · **APPROVED 2026-10-23**  
**Зависит от:** [D1](./01-product-architecture.md), [D3](./03-information-architecture.md), [ADR-004](./adr/004-deal-separate-from-room-status.md), [ADR-008](./adr/008-deal-quote-project-identity.md)  
**Опора (readonly gap):** `packages/shared/{partner,deal,quote,events,funnel,support,learning}.ts`, `apps/api/routes/{deals,quotes,support}.js`, `apps/api/projects.js`  
**Статус:** черновик Gate B (`rev-gate-b-draft-2`). Продуктовый код **не** менялся в этой фазе.

---

## 0. Граница D5

| Внутри | Вне |
|--------|-----|
| Целевые сущности, инварианты, события, RBAC данных, save/sync/recovery, gaps vs shared/API, план миграций | Pixel UI (D4), алгоритмы PM/Calc, HTML-прототипы |

D3 = продукт/UX переходы. D5 = контракты, которые реализация обязана соблюсти.

---

## 1. Целевая модель (логический слой)

```text
Org
 └─ Project
     ├─ Room[]                    # сегодня JobObject + projectId + roomName
     │    ├─ acousticProfile?
     │    ├─ calculation.preliminary?
     │    ├─ calculation.detailed?
     │    ├─ documents[]          # estimate/profile versions (append-only)
     │    ├─ installChecklist?
     │    ├─ blockers[]
     │    └─ status               # draft|measured|tech_ready|install|blocked|closed
     └─ Deal[]                    # история; ровно 0..1 active
          ├─ roomAssent: {roomId → ordered|deferred|out_of_scope|unknown|needs_review}
          ├─ stage, outcome, stageAtOutcome?, lossReason?
          ├─ assignments
          └─ QuoteRevision[]      # dealId REQUIRED (новые); sent immutable
```

### 1.1 Project

| Поле | Тип | Правила |
|------|-----|---------|
| id | string | PK |
| orgId | string | изоляция |
| name / clientName / clientPhone / address / city | string | phone/address **не** обязательны до confirm_sent (§8.1) |
| archivedAt? | string\|null | **Assumption:** явный archive; UX Done ≠ auto из Deal closed |
| createdAt/By, updatedAt | | |

**Инвариант P1:** закрытие Deal **не** ставит Project.archived / Done, если есть `deferred` или создаётся следующая Deal ([ADR-008](./adr/008-deal-quote-project-identity.md)).

### 1.2 Room (целевой rename JobObject)

| Поле | Правила |
|------|---------|
| projectId | **обязателен** (нет orphan) |
| roomName | обязателен при create |
| status | исполнение; **не** outcome; UI **без** `quote_sent` (§8.4); данные legacy совместимы |
| calculation.preliminary | area estimate; не схема |
| calculation.detailed | геометрия+схема+BOM; для tech-ready |
| techReady | derived или stored flag: detailed актуален + материалы + ответственный |
| assent (read) | берётся из **активной** Deal.roomAssent[roomId] |

**Инвариант R1:** `coalesce(detailed, preliminary)` в агрегатах; запрет `prelim + detailed`.  
**Инвариант R2:** `room.closed` ⇏ `Deal.outcome=accepted`.

### 1.3 Deal

| Поле | Правила |
|------|---------|
| id | **новый** при каждой sequential нити |
| projectId | FK |
| stage | воронка (contact→…→quote_* / install); при `early_paused` stage **не** сбрасывается — хранится этап паузы |
| outcome | SoT исхода; включает early_declined / early_paused (**gap** в shared сегодня) |
| stageAtOutcome | этап при early / loss (для pause — этап, с которого поставили паузу) |
| lossReason / lossComment | обязательны при decline / early_declined; для early_paused — причина паузы (+ опц. `nextActionAt`) |
| roomAssent | map roomId → `ordered` \| `deferred` \| `out_of_scope` \| **`unknown`** \| **`needs_review`** |
| assignments | sales/measurer/crew |
| closedAt? | только после **terminal** closed |
| acceptedAmount? | сумма принятого заказа (отдельно от conversion count) |

#### Early outcomes: terminal vs nonterminal (GB-P0-01)

| Outcome | Terminal? | Deal status | Resume | Новый dealId? |
|---------|-----------|-------------|--------|---------------|
| `early_paused` | **нет** | остаётся **active** | **да** — тот же `dealId`; stage возвращается к `stageAtOutcome` (или явный выбор этапа) | **нет** |
| `early_declined` | **да** | → `closed` | нет; reopen запрещён | только при **новом** заказе (sequential) |
| `declined` / `no_response`→closed / install complete→closed | **да** | `closed` | нет | sequential |

**События:** `deal_paused` (nonterminal) ≠ `deal_closed`; `deal_resumed` на том же dealId; `deal_early_declined` → closed.  
**Follow-up:** при pause опционально `nextActionAt`; inbox sales/owner = «Возобновить» (не «Новая сделка»).  
**Запрет:** CTA «Пауза» не вызывает `close`; accidental close on pause — negative AC (D11 AC-EL-04).

**Инварианты D:**

| ID | Правило |
|----|---------|
| D-I1 | ≤1 Deal с `status=active` (не closed) на project; **paused Deal = active** |
| D-I2 | После closed — следующая нить = **POST новый id**; PATCH reopen запрещён |
| D-I3 | Closed Deal immutable (кроме admin repair audit log — **Assumption:** нет в P0) |
| D-I4 | Conversion = count(outcome=accepted) by dealId; amount — отдельное поле/метрика |
| D-I5 | Resume pause **не** создаёт новый dealId и **не** reopen closed |
| D-I6 | `roomAssent=ordered` только при доказанном assent; `sent` quote ≠ ordered |

### 1.4 QuoteRevision

| Поле | Правила |
|------|---------|
| id | PK нового экземпляра на N+1 |
| dealId | **REQUIRED** для новых записей |
| projectId | denorm для запросов |
| version | monotonic **per dealId** (не только per project) |
| lifecycle | created → shared → sent_confirmed; **без** accept/decline на Quote как SoT |
| snapshot | amounts, roomObjectIds, calcType per room, prices — frozen at sent |
| sentConfirmedAt | SoT «ушло клиенту» |

**Инварианты Q:**

| ID | Правило |
|----|---------|
| Q-I1 | `sent_confirmed` → immutable body; API PATCH body → 409 |
| Q-I2 | N+1 = POST новый revision на **том же** dealId |
| Q-I3 | copy/PDF/share ≠ sent; только confirm_sent |
| Q-I4 | Quote не хранит outcome клиента |

### 1.5 Assignments / work statuses

- Assignments на Deal (sales/measurer/crew) + derived на Room для crew inbox.  
- Work statuses Room: draft → measured → tech_ready → install → (blocked) → closed.  
- Install checklist items: done | na+reason | pending.  
- Blocker: open/resolved; open блокирует closed (**Assumption** согласовано с D11).

### 1.6 Analytics events

| Контур | Примеры | KPI |
|--------|---------|-----|
| sales | deal_stage_changed, quote_confirm_sent, deal_outcome_set, early_loss | conversion, amount, early loss by stage |
| tools | pm_result, calc_save_preliminary, calc_save_detailed, bind_completed | adoption |
| install | checklist_item, blocker_opened, room_closed | execution |
| training | academy_attempt, academy_score | **отдельный**; ∉ conversion |

События без ПД клиента в payload (как support).

### 1.7 RBAC (данные)

| Действие | admin | owner | sales | measurer | crew |
|----------|-------|-------|-------|----------|------|
| CRUD Project org | — | Y | Y | Y create | — |
| Delete Project | **нет чужих** | org | — | — | — |
| Deal outcome / confirm_sent | read | A/Y | Y | — | — |
| Quote manage | read | Y | Y | create? limited | amount null |
| Detailed save | — | Y | if allowed | Y | — |
| Checklist close | — | resolve | resolve blocker | tech | Y |
| Staff create | — | Y | **нет** (§8.11) | — | — |

Согласовать с `packages/shared/partner.ts`: сегодня `canManageStaff(sales)=true` — **gap** vs §8.11.

### 1.8 Save / sync / recovery (GB-P0-03)

| Механизм | Правило |
|----------|---------|
| SessionDraft | tool result до bind; TTL **Assumption** 7 дней |
| CalculationRevision | **append-only** per `(roomId, calcType)`; каждое Save = новая revision с `revisionId`, `baseRevisionId?`, `savedAt`, `savedBy`, payload |
| Current selection | deterministic: `current = max(revisionSeq)` among non-superseded; UI показывает current + история |
| Optimistic concurrency | Save несёт `expectedRevision` / `ETag` текущего слота; при mismatch → **409 Conflict** (не silent overwrite) |
| Conflict UX | обе ветки recoverable; пользователь выбирает keep remote / keep local / merge-review; **sent QuoteRevision** никогда не перезаписывается |
| pendingSync | local-first outbox; flush после login |
| Идемпотентность | client `draftId` / `Idempotency-Key` на POST quotes/deals/outcome/**calculations**/bind |
| Project+Room+Deal create | atomic + idempotent по `Idempotency-Key` / `draftId` (см. §3 A-11) |
| Anti-loss | unload confirm; draft persist |
| Sent quote | никогда не пересчитывать из live room |

**Запрещено:** unqualified last-write-wins на calculation records (supersedes A-12 draft-1).

---

## 2. Gap analysis vs текущий код

### 2.1 `packages/shared`

| Тема | Сейчас | Цель Gate B | Миграция |
|------|--------|-------------|----------|
| Deal.outcome early_* | нет early_declined/paused | добавить outcome или stageAtOutcome+flags | extend enum; backfill null |
| Deal.roomAssent | нет | map на Deal (`ordered\|deferred\|out_of_scope\|unknown\|needs_review`) | evidence-only backfill (§4); **запрет** default ordered из sent quote; без evidence → `unknown`/`needs_review` |
| DealStage quote_accepted… | stage дублирует outcome | оставить compat; UI SoT = outcome | UI ignore stage as outcome |
| QuoteRevision.dealId | `string \| null` | **required** новые | backfill: привязать к единственной Deal project или создать |
| Quote accept/decline lifecycle | есть в QuoteLifecycle | deprecate; outcome на Deal | stop writing; read compat |
| Quote version per project | API считает per projectId | per **dealId** | change counter key |
| JobObjectStatus quote_sent | есть | UI hide; data keep | no delete field P0 |
| Room tech_ready / blockers / checklist | нет в shared | добавить | new collections |
| calculation prelim vs detailed | estimate единый | два слота | documents.version meta calcType |
| Project archive | нет | optional | — |
| canManageStaff(sales) | true | false (§8) | change + API enforce |
| canDeleteObjects(admin) | true | admin **не** delete чужих | tighten |

### 2.2 API routes (наблюдение readonly)

| Route | Gap |
|-------|-----|
| `POST/PATCH /deals` | нет запрета reopen closed; нет roomAssent; нет enforced single-active |
| `POST /quotes` | dealId optional; version per project; нет immutability guard на PATCH body (PATCH body почти нет — actions only: хорошо) |
| `POST .../confirm-sent` | не двигает Deal.stage автоматически? проверить UI — **Assumption:** должен advance stage |
| `/projects`, `/objects` | objects≈rooms; нет checklist endpoints |
| `/support` | PII guard есть — сохранить |
| Staff passwords | one-time — вне D5 detail |

### 2.3 UI inventory (gap, не план PR)

Homes стекают ObjectsPanel/CommercialPanel; ProjectDetail существует но не канон; CommercialPanel не привязан к выбору; cabinetCalc save path слабый bind — см. D0 appendix. **Целевой UX — D4**, не патч текущего.

---

## 3. Целевые API-операции (контракт уровня продукта)

| Операция | Инварианты |
|----------|------------|
| `POST /projects` | + room + active Deal(contact) **atomic** (A-11 proposal); Idempotency-Key; retry → тот же triple ids |
| `POST /deals` | fail если уже есть active на projectId; всегда new id |
| `POST /deals/{id}/pause` | outcome=`early_paused`; Deal **остаётся active**; не close |
| `POST /deals/{id}/resume` | clear early_paused; restore stage; **тот же dealId**; 409 если closed |
| `POST /deals/{id}/close` | immutable thereafter; early_declined / declined / explicit close |
| `POST /quotes` | require dealId active; version=max(deal)+1; snapshot calc types |
| `POST /quotes/{id}/confirm-sent` | idempotent; set sent; advance Deal.stage per A-09; lock revision |
| `POST /quotes` (N+1) | allowed after sent; new id |
| `PATCH /deals/{id}/outcome` | require reason if decline/early_declined; pause ≠ close |
| `POST /rooms/{id}/calculations` | type=preliminary\|detailed; append revision; `expectedRevision`; 409 on stale; не трогает sent quotes |
| `POST /rooms/{id}/checklist` | items; close room only if complete/na |
| Analytics queries | filter context≠training для sales KPI |

### 3.1 Канонические proposal-правила A-06 / A-09 / A-11 (GB-P0-04)

> **Статус:** `proposed awaiting owner` — см. [gate-b-decisions-for-owner.md](./gate-b-decisions-for-owner.md). Не помечены approved.

| ID | Каноническое правило (proposal) | Rationale | Recovery / UX | Executable AC |
|----|--------------------------------|-----------|---------------|---------------|
| **A-06** | Sales/owner **явно** закрывает Deal после того, как все `ordered` rooms closed (или waive); система показывает CTA «Закрыть сделку», **не** авто-closed из `room.closed`. `outcome=accepted` остаётся фактом покупки независимо от прогресса монтажа. | Покупка ≠ исполнение; иначе KPI «закрыто» смешивается с монтажом | Если забыли close — Deal остаётся active+accepted; inbox next action «Закрыть после монтажа» | AC-A06-01: last ordered room.closed **не** пишет Deal.closedAt. AC-A06-02: explicit close после install → closed. AC-A06-03: accepted без closed rooms всё ещё accepted в conversion. |
| **A-09** | **Hybrid:** (1) при первом usable PM-result → stage ≥ `assessed`; (2) при первом usable calc save → stage ≥ `calculated`; (3) `confirm_sent` → `quote_sent_confirmed`; (4) outcome/pause/decline — **только вручную**. Авто-advance **никогда** не ставит accepted/declined/early_*. Derived UI stage может показывать «есть calc» до commit. | Telemetry детерминирована; нет угадывания «когда менеджер сам двинул» | Retry save идемпотентен; повторный save не откатывает stage назад | AC-A09-01: prelim save без Quote → stage calculated. AC-A09-02: save не ставит accepted. AC-A09-03: confirm_sent один раз двигает stage (идемпотентно). |
| **A-11** | `POST /projects` (и quick-bind create path) создаёт Project+≥1 Room+active Deal(contact) в **одной транзакции**. Клиент шлёт `Idempotency-Key` (= draftId bind). Повтор с тем же ключом → 200 тех же ids, без дублей. Deals без Quote = норма (stage contact…calculated). Session draft без bind **не** создаёт Deal. | Offline/retry иначе плодит orphan projects/deals | Partial fail → rollback всей тройки; draft остаётся | AC-A11-01: один POST → 3 ids linked. AC-A11-02: duplicate key → no second Deal. AC-A11-03: cancel bind → 0 Project. AC-A11-04: Deal без Quote допустим и виден в early loss. |

---

## 4. Миграционный план (данные) — GB-P0-02

**Жёсткое правило:** `QuoteRevision.lifecycle = sent_confirmed` (**sent**) **≠** доказательство покупки и **≠** `roomAssent=ordered`.

1. Backfill `QuoteRevision.dealId` ← active/latest Deal of project.  
2. Recompute quote `version` per dealId (stable sort by createdAt).  
3. **roomAssent backfill (не фабриковать продажи):**  
   - Если есть **явное** legacy evidence принятия **и** состава (accepted outcome / payment / install assignment с room scope) → `ordered` только для rooms в accepted scope; остальные → `deferred` или `out_of_scope` по evidence.  
   - Если Deal accepted, но per-room scope **недоказан** → все rooms в latest sent quote → **`needs_review`** (не ordered).  
   - Если только sent / shared / created без accepted → **`unknown`** (не ordered, не deferred-as-sale).  
   - Rooms вне quote при accepted без evidence → `needs_review` или unset; UI: «требует сверки».  
4. Preserve raw legacy fields (quote lifecycle, job statuses) read-only for audit.  
5. Migrated amounts / crew inbox: **exclude** `unknown`/`needs_review` from conversion amount and install pool until reconciled.  
6. Keep `quote_sent` status in DB; map UI away.  
7. Feature-flag early outcomes.  
8. Tighten RBAC staff/delete.  
9. **Не** удалять wall calc code paths.

### 4.1 Migration fixtures (обязательные)

| Fixture | Legacy | Expected after migrate |
|---------|--------|------------------------|
| M-F1 | Quote sent, no client response | roomAssent=`unknown`; **не** in crew inbox; **не** in accepted amount |
| M-F2 | Quote declined / Deal declined | not ordered; closed Deal immutable |
| M-F3 | Accepted **all** rooms with evidence | all in scope → ordered |
| M-F4 | Accepted **partial** with evidence | ordered only evidenced rooms; rest deferred/out_of_scope |
| M-F5 | Ambiguous legacy (sent + vague «ok» note, no room list) | `needs_review`; blocked from KPI amount & install until audit |

**Proof:** AC-D5-07…10; no false sales; no false install assignments.

---

## 5. Acceptance (данные)

| AC | Проверка |
|----|----------|
| AC-D5-01 | Нельзя 2 active Deal на project (paused считается active) |
| AC-D5-02 | POST deal после close → новый id; GET old immutable |
| AC-D5-03 | confirm_sent дважды идемпотентен |
| AC-D5-04 | mutate sent quote body → 409 |
| AC-D5-05 | training events excluded from conversion query |
| AC-D5-06 | coalesce totals never sum both calc types |
| AC-D5-07 | Migration M-F1: sent-only → unknown; 0 false ordered |
| AC-D5-08 | Migration M-F5: needs_review excluded from KPI amount & crew inbox |
| AC-D5-09 | Calc save stale expectedRevision → 409; both revisions retained |
| AC-D5-10 | Pause → resume same dealId; pause ≠ closedAt |
| AC-D5-11 | A-11 duplicate Idempotency-Key → no duplicate Project/Deal |

---

## 6. Assumptions

- A-06 / A-09 / A-11 / A-12 — **proposed** (см. §3.1 и [assumptions.md](./assumptions.md)); не owner-approved.  
- Waive checklist — только owner, редкий, с reason.  
- Quote version numbering resets per dealId (не глобально на project).  
- Admin repair closed Deal — не P0.
