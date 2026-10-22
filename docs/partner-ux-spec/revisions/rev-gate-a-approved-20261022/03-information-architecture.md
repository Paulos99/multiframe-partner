# D3 — Информационная архитектура

**Revision:** `rev-gate-a-approved-20261022`  
**Зависит от:** [D2](./02-role-scenarios.md), [D2a](./02a-responsibility-matrix.md)  
**Статус Gate A:** согласован **условно** (три корректировки — [ADR-008](./adr/008-deal-quote-project-identity.md)).

**Граница:** ниже — продуктовая логика и **пользовательские** переходы. Техконтракты API/полей — Gate B / D5, не дублировать здесь как спеку API.

---

## 1. Навигационный каркас (одна платформа)

```text
[ Chrome: компания · роль · sync · профиль ]
[ Nav по зоне роли ]     [ Workspace: один активный экран ]
```

| Зона nav | admin | owner | sales | measurer | crew |
|----------|-------|-------|-------|----------|------|
| Сегодня / Inbox | Сигналы | Сегодня | Сегодня | Мои замеры | Мои задания |
| Основной каталог | Партнёры | Проекты | Проекты / Сделки* | Проекты (свои) | Задания (= комнаты install) |
| Организация | — | Компания, Сотрудники | Сотрудники (assign) | — | — |
| Аналитика | Сеть (+ training отдельно) | Компания | Компания | — | — |
| Инструменты | secondary | да | да (+ quick-entry) | да | secondary† |
| Обучение | Материалы + Академия | то же | то же | то же | то же |

\*У sales «Сделки» — **фильтр/фокус** над теми же проектами, не второй каталог сущностей.

†**Crew / Tools:** просмотр схемы как help; **persist сметы** нет.

**Admin / каталог проектов:** PartnerCard / support / **агрегаты + ограниченная диагностика**; **без delete** чужих проектов; не полевой CRM.

**Запрет:** стек Inbox + каталог + CommercialPanel + EntryPoints на одном route (ADR-003).

---

## 2. Карта экранов

### 2.1 Глобальные

| ID | Экран | Назначение | Входы |
|----|-------|------------|-------|
| E-login | Вход | Auth / демо-роли | URL |
| E-home | Home роли | Inbox + CTA (новый проект / quick-entry / из сегодня) | после login |
| E-tools | Инструменты | PM / Calc с контекстом или quick-entry | nav |
| E-quick-bind | Привязка после tool | Выбрать/создать проект+комнату перед persist | Save из session draft |
| E-academy-hub | Академия | Хаб механик | Обучение |
| E-materials | Материалы | Библиотека STP | Обучение |
| E-help-cabinet | Справка | Как работать в IA | Обучение |
| E-support | Помощь StP | Case + контекст модуля | CTA |
| E-pm | Проблемомер | Диагностика → save/bind | комната / quick / tools |
| E-calc | Калькулятор | Preliminary или detailed → save/bind | комната / quick / tools |

### 2.2 Проект и комната

| ID | Экран | Назначение |
|----|-------|------------|
| E-projects | Список проектов | Поиск, фильтры, создание |
| E-project | Карточка проекта | Комнаты, итог (анти-двойной учёт), вкладки |
| E-project-deal | Проект → Сделка | Assignments, КП, outcome, roomAssent |
| E-room | Карточка комнаты | Статус, preliminary/detailed, CTA, чек-лист/блокеры |
| E-room-docs | Документы комнаты | Смета / профиль / версии |
| E-room-install | Монтаж комнаты | Чек-лист P0, blockers, close |

Иерархия **Проект → Комнаты** — канон ([ADR-002](./adr/002-project-rooms-over-objects-panel-first.md)).

### 2.3 Организация и сеть

| ID | Экран | Роли |
|----|-------|------|
| E-org | Компания / прайс | owner |
| E-staff | Сотрудники | owner (create/reset credentials); sales — assign only |
| E-partners | Партнёры сети | admin |
| E-partner-card | Карточка / сигналы / контур помощи | admin |
| E-analytics | Дашборд продаж | admin сеть; owner/sales компания |
| E-analytics-training | Срез обучения | admin (отдельно от конверсии) |

### 2.4 Переходы (пользовательские)

```mermaid
flowchart TD
  Login[E-login] --> Home[E-home]
  Home --> Projects[E-projects]
  Home --> RoomDirect[E-room_из_inbox]
  Home --> Quick[E-pm_или_E-calc_quick]
  Home --> Support[E-support]
  Projects --> Project[E-project]
  Project --> Room[E-room]
  Project --> Deal[E-project-deal]
  Room --> PM[E-pm]
  Room --> Calc[E-calc]
  Room --> Install[E-room-install]
  PM -->|save_с_контекстом| Room
  Calc -->|save_prelim_или_detailed| Room
  Quick --> Bind[E-quick-bind]
  Bind --> Room
  Tools[E-tools] -->|picker_или_quick| Room
  Home --> Academy[E-academy-hub]
```

---

## 3. Иерархия Проект → Комнаты (UX-правила)

1. Список верхнего уровня — **проекты**.  
2. Внутри — **комнаты** со статусом исполнения и индикаторами preliminary / detailed / профиль.  
3. Предварительный итог проекта: на комнату берётся **detailed, иначе preliminary** (с пометкой); **запрет** складывать оба. Подпись: «не зафиксированное КП».  
4. Создание: «Новый проект» (≥1 комната) или quick-entry → bind/create.  
5. Запрещён плоский список «объектов» как главная модель.  
6. Канбан — опциональное представление, якорь — проект.

---

## 3a. Точки входа в работу

1. **Новый клиент (полные данные)** → проект+комната → PM/Calc.  
2. **Продолжить комнату** → inbox / проект.  
3. **Quick-entry** → PM/Calc без адреса/телефона → **E-quick-bind** при save ([ADR-007](./adr/007-quick-entry-without-full-client-card.md)).  
4. «Консультация» ≈ кабинетный PM-путь; отдельный visitor-путь сайта не дублировать тремя виджетами на home.

EntryPoints-стек на home — убрать (ADR-003). CTA home: «Новый проект», «Быстрая консультация», «Быстрый расчёт», «Открыть из сегодня».

---

## 3b. Quick-entry bind (UX)

**Основной порядок:** открыть инструмент → получить результат → Save → выбрать/создать комнату → confirm persist.

```mermaid
stateDiagram-v2
  [*] --> SessionDraft: старт_PM_или_Calc_без_полной_карточки
  SessionDraft --> SessionDraft: работа_в_tool_результат_в_draft
  SessionDraft --> BindModal: пользователь_Save
  BindModal --> PickExisting: выбрать_проект_и_комнату
  BindModal --> CreateMin: создать_проект_с_ярлыком_и_комнатой
  PickExisting --> Saved: confirm_persist_в_комнату
  CreateMin --> Saved: confirm_persist_в_новую_комнату
  BindModal --> SessionDraft: отмена
  SessionDraft --> Abandoned: выход_с_confirm
  Saved --> [*]
  Abandoned --> [*]
```

Правила: bind **после** результата и Save, не до расчёта; нет безымянных проектов; повторный save того же draft → та же комната; телефон/адрес можно дополнить на E-project позже (до confirm_sent достаточно способа передачи КП — см. review §8).

---

## 4. Академия и аналитика StP в IA

### 4.1 Академия

```text
E-academy-hub
 ├─ Продажи и возражения → чат-симуляции  ← приоритет v1
 ├─ Расчёты и практика замера → не-чат     ← далее
 └─ Монтаж → не-чат (в т.ч. чеклист-симуляция) ← далее
```

`context: training` ∉ KPI продаж; отдельный срез E-analytics-training.

### 4.2 Контур StP (продуктовая аналитика)

На E-partner-card / E-analytics (не отдельный «пятый кабинет»):

1. Сигнал затруднения  
2. Диагностика  
3. Обращение / действие StP  
4. Проверка применения инструментов  
5. Оценка последующих результатов (Deal.outcome)  

Сценарий: S-admin-02. Деталь метрик — D10 (Gate B).

---

## 5. State diagrams (продукт / UX)

Ниже — состояния для пользователя. Не JSON-схемы.  
**SoT коммерции:** [ADR-004](./adr/004-deal-separate-from-room-status.md).

### 5.0 Сводка SoT vs производное

| Состояние | SoT? | Где живёт |
|-----------|------|-----------|
| Deal.outcome | **да** | Deal |
| Deal.stage | **да** | Deal |
| Deal.roomAssent | **да** | Deal |
| QuoteRevision.lifecycle (created/shared/sent_confirmed) | **да** (документ) | Quote |
| Project UX: ReadyForQuote / InCommercial / … | **нет** — производное | UI от Deal + rooms |
| Room.status | **да** (исполнение) | Room |
| Room blocker / checklist | **да** (операционка) | Room |
| Конверсия | **Deal.outcome=accepted** | аналитика |

### 5.1 Project (UX-жизненный цикл — производные фазы)

```mermaid
stateDiagram-v2
  [*] --> EmptyDraft: создать_или_quick_bind
  EmptyDraft --> Active: есть_≥1_комната
  Active --> Active: комнаты_контакты_calc
  Active --> ReadyForQuote: достаточно_calc_по_комнатам
  ReadyForQuote --> InCommercial: создано_КП_на_активной_Deal
  InCommercial --> InInstall: outcome_accepted_плюс_ordered
  InCommercial --> Parked: postponed_или_no_response
  InCommercial --> Lost: declined_на_активной_Deal
  InInstall --> Active: deal_closed_но_есть_deferred_или_следующий_заказ
  InInstall --> Done: нет_активной_Deal_и_нет_deferred_все_релевантные_closed
  Parked --> InCommercial: возобновление_той_же_Deal
  Lost --> Active: новая_Deal_новый_dealId
  Active --> ReadyForQuote: повторный_заказ_sequential_Deal
  Done --> Active: явный_новый_заказ_новая_Deal
  Done --> [*]
```

`ReadyForQuote` / `InCommercial` / `Done` — **индикаторы UI**, не параллельный SoT исхода. Исход — только Deal.outcome.  
**Закрытие одной Deal ≠ Project Done**, если есть deferred-комнаты или последующие заказы ([ADR-008](./adr/008-deal-quote-project-identity.md)).

### 5.2 Room (исполнение)

```mermaid
stateDiagram-v2
  [*] --> Draft: комната_создана
  Draft --> Measured: замер_завершён
  Draft --> Draft: PM_prelim_pendingSync
  Measured --> Measured: обновление_detailed_профиля
  Measured --> TechReady: detailed_материалы_ответственный
  TechReady --> Install: передача_ordered_после_accepted
  Measured --> Measured: только_preliminary_недостаточно_для_install
  Install --> Blocked: crew_зафиксировал_препятствие
  Blocked --> Install: blocker_снят
  Install --> Closed: чек_лист_и_закрытие
  Measured --> Closed: редкий_путь_без_монтажа_если_разрешено
  Closed --> [*]

  note right of Measured
    ярлык_quote_sent_убран_из_нового_UI
    коммерция_на_Deal
    совместимость_данных_сохранить
  end note
  note right of TechReady
    preliminary_в_КП_ок
    для_бригады_нужен_detailed
  end note
```

Чек-лист монтажа — часть состояния Install (P0), обязателен; N/A с причиной; исключения waive — Gate B.

### 5.3 Calculation (два типа → комната)

Порядок quick-entry совпадает с §3b: **результат → Save → bind → persist** (не bind до расчёта).

```mermaid
stateDiagram-v2
  [*] --> OpenNoRoom: Tools_или_quick_без_комнаты
  [*] --> OpenInRoom: вход_из_комнаты
  OpenNoRoom --> RoomPicked: picker_до_tool
  OpenNoRoom --> SessionDraft: quick_entry
  OpenNoRoom --> Abandoned: назад
  SessionDraft --> AreaMode: режим_площади_в_draft
  SessionDraft --> SchemeMode: геометрия_в_draft
  OpenInRoom --> AreaMode: режим_площади
  OpenInRoom --> SchemeMode: геометрия_чертёж
  RoomPicked --> AreaMode
  RoomPicked --> SchemeMode
  AreaMode --> AreaPreview: предварительный_estimate
  AreaPreview --> BindThenSave: CTA_Save_без_комнаты
  AreaPreview --> SavedPreliminary: CTA_Save_в_известную_комнату
  AreaPreview --> SchemeMode: уточнить_раскладку
  AreaPreview --> Abandoned: выход
  SchemeMode --> SchemeReady: схема_и_BOM
  SchemeReady --> BindThenSave: CTA_Save_без_комнаты
  SchemeReady --> SavedDetailed: CTA_Save_в_известную_комнату
  BindThenSave --> SavedPreliminary: E_quick_bind_persist_prelim
  BindThenSave --> SavedDetailed: E_quick_bind_persist_detailed
  SavedPreliminary --> [*]
  SavedDetailed --> [*]
  Abandoned --> [*]

  note right of BindThenSave
    порядок_§3b
    Save_затем_pick_или_create_комнаты
  end note
  note right of SavedPreliminary
    preliminary_на_комнате
    не_выдавать_за_схему
    не_меняет_уже_sent_QuoteRevision
  end note
  note right of SavedDetailed
    detailed_вытесняет_preliminary
    в_агрегатах_новых_КП
    tech_ready_для_install
  end note
```

Стены: WallMode **не** в основном пути.  
Агрегация: per room `coalesce(detailed, preliminary)`; никогда `preliminary + detailed`.  
Изменение calc комнаты **не** переписывает суммы уже `sent_confirmed` QuoteRevision — нужна новая версия (§5.4, ADR-004).

### 5.4 Quote (lifecycle **документа**; без accept/decline)

```mermaid
stateDiagram-v2
  [*] --> quote_created: создать_КП_версия_N
  quote_created --> quote_created: copy_или_PDF_правка_до_sent
  quote_created --> quote_shared: share
  quote_shared --> quote_shared: copy_PDF_повторно
  quote_shared --> quote_sent_confirmed: confirm_sent
  quote_created --> quote_sent_confirmed: confirm_sent
  quote_sent_confirmed --> quote_created: новая_версия_N_plus_1

  note right of quote_created
    copy_PDF_не_равны_sent
  end note
  note right of quote_sent_confirmed
    исход_клиента_не_здесь
    см_Deal.outcome
    суммы_и_состав_неизменяемы
    новый_calc_параметр_→_N_plus_1
  end note
```

Версии: каждая N+1 = **новый экземпляр** документа, привязанный к **конкретной активной Deal** (`dealId` обязателен). После `sent_confirmed` экземпляр **immutable**. Новые параметры calc → N+1 на **той же** Deal, не patch sent и не «переезд» на другую Deal. Деталь snapshot — Gate B / D5 ([ADR-008](./adr/008-deal-quote-project-identity.md)).

### 5.5 Deal (воронка + outcome = SoT исхода)

Ранние отказы/паузы **до КП** обязательны: иначе StP не видит потери на консультации/демо.

```mermaid
stateDiagram-v2
  [*] --> contact: проект_или_bind_создал_активную_Deal
  contact --> offered: предложили_MultiFrame
  offered --> assessed: PM_по_комнатам
  assessed --> calculated: есть_prelim_или_detailed
  offered --> calculated: без_PM
  contact --> early_declined: отказ_на_контакте
  offered --> early_declined: отказ_на_предложении
  assessed --> early_declined: отказ_после_PM_демо
  calculated --> early_declined: отказ_после_ориентира
  contact --> early_paused: пауза_до_КП
  offered --> early_paused: пауза_до_КП
  assessed --> early_paused: пауза_до_КП
  calculated --> early_paused: пауза_до_КП
  early_paused --> offered: возобновление
  early_paused --> assessed: возобновление
  early_paused --> calculated: возобновление
  early_paused --> closed: закрытие_с_причиной
  early_declined --> closed: закрытие_проигрышем
  calculated --> quote_created: создано_КП
  quote_created --> quote_shared: share
  quote_shared --> quote_sent_confirmed: confirm_sent
  quote_created --> quote_sent_confirmed: confirm_sent
  quote_sent_confirmed --> outcome_accepted: явный_outcome
  quote_sent_confirmed --> outcome_declined: явный_outcome
  quote_sent_confirmed --> outcome_postponed: явный_outcome
  quote_sent_confirmed --> outcome_no_response: явный_outcome
  outcome_accepted --> install: tech_ready_ordered_в_бригаду
  install --> closed: ordered_closed_и_закрытие_сделки
  outcome_declined --> closed: закрытие_проигрышем
  outcome_postponed --> quote_created: новое_КП_или_возобновление
  outcome_no_response --> quote_created: follow_up_КП
  outcome_no_response --> closed: закрытие_без_ответа
  closed --> [*]
  note right of closed
    закрытая_Deal_неизменна
    следующая_нить_новый_dealId
    Project_не_обязан_Done
  end note
```

Правила:

- Одна **активная** Deal на проект; после `closed` — **новый `dealId`** (sequential) в том же проекте; закрытая Deal **не reopen**. Параллельный multi-order UI **нет**.  
- Переход UX «снова contact» = **create** новой Deal, не возврат старой в `contact` ([ADR-008](./adr/008-deal-quote-project-identity.md)).  
- Ранний исход (`early_declined` / `early_paused`) требует **причину** и **этап** воронки.  
- `outcome_accepted` допускает partial assent (не все комнаты ordered).  
- Передача в install — только после `accepted` **и** tech-ready — D1 §5.6 / D2 S-x-03.  
- Система **не** ставит outcome из `room.closed`.  
- Успешная продажа ≠ завершённый монтаж; **закрытие Deal ≠ завершение Project** при deferred / следующих заказах.  
- Конверсия = `Deal.outcome=accepted` **по dealId**; отдельно — сумма принятого заказа.

Согласование Quote↔Deal: confirm_sent двигает lifecycle документа **этой** Deal + stage; **исход** только на Deal; на Quote нет accept/decline.

---

## 6. «Следующий шаг» как паттерн UI

| Контекст | Плохой next step | Целевой next step |
|----------|------------------|-------------------|
| PM Result в кабинете | Только заявка StP | Сохранить в комнату · Рассчитать · Bind · К проекту |
| Home sales | «Проблемомер» без проекта | Проект X · Quick-entry · Confirm sent · Outcome |
| Home measurer | Общий Tools | Продолжить комнату Y · Detailed save |
| Home crew | PM/Calc primary | Монтаж Z · Чек-лист · Зафиксировать препятствие |
| Calc area | «Объект сохранён» как схема | «Сохранён предварительный» / «постройте схему для detailed» |
| Admin сигнал | Только открыть чат Академии | Диагностика → intervention → проверка применения |

---

## 7. Mobile / desktop акцент

| Роль | Primary viewport |
|------|------------------|
| measurer, crew | Mobile: inbox → room → tool/checklist → back |
| sales, owner | Desktop: projects + deal; mobile — те же сущности |
| admin | Desktop сеть + контур помощи |

---

## 8. Соответствие текущему коду (аудит → цель)

| Сейчас | Цель Gate A (`rev-gate-a-final-candidate`) |
|--------|------------------------|
| ObjectsPanel = главный workspace | E-projects / E-project / E-room |
| SalesHome стек 4 блоков | E-home **или** E-project-deal |
| ProjectsCabinet orphan | Влить в E-project |
| JobObject.status quote_sent | Убрать из нового UI; SoT на Deal; совместимость данных |
| Area не сохраняется | Preliminary save в комнату |
| EntryPoints без контекста | Quick-entry: tool → result → Save → bind → persist |
| Academy = 2 chat | Hub + тренажёры продаж сначала; не-чат далее |
| Нет чек-листа / blockers | E-room-install P0; tech-ready до install |
| Quote accept на диаграмме draft-1 | Исход только Deal.outcome; early decline до КП |
| Живой пересчёт sent КП | Immutable sent QuoteRevision → N+1 |
| Один Deal навсегда / parallel multi-order | Sequential следующая Deal после closed |

---

## Связанные документы

- [01-product-architecture.md](./01-product-architecture.md)  
- [adr/](./adr/)  
- [gate-a-review.md](./gate-a-review.md)  
- [gate-a-changelog-draft-1-to-2.md](./gate-a-changelog-draft-1-to-2.md)
