# D8 — Коммерческий процесс (Deal / КП / исходы)

**Revision:** `rev-gate-b-final-candidate`  
**Gate:** B · **APPROVED** owner 2026-10-23  
**Зависит от:** [D1](./01-product-architecture.md), [D3](./03-information-architecture.md), [ADR-004](./adr/004-deal-separate-from-room-status.md), [ADR-008](./adr/008-deal-quote-project-identity.md), [ADR-005](./adr/005-ceiling-segment-presets-pm-calc.md), [ADR-007](./adr/007-quick-entry-without-full-client-card.md)  
**Связь:** [D6](./06-probleмомер-ceiling.md), [D7](./07-calculator-ceiling.md), [D2](./02-role-scenarios.md), [D5](./05-data-model-contracts.md)  
**Статус:** черновик Gate B (`rev-gate-b-draft-2`). Поля snapshot Quote — принцип здесь; JSON/API — D5.

---

## 0. Источники истины (не нарушать)

| Вопрос | SoT | Запрещено |
|--------|-----|-----------|
| Исход продажи / отказ / пауза | **Deal.outcome** (+ early_*) | Accept/decline как SoT на Quote |
| Этап воронки | **Deal.stage** (+ stageAtOutcome при early) | Выводить из Room.status |
| Документ КП | **QuoteRevision** lifecycle `created`→`shared`→`sent_confirmed` | copy/PDF = sent |
| После sent | Revision **immutable** | Patch сумм/состава sent |
| N+1 | **Новый экземпляр** на **той же** активной Deal (`dealId` обязателен) | «Переезд» КП на другую Deal |
| После closed Deal | **Новый dealId** (sequential) | Reopen того же id |
| Закрытие Deal | ≠ Project Done при deferred / следующих заказах | Авто-Done из deal_closed |
| Конверсия | `outcome=accepted` по dealId | room.closed; training |
| Сумма заказа | Отдельно от факта accepted | Складывать prelim+detailed одной комнаты |
| Монтаж | accepted + ordered + **tech-ready** | Preliminary-only в бригаду |

§8 / ADR-008 — закон для этого документа.

---

## 1. Модель сущностей (продукт)

```text
Project
 ├─ Rooms[]  (исполнение; calc; profile)
 └─ Deal[]   (история; ровно 1 active)
      └─ active Deal
           ├─ stage, outcome, roomAssent, lossReason, stageAtOutcome
           └─ QuoteRevision[]  (каждая с dealId; sent → immutable)
```

**roomAssent** на комнату в рамках Deal: `ordered` | `deferred` | `out_of_scope` | `unknown` | `needs_review`.  
`ordered` только при доказанном согласии клиента на scope; **sent КП ≠ ordered** ([D5 §4](./05-data-model-contracts.md)).

**Продуктовые early-исходы** (до КП; обязательны для StP) — GB-P0-01:

| Outcome | Terminal? | Смысл | Следствие |
|---------|-----------|--------|-----------|
| `early_declined` | **да** | Отказ до создания КП | Deal → **closed**; resume запрещён; новый заказ = новый dealId |
| `early_paused` | **нет** | Пауза до КП | Deal остаётся **active**; CTA «Возобновить» на **том же** dealId; **не** close |

**Запрет:** объединять pause и decline в один путь «→ Deal_closed».  
**Assumption:** в shared `DealOutcome` сегодня нет early_*; Gate B фиксирует **продукт**, миграция enum — D5. Не подменять early через `declined` без `stageAtOutcome`.

**Quote lifecycle (продукт):** только документ. Accept/decline на Quote в текущем коде — **gap**; целевой UX не показывает исход на КП как SoT.

---

## 2. Карта коммерческих сценариев

| ID | Сценарий | Результат |
|----|----------|-----------|
| S-com-01 | Нет интереса к ЗИ (консультация без calc) | early_declined / early_paused + причина + этап |
| S-com-02 | Консультация с PM, без calc | assessed; далее КП или early_* |
| S-com-03 | Early decline на любом до-КП этапе | Deal closed / early_*; StP видит этап |
| S-com-04 | Предварительное КП (только preliminary) | Quote created→confirm_sent; пометка «ориентир» |
| S-com-05 | Точное КП (detailed / coalesce) | Quote; tech-ready путь после accepted |
| S-com-06 | Multi-room КП | Состав комнат + типы calc на revision |
| S-com-07 | Partial assent | accepted + roomAssent mix |
| S-com-08 | Sequential reorder (новый dealId) | Закрытая Deal неизменна; новая нить |
| S-com-09 | confirm_sent | sent_confirmed; copy≠sent |
| S-com-10 | Loss reasons / postponed / no_response | Outcome + next actions |
| S-com-11 | N+1 после пересчёта / пересмотра | Новый экземпляр на той же Deal |

---

## 3. Сценарии (каркас качества)

### S-com-01 — Нет интереса к ЗИ: консультация без calc

| Поле | Содержание |
|------|------------|
| **Начало** | Клиент за натяжной; MultiFrame предложен устно / коротко; calc не открывали. |
| **Результат** | На активной Deal зафиксирован early-исход с **этапом** (`contact` или `offered`) и **причиной**; проект и комнаты живы. |
| **User** | Проект → Сделка → «Отказ» **или** «Пауза» (разные CTA) → этап → причина (напр. `no_need`) → сохранить. |
| **System** | `early_declined` → closed + closedAt; `early_paused` → outcome pause, Deal **active**, `stageAtOutcome`, опц. `nextActionAt`; **не** требует Quote/calc; pause **не** пишет closed. |
| **Состояния** | D3 §5.5; D5 §1.3 terminal vs nonterminal |
| **Данные** | Deal.*; Project Active |
| **Ошибки** | Пустая причина/этап → валидация; попытка close через «Пауза» → запрещена |
| **Ответственные** | Sales R; owner A; resume — sales/owner на том же dealId |
| **AC** | Воронка видит early loss до quote_created; pause resume = тот же dealId; training не создаёт outcome |
| **Next actions** | Pause → «Возобновить» (+ follow-up); decline+closed → «Новая сделка» только при новом заказе |

### S-com-02 — Консультация с PM без calc

| Поле | Содержание |
|------|------------|
| **Начало** | Провели PM (D6); клиент смотрит профиль; цены ещё нет. |
| **Результат** | Deal на `assessed` (или вручную); либо переход к calc/КП, либо early_*. |
| **User** | После Result PM → сохранить профиль → на сделке продолжает разговор → «Сформировать ориентир» (D7) **или** early_*. |
| **System** | Не блокирует early_* отсутствием calc; не ставит accepted из профиля. |
| **AC** | Можно закрыть интерес на этапе assessed без Quote |

### S-com-03 — Early decline на calculated (есть ориентир, КП не создавали)

| Поле | Содержание |
|------|------------|
| **Начало** | Есть preliminary; клиент: «дорого / не сейчас» — КП не собирали. |
| **Результат** | early_declined|early_paused, stageAtOutcome=`calculated`, lossReason. |
| **User** | Сделка → Отказ/Пауза → причина (`expensive`, `postponed_repair`, …). |
| **System** | Calc на комнате **сохраняется**; при early_declined — Deal closed; при early_paused — Deal active (возобновляема). |
| **AC** | Потеря/пауза видима StP с этапом calculated; calc не удаляется; pause ≠ closed |

### S-com-04 — Предварительное КП

| Поле | Содержание |
|------|------------|
| **Начало** | По комнатам только preliminary (или mix, но выбранные — prelim). |
| **Результат** | QuoteRevision N с пометкой «ориентировочно»; lifecycle до `sent_confirmed` по S-com-09. |
| **User** | Сделка → создать КП → выбрать комнаты → видит warning «без схемы» → copy/PDF → confirm_sent. |
| **System** | Сумма комнаты = preliminary; запрет double-count; **не** tech-ready. |
| **Ошибки** | Нет ни одного usable calc → блок; попытка передать в монтаж после accepted без detailed → блок tech-ready |
| **AC** | В UI КП явная пометка предварительности; crew не получает install |

### S-com-05 — Точное КП

| Поле | Содержание |
|------|------------|
| **Начало** | По нужным комнатам есть detailed (или coalesce выбрал detailed). |
| **Результат** | QuoteRevision со snapshot detailed; после accepted возможен путь tech-ready→install. |
| **User** | Создать КП → состав → confirm_sent → outcome. |
| **System** | Snapshot calc на версии (**Assumption:** набор полей snapshot — D5: amounts, roomIds, calcType per room, scheme/doc refs). |
| **AC** | Изменение live detailed после sent не меняет эту revision |

### S-com-06 — Multi-room

| Поле | Содержание |
|------|------------|
| **Начало** | Проект: кухня + гостиная + спальня; разные готовности calc. |
| **Результат** | Одна QuoteRevision перечисляет включённые комнаты; на комнату — один вклад coalesce; отложенные комнаты видны как не в составе **или** deferred в assent позже. |
| **User** | Чекбоксы комнат при создании КП; видит тип calc каждой. |
| **System** | `roomObjectIds[]`; сумма = Σ coalesce; нельзя включить комнату без usable calc. |
| **AC** | Три комнаты с detailed+prelim каждая → в сумме 3 вклада, не 6 |

### S-com-07 — Partial assent

| Поле | Содержание |
|------|------------|
| **Начало** | КП sent; клиент берёт 2 из 3 комнат. |
| **Результат** | `outcome=accepted`; roomAssent: 2×ordered, 1×deferred (или out_of_scope); конверсия = accepted; сумма принятого заказа = сумма ordered. |
| **User** | Сделка → Исход «Согласился» → отмечает комнаты. |
| **System** | Монтажный пул = только ordered + later tech-ready; deferred не в inbox crew; **Deal остаётся** пока ordered не закрыты / сделка не closed по политике. |
| **Ошибки** | Accepted без ни одной ordered → валидация |
| **AC** | Crew не видит deferred; Project не Done |

### S-com-08 — Sequential reorder (новый dealId)

| Поле | Содержание |
|------|------------|
| **Начало** | Первая Deal: accepted partial; ordered смонтированы; Deal **closed**; есть deferred. |
| **Результат** | Создана **новая** Deal с **новым dealId** в том же projectId; закрытая Deal неизменна (outcome/суммы/КП); на новой Deal — deferred→ordered + новая QuoteRevision с **новым** dealId. |
| **User** | Проект → «Новая сделка / дозаказ» → система create Deal (не reopen) → КП на новой нити → … |
| **System** | Запрет reopen; история Deal[] доступна read-only; Project UX Active (не Done). |
| **AC** | Старый dealId не меняет stage/outcome; аналитика конверсии по каждому dealId отдельно; Quote прошлых Deal не «переезжают» |

### S-com-09 — confirm_sent

| Поле | Содержание |
|------|------------|
| **Начало** | QuoteRevision в created или shared; менеджер реально отправил клиенту (WA/email/лично). |
| **Результат** | `lifecycle=sent_confirmed`; `sentConfirmedAt`; Deal.stage → `quote_sent_confirmed`; revision **immutable**. |
| **User** | Явная кнопка **«Подтвердить отправку»** (не copy, не PDF, не share alone). |
| **System** | copy/PDF/share **не** меняют на sent; до confirm достаточно способа передачи (телефон/адрес не всегда обязательны — ADR-007). |
| **Ошибки** | Confirm без способа передачи → **Assumption:** warning, не жёсткий блок, если канал указан в комментарии sentComment |
| **Next actions** | «Зафиксировать ответ клиента» (outcome) |
| **AC** | После только copy UI **не** показывает «КП отправлено» как факт доставки |

### S-com-10 — Исходы после sent + loss reasons

| Поле | Содержание |
|------|------------|
| **Начало** | sent_confirmed; ждём ответ. |
| **Результат** | Явный Deal.outcome. |

| Outcome | Требования | Next actions (примеры) |
|---------|------------|------------------------|
| `accepted` | ≥1 ordered; roomAssent заполнен | Tech-ready checklist → assign crew |
| `declined` | lossReason обязателен | Closed; опц. материалы/обучение; не training KPI |
| `postponed` | опц. nextActionAt | Reminder; можно N+1 / возобновление **той же** Deal |
| `no_response` | опц. nextActionAt | Follow-up; или closed без ответа |

**Справочник причин (продукт; лейблы как в shared):**

| Код | Лейбл |
|-----|-------|
| `expensive` | Дорого |
| `no_need` | Не видит потребности |
| `doubts_efficacy` | Сомневается в эффективности |
| `chose_other` | Выбрал другой вариант |
| `postponed_repair` | Отложил покупку/ремонт |
| `technical` | Нет технической возможности |
| `other` | Другая причина (+ comment) |
| `unknown` | Неизвестно |

Те же коды для early_* (**Assumption:** один справочник).

**AC:** система **не** ставит accepted из room.closed; Quote UI не является местом фиксации исхода.

### S-com-11 — N+1 на той же Deal

| Поле | Содержание |
|------|------------|
| **Начало** | Sent N; изменили calc / состав / цену / пересмотр. |
| **Результат** | Новая QuoteRevision N+1, `dealId` = активная Deal; N остаётся immutable в истории. |
| **User** | «Новая версия КП» → редактирование черновика → снова confirm_sent. |
| **System** | Не patch N; snapshot от актуальных комнат на момент создания N+1. |
| **AC** | Открыть N — суммы старые; N+1 — новые; оба с одним dealId |

---

## 4. Полный коммерческий путь (сквозная лента)

```mermaid
flowchart TD
  A[Контакт_проект_или_quick_bind] --> B{Интерес_к_ЗИ}
  B -->|отказ| ED[early_declined_terminal]
  B -->|пауза| EP[early_paused_nonterminal]
  B -->|да| C{PM}
  C -->|да| D[assessed_профиль]
  C -->|нет| F[calc_optional]
  D --> F
  F --> G{До_КП}
  G -->|отказ| ED
  G -->|пауза| EP
  G -->|продолжить| H[Quote_created]
  EP -->|Возобновить_тот_же_dealId| F
  EP -->|явное_закрытие_как_decline| ED
  H --> I[share_опц]
  I --> J[confirm_sent]
  J --> K{Исход}
  K -->|accepted_partial| L[roomAssent_доказанный]
  K -->|declined| M1[declined_closed_commercial]
  K -->|postponed_no_response| M2[follow_up_той_же_Deal]
  L --> N[tech_ready_ordered]
  N --> O[install_closed_rooms]
  O --> P[Deal_closed_after_install_A06]
  P --> Q{есть_deferred}
  Q -->|да| R[новый_dealId_sequential]
  Q -->|нет| S[Project_может_Done]
  R --> H
  ED --> CL[Deal_closed_commercial_loss]
  M1 --> CL
```

**Два разных закрытия (не смешивать узлы):**  
- **Commercial close:** `early_declined` / `declined` → `Deal_closed_commercial_loss` (проигрыш; без монтажа).  
- **Fulfillment close (A-06):** после accepted + ordered rooms closed → явный `Deal_closed_after_install_A06`.  

**Pause:** resume = тот же dealId; **никогда** не auto→closed; pause **не** lost sale (D10).

---

## 5. Next actions после ключевых событий

| Событие | Inbox sales/owner |
|---------|-------------------|
| early_paused | Возобновить сделку · Назначить follow-up |
| early_declined → closed | — (история); при новом запросе — новая Deal |
| quote_created | Отправить клиенту · confirm_sent |
| sent_confirmed | Зафиксировать ответ |
| accepted + не tech-ready | Дособрать detailed / материалы / ответственного |
| accepted + tech-ready | Назначить crew |
| blocker от crew | Снять причину |
| Deal closed + deferred | Создать следующую Deal (новый dealId) |
| calc changed + sent exists | Создать КП N+1 |

---

## 6. Согласование с calc / PM

| Правило | Ссылка |
|---------|--------|
| Можно КП без PM | D6 S-pm-03, D1 |
| Можно early_* без calc | S-com-01 |
| Суммы КП = coalesce | D7 / ADR-005 |
| Sent не пересчитывается live calc | ADR-004/008, S-com-11 |
| Preliminary в КП ≠ install | D1 §5.6 |

---

## 7. Критерии приёмки

| ID | Критерий | Проверка |
|----|----------|----------|
| AC-D8-01 | Early decline возможен на contact/offered/assessed/calculated **без** Quote | S-com-01/03 |
| AC-D8-02 | copy/PDF/share ≠ sent_confirmed | UI + lifecycle |
| AC-D8-03 | После confirm_sent revision immutable | Попытка edit → только N+1 |
| AC-D8-04 | N+1 имеет тот же dealId; новый id revision | Данные |
| AC-D8-05 | После closed — create нового dealId; reopen запрещён | S-com-08 |
| AC-D8-06 | Partial assent: crew только ordered (не unknown/needs_review) | Inbox crew |
| AC-D8-07 | Project не Done только из deal_closed при deferred | UX фаза проекта |
| AC-D8-08 | КП multi-room: нет double-count | Фикстура сумм |
| AC-D8-09 | declined/early требует lossReason (+ stageAtOutcome для early) | Валидация |
| AC-D8-10 | Исход только на Deal UI, не как SoT на Quote | UX |
| AC-D8-11 | Конверсия аналитики = accepted по dealId; сумма accepted отдельно | D10/analytics contract later |
| AC-D8-12 | Install только после accepted+ordered+tech-ready | S-x-03 |
| AC-D8-13 | Pause → resume: тот же dealId; closedAt null | S-com-01 |
| AC-D8-14 | CTA «Пауза» не вызывает close (negative) | UI + API |
| AC-D8-15 | Sent quote rooms ≠ auto ordered | D5 migration |

---

## 8. Gaps vs текущий shared (для D5, не ломают продукт)

| Код сегодня | Продукт Gate A/B |
|-------------|------------------|
| `DealOutcome` без early_* | Добавить early_declined / early_paused (+ stageAtOutcome) |
| `QuoteLifecycle` с accept/decline | Исход убрать с Quote как SoT; legacy совместимость |
| `QuoteRevision.dealId` nullable | Обязателен для **новых** |
| Нет roomAssent в shared Deal | Поле/карта согласия — D5 |
| `quote_sent` на JobObject | Убрать из нового UI; совместимость данных |

Эти gaps **не** дают права писать противоречащий UX «пока так в коде».

---

## 9. Assumptions / proposals

1. **A-09 (proposed):** hybrid auto-stage — см. [D5 §3.1](./05-data-model-contracts.md); UI может показывать derived до commit.  
2. Набор snapshot-полей QuoteRevision (A-10).  
3. Жёсткость «способ передачи» при confirm_sent (warning vs block) — A-07.  
4. **A-06 (proposed):** sales/owner явно закрывает Deal после монтажа ordered; CTA, не авто из room.closed; accepted ≠ fulfilled install.  
5. Единый справочник lossReason для early и post-sent (A-08).  
6. Owner decisions: [gate-b-decisions-for-owner.md](./gate-b-decisions-for-owner.md).

---

## Связанные документы

- [adr/004-deal-separate-from-room-status.md](./adr/004-deal-separate-from-room-status.md)  
- [adr/008-deal-quote-project-identity.md](./adr/008-deal-quote-project-identity.md)  
- [03-information-architecture.md](./03-information-architecture.md) §5.4–5.5  
- [02-role-scenarios.md](./02-role-scenarios.md) S-sales-01/02/02a, S-x-07  
- [gate-a-review.md](./gate-a-review.md) §4 / §8
