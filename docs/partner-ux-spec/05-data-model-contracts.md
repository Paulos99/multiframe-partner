# D5 — Модель данных и контракты

**Revision:** `rev-gate-b-draft-1`  
**Gate:** B  
**Зависит от:** [D1](./01-product-architecture.md), [D3](./03-information-architecture.md), [ADR-004](./adr/004-deal-separate-from-room-status.md), [ADR-008](./adr/008-deal-quote-project-identity.md)  
**Опора (readonly gap):** `packages/shared/{partner,deal,quote,events,funnel,support,learning}.ts`, `apps/api/routes/{deals,quotes,support}.js`, `apps/api/projects.js`  
**Статус:** черновик Gate B. Продуктовый код **не** менялся в этой фазе.

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
          ├─ roomAssent: {roomId → ordered|deferred|out_of_scope}
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
| stage | воронка + early_* продуктовые состояния |
| outcome | SoT исхода; включает early_declined / early_paused (**gap** в shared сегодня) |
| stageAtOutcome | этап при early / loss |
| lossReason / lossComment | обязательны при decline/early_declined |
| roomAssent | map roomId → ordered\|deferred\|out_of_scope |
| assignments | sales/measurer/crew |
| closedAt? | после terminal closed |
| acceptedAmount? | сумма принятого заказа (отдельно от conversion count) |

**Инварианты D:**

| ID | Правило |
|----|---------|
| D-I1 | ≤1 Deal с `status=active` (не closed) на project |
| D-I2 | После closed — следующая нить = **POST новый id**; PATCH reopen запрещён |
| D-I3 | Closed Deal immutable (кроме admin repair audit log — **Assumption:** нет в P0) |
| D-I4 | Conversion = count(outcome=accepted) by dealId; amount — отдельное поле/метрика |

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

### 1.8 Save / sync / recovery

| Механизм | Правило |
|----------|---------|
| SessionDraft | tool result до bind; TTL **Assumption** 7 дней |
| pendingSync на Room/Document | local-first; outbox queue |
| Идемпотентность | client `draftId` / `Idempotency-Key` на POST quotes/deals/outcome |
| Anti-loss | unload confirm; draft persist |
| Recovery | после login — flush outbox; conflict → warn + last-write-wins (**Assumption**) |
| Sent quote | никогда не пересчитывать из live room |

---

## 2. Gap analysis vs текущий код

### 2.1 `packages/shared`

| Тема | Сейчас | Цель Gate B | Миграция |
|------|--------|-------------|----------|
| Deal.outcome early_* | нет early_declined/paused | добавить outcome или stageAtOutcome+flags | extend enum; backfill null |
| Deal.roomAssent | нет | map на Deal | новое поле; default ordered для rooms в quote |
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
| `POST /projects` | + room + active Deal(contact) atomic (**Assumption:** одна транзакция) |
| `POST /deals` | fail если уже есть active на projectId; всегда new id |
| `POST /deals/{id}/close` | immutable thereafter |
| `POST /quotes` | require dealId active; version=max(deal)+1; snapshot calc types |
| `POST /quotes/{id}/confirm-sent` | idempotent; set sent; advance Deal.stage; lock revision |
| `POST /quotes` (N+1) | allowed after sent; new id |
| `PATCH /deals/{id}/outcome` | require reason if decline/early; write stageAtOutcome |
| `POST /rooms/{id}/calculations` | type=preliminary\|detailed; не трогает sent quotes |
| `POST /rooms/{id}/checklist` | items; close room only if complete/na |
| Analytics queries | filter context≠training для sales KPI |

---

## 4. Миграционный план (данные)

1. Backfill `QuoteRevision.dealId` ← active/latest Deal of project.  
2. Recompute quote `version` per dealId (stable sort by createdAt).  
3. Add `roomAssent` default: rooms in latest sent quote → ordered; others deferred if deal accepted else unset.  
4. Keep `quote_sent` status in DB; map UI away.  
5. Feature-flag early outcomes.  
6. Tighten RBAC staff/delete.  
7. **Не** удалять wall calc code paths.

---

## 5. Acceptance (данные)

| AC | Проверка |
|----|----------|
| AC-D5-01 | Нельзя 2 active Deal на project |
| AC-D5-02 | POST deal после close → новый id; GET old immutable |
| AC-D5-03 | confirm_sent дважды идемпотентен |
| AC-D5-04 | mutate sent quote body → 409 |
| AC-D5-05 | training events excluded from conversion query |
| AC-D5-06 | coalesce totals never sum both calc types |

---

## 6. Assumptions

- Atomic project+room+deal create.  
- last-write-wins на offline room patches.  
- Waive checklist — только owner, редкий, с reason (деталь политики).  
- Quote version numbering resets per dealId (не глобально на project).  
- Admin repair closed Deal — не P0.
