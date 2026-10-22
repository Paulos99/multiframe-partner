# D11 — Матрица приёмки

**Revision:** `rev-gate-b-draft-2`  
**ID:** D11  
**Зависит от:** D2–D10 (сценарии, IA, коммерция, академия, StP); SoT Gate A: ADR-001…008  
**Статус:** черновик Gate B · **NOT approved** · **не Gate C** (доказательства — сценарий/данные/RBAC-тест, не «макет есть»)

---

## 0. Правила приёмки (анти-формализм)

**Запрещено** закрывать пункт как Done, если единственные аргументы:

- «экран существует» / «маршрут открывается»;  
- «CI green» / «сборка прошла»;  
- «кнопка нарисована» без проверяемого эффекта на данные/права/метрики.

**Обязательный каркас каждой строки AC:**

| Поле | Требование |
|------|------------|
| **AC-ID** | Стабильный идентификатор |
| **Измеримый результат** | Наблюдаемое состояние данных или запрет действия |
| **Сценарий** | `S-*` из D2 (или D9/D10 AC) |
| **Экран** | `E-*` из D3 (или явный CTA) |
| **Данные** | Сущности / инварианты |
| **Доказательство** | Как проверить (ручной сценарий · assert · RBAC-тест · analytics query) |
| **Не-доказательство** | Что **не** считать успехом |

**Definition of Done строки:** все четыре связки (сценарий ↔ экран ↔ данные ↔ доказательство) выполнены на целевом контуре; CI может быть *необходимым*, но **не достаточным**.

**Assumption:** пока D4 screen specs не зафиксированы pixel-level, колонка «Экран» ссылается на ID из D3; уточнение copy/CTA — не блокирует логическую приёмку инварианта.

---

## 1. Сводная матрица ключевых AC

### 1.1 Golden path

| AC-ID | Измеримый результат | Сценарий | Экран | Данные | Доказательство | Не-доказательство |
|-------|---------------------|----------|-------|--------|----------------|-------------------|
| AC-GP-01 | После пути лид→монтаж есть `projectId`, ≥1 room, Deal closed или accepted+ordered closed | S-x-01 | E-home → E-project → E-room → E-deal → E-install | Project, Room, Deal, QuoteRevision, Checklist | Пройти путь; ids не null; нет orphan room | «Все экраны из меню открываются» |
| AC-GP-02 | Quick-entry: tool→result→Save→bind→persist; нет безымянного объекта | S-sales-05, S-x-06 | E-tools / E-calc-save / E-quick-bind ([D4](./04-screen-specs/)) | SessionDraft → Project+Room | Save без bind заблокирован; после confirm есть имена | «Калькулятор открылся» |
| AC-GP-03 | copy/PDF ≠ sent; только confirm_sent → `sent_confirmed` | S-sales-01 | E-deal / Quote | QuoteRevision.lifecycle | После copy stage не quote_sent_confirmed | «PDF скачался» |
| AC-GP-04 | Конверсия = `Deal.outcome=accepted`; room.closed ≠ accepted | S-sales-02, S-x-01 | E-deal, E-analytics | Deal.outcome, Room.status | Закрытие комнаты не пишет accepted | «Статус комнаты Install» |

### 1.2 Early loss

| AC-ID | Измеримый результат | Сценарий | Экран | Данные | Доказательство | Не-доказательство |
|-------|---------------------|----------|-------|--------|----------------|-------------------|
| AC-EL-01 | Early decline/pause **до КП** с `lossReason` + `stageAtOutcome` | S-sales-02a | E-deal / inbox CTA | Deal.outcome early_*, lossReason, stageAtOutcome | Сохранить без Quote; пустая причина → блок | «Поле причины есть в форме» |
| AC-EL-02 | StP/аналитика видит этап потери до КП | S-sales-02a, S-admin-02 | E-analytics, E-partner-card | Aggregates early_* | Запись видна в воронке/сигналах | «CI по API 200» |
| AC-EL-03 | Training-событие не подменяет early outcome | S-sales-02a, D9 | E-analytics vs E-analytics-training | context training excluded | Attempt completed не создаёт Deal.outcome | «Виджет training на том же дашборде» |
| AC-EL-04 | **Pause ≠ close:** CTA Пауза не пишет closedAt; resume = тот же dealId | S-com-01, GB-P0-01 | E-project-deal | Deal.active + early_paused | Negative: pause path ≠ POST close; resume id equal | «Кнопка Пауза есть» |
| AC-EL-05 | early_declined → closed; reopen запрещён | S-com-03 | E-project-deal | closedAt set | PATCH reopen → reject | «Статус Отказ в UI» |

### 1.3 Sequential Deal (новый dealId)

| AC-ID | Измеримый результат | Сценарий | Экран | Данные | Доказательство | Не-доказательство |
|-------|---------------------|----------|-------|--------|----------------|-------------------|
| AC-SD-01 | После closed следующей Deal создаётся с **новым** `dealId`; старая неизменна | S-x-07, ADR-008 | E-project / E-deal | Deal[] history | Сравнить id; patch closed Deal → reject | «Можно снова нажать Исход» |
| AC-SD-02 | Ровно одна active Deal на project | S-x-01 System | E-deal | Deal.active uniqueness | Попытка второй active → блок | «В UI одна вкладка» |
| AC-SD-03 | Project при deferred **не** Done только из‑за Deal closed | S-x-07 | E-project | Project UX phase | После closed + deferred → Active/не Done | «Бейдж Closed на сделке» |
| AC-SD-04 | Quote N+1 на **новой** Deal после sequential — новый QuoteRevision с новым dealId | S-x-07 | E-deal | QuoteRevision.dealId required | Sent старой Deal не «переезжает» | «Форма КП открылась» |

### 1.4 Tech-ready

| AC-ID | Измеримый результат | Сценарий | Экран | Данные | Доказательство | Не-доказательство |
|-------|---------------------|----------|-------|--------|----------------|-------------------|
| AC-TR-01 | Crew inbox только accepted + ordered + tech-ready | S-sales-03, S-x-03, S-crew-01 | E-home crew, E-room | roomAssent, detailed, materials, assignee | Комната только preliminary **не** в install pool | «Роль crew залогинена» |
| AC-TR-02 | Preliminary в КП ≠ tech-ready | S-sales-06 | E-room, E-deal | calculation.preliminary vs detailed | Флаг tech-ready false без detailed | «Сумма в КП есть» |
| AC-TR-03 | Нет detailed / материалов / ответственного → blocker или запрет передачи | S-crew-02 | E-room install | Blocker | Не тихое closed | «Кнопка Препятствие существует» |

### 1.5 Sent Quote immutable

| AC-ID | Измеримый результат | Сценарий | Экран | Данные | Доказательство | Не-доказательство |
|-------|---------------------|----------|-------|--------|----------------|-------------------|
| AC-QI-01 | После `sent_confirmed` revision immutable (суммы/состав/snapshot) | S-sales-01, ADR-008 | E-deal | QuoteRevision | PATCH sent → 4xx/блок; UI предлагает N+1 | «Поле disabled в CSS» |
| AC-QI-02 | Пересчёт calc комнаты не меняет sent revision | S-sales-01, S-measurer-02 | E-room, E-deal | Room.calc vs Quote snapshot | Изменить calc; sent суммы те же | «Калькулятор сохранился» |
| AC-QI-03 | N+1 = новый экземпляр на **той же** active Deal (`dealId` обязателен) | S-sales-02 | E-deal | QuoteRevision.dealId | Новый id revision; тот же dealId | «Версия v2 в заголовке без записи» |

### 1.6 Checklist монтажа

| AC-ID | Измеримый результат | Сценарий | Экран | Данные | Доказательство | Не-доказательство |
|-------|---------------------|----------|-------|--------|----------------|-------------------|
| AC-CL-01 | Чек-лист обязателен до closed: пункты done или N/A+причина | S-crew-01 | E-room install | InstallChecklist | Closed без полного чек-листа → блок | «Список пунктов на экране» |
| AC-CL-02 | Blocker фиксируется с типом (no_scheme / no_materials / install_question / contact_responsible) | S-crew-02 | E-room | Blocker | Создан blocker; closed заблокирован при open blocker **Assumption:** open blocker блокирует closed | «Иконка warning» |
| AC-CL-03 | Crew не видит коммерческий итог / quote amount | S-crew-01 | E-room / redact | API/UI redact | Запрос суммы КП → скрыто/403 | «Нет пункта КП в меню» |

### 1.7 RBAC

| AC-ID | Измеримый результат | Сценарий | Экран | Данные | Доказательство | Не-доказательство |
|-------|---------------------|----------|-------|--------|----------------|-------------------|
| AC-RB-01 | Admin **не** может delete чужой project | S-admin-02, D10 | E-partner / projects | Project org isolation | DELETE → 403; UI без destroy | «Admin read-only бейдж» |
| AC-RB-02 | Admin: агрегаты + ограниченная диагностика; не полевой CRM | S-admin-02 | E-partner-card | Aggregates only | Нет полного ObjectsPanel-операционки чужой org | «Страница Partners открывается» |
| AC-RB-03 | Sales: PM + preliminary по праву; detailed — по флагу | S-sales-04/06/07 | E-room tools | RBAC flags | Без флага detailed → блок | «Кнопка Calc видна» |
| AC-RB-04 | Org-изоляция сотрудников/назначений | S-sales-03 | E-assignments | Assignments | Чужой org user не назначаем | «Select рендерится» |
| AC-RB-05 | One-time credentials: пароль не показывается повторно в карточке | S-admin-01 | E-partners create | SessionUser hash | Повторный view без plaintext | «Пароль скопировали один раз вручную» |

### 1.8 Offline / anti-loss

| AC-ID | Измеримый результат | Сценарий | Экран | Данные | Доказательство | Не-доказательство |
|-------|---------------------|----------|-------|--------|----------------|-------------------|
| AC-OF-01 | Черновик комнаты / session draft не теряется при offline | S-owner/sales errors, S-x-05 | E-room, quick-entry | outbox / pendingSync | Airplane mode → draft recoverable | «PWA установлено» |
| AC-OF-02 | Повторный save того же draft не создаёт дубликат комнаты | S-sales-05 | BindModal | Room id stable | Два save → один roomId | «Тост Успех» |
| AC-OF-03 | События дедупятся по eventId после офлайна | D5/events ориентир | sync | PlatformEvent | `dedupeEventsById` | «Счётчик событий в CI» |
| AC-OF-04 | Save tool без bind/project запрещён (анти-разрыв) | S-x-05 | Tool → Bind | SessionDraft | Silent create без имени → блок | «Tool route 200» |
| AC-OF-05 | Two-device calc: stale expectedRevision → 409; обе revision recoverable | S-calc-05, GB-P0-03 | E-calc-save | CalculationRevision[] | Device A+B save; history has both; no silent LWW | «Тост Конфликт» без истории |
| AC-OF-06 | Reconnect flush: Idempotency-Key не создаёт duplicate Project/Deal | A-11 | E-quick-bind | Project+Room+Deal | Retry same key → same ids | «Два успеха в логе» |

### 1.9 Training isolation

| AC-ID | Измеримый результат | Сценарий | Экран | Данные | Доказательство | Не-доказательство |
|-------|---------------------|----------|-------|--------|----------------|-------------------|
| AC-TI-01 | LearningAttempt всегда `context: training`; ∉ sales funnel | D9, S-admin-02 | E-academy-hub | LearningAttempt | `learningAttemptAffectsSalesFunnel` false; funnel counts unchanged | «Академия в навбаре» |
| AC-TI-02 | `training_*` / context training|demo не в `countsTowardSalesKpi` | D9/D10 | E-analytics | PlatformEvent | Assert exclusion | «Вкладка Training есть» |
| AC-TI-03 | Хаб: P0 sales chat + слоты не-чат | D9 AC-D9-01/07, ADR-006 | E-academy-hub | Scenario slots | ≥2 типа механик в UI | «Два чата в списке» |
| AC-TI-04 | Opening ≠ mastery; false promise −25 score | D9 | Trainer Feedback | score | Unit + ручной false promise | «Score отображается» |
| AC-TI-05 | Open материала ∉ KPI продаж | S-admin-03 | E-materials | Material open event | Не двигает Deal funnel | «Файл открылся» |
| AC-TI-06 | StP контур 5 шагов; training отдельно от outcomes | S-admin-02, D10 | E-partner-card | Intervention.result vs Deal | Adoption ≠ conversion widget | «График на дашборде» |

### 1.10 Migration assent (GB-P0-02)

| AC-ID | Измеримый результат | Сценарий | Экран | Данные | Доказательство | Не-доказательство |
|-------|---------------------|----------|-------|--------|----------------|-------------------|
| AC-MG-01 | Sent-only quote → roomAssent unknown; не ordered | D5 M-F1 | migrate job | roomAssent | Fixture assert | «Есть sent в истории» |
| AC-MG-02 | Ambiguous → needs_review; exclude KPI amount + crew inbox | D5 M-F5 | E-home-crew, analytics | assent | Room not in install pool | «Комната в проекте» |
| AC-MG-03 | Accepted partial evidence → ordered only evidenced rooms | D5 M-F4 | migrate | roomAssent | Scope match | «Все комнаты из PDF» |

---

## 2. Покрытие сквозных сценариев (трассировка)

| Сценарий | Обязательные AC-ID |
|----------|-------------------|
| S-x-01 golden | AC-GP-01…04, AC-QI-01, AC-TR-01, AC-CL-01 |
| S-x-03 sales→crew | AC-TR-01…03, AC-CL-01…03 |
| S-x-04 partner→StP | AC-TI-06, AC-RB-01…02, AC-D10-* |
| S-x-05/06 tool bind | AC-GP-02, AC-OF-01…04 |
| S-x-07 sequential | AC-SD-01…04 |
| S-sales-02a early | AC-EL-01…03 |
| S-admin-02 contour | AC-TI-02/06, AC-RB-01, D10 AC-D10-01…08 |
| D9 trainers | AC-TI-01…05 |

---

## 3. Минимальный набор доказательств (артефакты проверки)

| Тип доказательства | Когда достаточно |
|--------------------|------------------|
| Ручной сценарий с фикстурой org | UX-инвариант + видимость |
| Авто assert на shared helpers | KPI isolation, score, funnel, payload safe |
| RBAC/API negative test | delete forbidden, redact, 403 |
| Analytics query до/после | early loss visible; training excluded |
| State dump Deal/Quote ids | sequential + immutable |

**Недостаточно одних:** screenshot экрана; green pipeline без assert на инвариант; «роль переключается».

---

## 4. Счётчик ключевых AC (§1 data/RBAC)

| Блок | Число AC |
|------|----------|
| Golden path | 4 |
| Early loss | 5 |
| Sequential Deal | 4 |
| Tech-ready | 3 |
| Sent immutable | 3 |
| Checklist | 3 |
| RBAC | 5 |
| Offline / anti-loss | 6 |
| Training isolation | 6 |
| Migration assent | 3 |
| **Итого ключевых AC в §1** | **42** |

Дополнительно: D9/D10 локальные AC; §7 UX usability — **отдельный** набор (не заменяет §1).

---

## 5. Assumptions

1. **Assumption A-33:** колонка «Экран» = ID из D3/D4; логическая приёмка инварианта не ждёт Gate C pixels.  
2. **Assumption A-04:** open Blocker блокирует `room.closed` (AC-CL-02).  
3. **Assumption A-34:** negative RBAC — API и UI.  
4. **Assumption:** offline proof = outbox + AC-OF-05 two-device (больше не «LWW ok»).  
5. «Ключевые AC» §1 + §7 usability = минимум Gate B specification; observed UX scores = Gate C.

---

## 6. Явный out-of-scope

- Gate C: wireframes / HTML-прототипы как замена доказательства.  
- Продуктовый код `apps/*` до OK на Gate B.  
- Done по «файл спеки существует» / «маршрут открылся» — **запрещён** (§0 и §7).  
- Помечать Gate B approved без owner OK — запрещено.

---

## 7. UX usability acceptance (GB-P0-06) — независимо от data AC

**Различие:** §1 = инварианты данных/RBAC (**specified tests**). Этот раздел = **человеческое понимание и успешное завершение задачи** на будущем интерактивном прототипе Gate C **без объяснения модератора**.  
**Observed results** (first-click, confusion, comments) фиксируются в Gate C/E — здесь только критерии и задачи.

### 7.1 Протокол наблюдения (Gate C)

Для каждой задачи записать: first-click success (Y/N), blocking confusion (Y/N + где), re-entry of data (Y/N), clarity of next step (1–5), recovery behavior, device (mobile/desktop), user comments.  
**Не Done**, если: маршрут просто открылся; пользователь «в итоге нашёл» после долгих блужданий; данные введены повторно из-за UX.

### 7.2 Задачи по ролям

| AC-ID | Роль | Задача (без подсказки) | Успех = |
|-------|------|------------------------|---------|
| AC-UX-S01 | sales | Начать новый inquiry / проект | Проект+комната созданы осознанно |
| AC-UX-S02 | sales | Получить предварительный ориентир и сохранить в **правильную** комнату | Preliminary на нужном roomId |
| AC-UX-S03 | sales | Создать / share / confirm_sent КП | lifecycle sent_confirmed; copy≠sent понятен |
| AC-UX-S04 | sales | Поставить паузу и позже возобновить | Тот же dealId; не «новая сделка» |
| AC-UX-M01 | measurer | Найти назначенную комнату | ≤2 осмысленных перехода с home |
| AC-UX-M02 | measurer | Detailed calc → save → вернуться в комнату | Detailed revision; back to same room |
| AC-UX-C01 | crew | Найти своё задание | Только ordered+tech-ready |
| AC-UX-C02 | crew | Прочитать схему/чек-лист и зафиксировать blocker | Blocker создан; next step ясен |
| AC-UX-O01 | owner | Найти, что требует вмешательства | Inbox item → правильная сущность |
| AC-UX-O02 | owner | Назначить ответственность (crew/measurer) | Assignment сохранён |
| AC-UX-A01 | StP admin | Найти фактический stalled stage партнёра | PartnerCard / сигнал с этапом |
| AC-UX-A02 | StP admin | Инициировать support / intervention | Case или Intervention создан |

### 7.3 Анти-критерии

- «Кнопка нашлась на 4-м экране» ≠ first-click success.  
- Повторный ввод площади/геометрии после «успешного» save = fail AC-UX-M02/S02.  
- Смешение training и sales KPI на одном виджете без подписи = fail admin clarity.

---

## Связь

- Сценарии: [02-role-scenarios.md](./02-role-scenarios.md)  
- IA: [03-information-architecture.md](./03-information-architecture.md)  
- Screen coverage: [gate-b-screen-coverage-matrix.md](./gate-b-screen-coverage-matrix.md)  
- Академия: [09-academy.md](./09-academy.md)  
- StP: [10-stp-support-analytics.md](./10-stp-support-analytics.md)  
- Идентичность Deal/Quote: [adr/008-deal-quote-project-identity.md](./adr/008-deal-quote-project-identity.md)
