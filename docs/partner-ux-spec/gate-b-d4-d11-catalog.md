# Gate B inventory — D4 screens + D5–D11

**Source:** `docs/04-screen-specs/` (все `e-*.md`) + D5–D11  
**Revision:** `rev-gate-b-draft-1`  
**Mode:** readonly extract · файлы не менялись

---

## Part A — D4 screen specs (~15)

Индекс: `docs/04-screen-specs/00-index.md` — 15 кластеров (E-home-* = пять homes в одном файле).

---

### 1. E-login — Вход (`e-login.md`)

1. **ID / имя:** E-login · Вход  
2. **Назначение:** Аутентификация; выбор контекста компании; без операционного UI.  
3. **Ключевые элементы:** Бренд / название кабинета → форма login/password (или демо-роли) → inline-ошибка. Не показывать inbox / ObjectsPanel / EntryPoints. CTA: Войти; secondary — Демо-роли (?demo=1), сброс пароля.  
4. **Переходы:** Успех → E-home роли; ошибка → остаёмся.  
5. **Роли:** Все (публичный экран); после входа RBAC → home.  
6. **Состояния:** loading (disabled + spinner); error (неверный логин/сеть, без утечки «логин существует»); offline (сообщение + повтор). Mobile: полная ширина, sticky CTA.

---

### 2. E-home-* — Пять домашних экранов (`e-home-roles.md`)

1. **ID / имя:** E-home-* · admin / owner / sales / measurer / crew homes  
2. **Назначение:** Next actions + быстрый вход в сущность; не стековать каталог + КП + tools (ADR-003).  
3. **Ключевые элементы:** Заголовок роли + фокус дня → Inbox next actions (макс. N≈8) → одна primary CTA-зона.  
   - **admin:** сигналы сети / cases → PartnerCard / сигнал  
   - **owner:** сделки + назначения + проекты без next → Новый проект  
   - **sales:** confirm_sent / outcome / tech-ready / sequential Deal → Quick-entry или Новый проект  
   - **measurer:** черновики / замеры / detailed pending → Продолжить комнату / Новый с поля  
   - **crew:** install ordered+tech-ready → Открыть монтаж  
4. **Переходы:** Inbox → E-project / E-room / E-project-deal / E-room-install / E-partner-card; Новый проект → E-inquiry; Quick → E-pm / E-calc.  
5. **Роли:** Все пять; quick-entry не у crew/admin.  
6. **Состояния:** skeleton inbox; empty «Нет задач» + CTA; sync banner; offline из local cache (+ устарело). Mobile-first для measurer/crew.

---

### 3. E-nav — Chrome и навигация (`e-nav-chrome.md`)

1. **ID / имя:** E-nav · Chrome / nav  
2. **Назначение:** Ориентация: зона роли, sync, компания; переходы между доменами без потери projectId/roomId.  
3. **Ключевые элементы:** Компания · роль · sync → nav по зоне (Сегодня · Проекты/Сделки · Орг · Аналитика · Инструменты · Обучение) → один активный workspace. Не дублировать CTA сущности в chrome.  
4. **Переходы:** Nav → соответствующий E-*; deep-link сохраняет entity ids.  
5. **Роли:** Все авторизованные; пункты скрыты по RBAC (D3).  
6. **Состояния:** sync spinner; toast «не сохранено»; Offline badge + очередь. Mobile: bottom tab 3–4 зон + «Ещё».

---

### 4. E-projects — Список проектов (`e-projects.md`)

1. **ID / имя:** E-projects · Каталог проектов  
2. **Назначение:** Найти/открыть проект; создать inquiry; фильтр по UX-стадии / ответственному.  
3. **Ключевые элементы:** Поиск + фильтры → список (клиент/адрес/фаза UX/Deal stage) → FAB «Новый проект». Не встраивать КП editor / calc iframe.  
4. **Переходы:** Row → E-project; Новый → E-inquiry.  
5. **Роли:** owner, sales, measurer; crew — нет (задания); admin — не полевой CRM / PartnerCard.  
6. **Состояния:** skeleton; empty + CTA; retry; offline cached + badge.

---

### 5. E-project — Карточка проекта (`e-project.md`)

1. **ID / имя:** E-project · Карточка проекта  
2. **Назначение:** Обзор комнат + активная Deal; вход в комнату/сделку; deferred после closed Deal.  
3. **Ключевые элементы:** Шапка (клиент/адрес/ярлык) → вкладки **Комнаты | Сделка | История Deal** → список Room + статусы + calc badges → предварительный итог (anti-double-count, скрыт от crew). Запрет: calc + quote editor + ObjectsPanel на одном viewport.  
4. **Переходы:** Room → E-room; Deal → E-quote-deal; Sequential CTA → new dealId → E-quote-deal.  
5. **Роли:** sales/owner/measurer R/W; crew — только assigned rooms; admin — diagnose, no delete.  
6. **Состояния:** skeleton; empty rooms + CTA; partial fail; offline read cache / write queued.

---

### 6. E-inquiry — Создать проект / inquiry (`e-create-inquiry.md`)

1. **ID / имя:** E-inquiry · Новый проект  
2. **Назначение:** Project + первая Room + active Deal(contact) с минимальными полями (не полный CRM).  
3. **Ключевые элементы:** Заголовок → поля (ярлык, клиент/телефон/адрес опц., город, имя комнаты) → Submit. Secondary: «Сначала быстрый расчёт».  
4. **Переходы:** Успех → E-project (или E-room с поля для measurer); quick → tools path.  
5. **Роли:** sales, owner, measurer; crew/admin — нет create org projects.  
6. **Состояния:** submit loading; validation inline; offline local pendingSync; conflict → merge D5.

---

### 7. E-room — Карточка комнаты (`e-room.md`)

1. **ID / имя:** E-room · Комната  
2. **Назначение:** Исполнение помещения: профиль, calc types, документы, tech-ready, монтаж.  
3. **Ключевые элементы:** Шапка (roomName · статус · badges prelim/detailed/tech-ready) → документы → CTA (PM · Calc prelim · Calc detailed · Монтаж) → Assignments / blockers. Нет: КП editor, commercial total, wall mode.  
4. **Переходы:** → E-pm, E-calc, E-install, E-room-docs; назад → E-project.  
5. **Роли:** measurer, sales, owner; crew при install assignment.  
6. **Состояния:** skeleton; empty docs + CTA PM/Calc; sync fail pendingSync; offline draft + outbox Save.

---

### 8. E-tools — Инструменты (`e-tools.md`)

1. **ID / имя:** E-tools · Хаб PM / Calc  
2. **Назначение:** Выбрать инструмент с контекстом комнаты **или** quick-entry.  
3. **Ключевые элементы:** Две карточки (Проблемомер · Калькулятор) → переключатель «В комнате X» / «Быстрый старт». Не стек объектов + CommercialPanel.  
4. **Переходы:** → E-pm / E-calc; Save без контекста → E-calc-save bind / E-quick-bind.  
5. **Роли:** sales, owner, measurer; crew — просмотр схемы без persist.  
6. **Состояния:** empty (нет комнат → quick/create); offline tool local + outbox persist.

---

### 9. E-pm — Проблемомер (`e-pm.md`)

1. **ID / имя:** E-pm · Проблемомер (кабинет)  
2. **Назначение:** Сформировать потребность в ЗИ в контексте натяжного; сохранить профиль в комнату. Детали потока — D6.  
3. **Ключевые элементы:** Один шаг потока (Room params → Result); CTA Result: Сохранить · Рассчитать · Bind · К проекту (не только StP lead).  
4. **Переходы:** Save → E-room/bind; Calc → E-calc; Back → E-room/tools.  
5. **Роли:** sales, owner, measurer; crew read-only profile.  
6. **Состояния:** Processing loading; model fail; offline draft answers. AC: нет вопроса типа потолка; можно skip → calc.

---

### 10. E-calc-save — Сохранение расчёта и bind (`e-calc-save.md`)

1. **ID / имя:** E-calc-save · Save calc + bind  
2. **Назначение:** Явно сохранить preliminary или detailed; без контекста — bind/create. Порядок: result → Save → bind → persist (ADR-007).  
3. **Ключевые элементы:** Тип Save (Preliminary vs Detailed) → confirm «в комнату X» **или** E-quick-bind (pick/create) → success.  
4. **Переходы:** Успех → E-room; при sent КП — warning «нужна Quote N+1».  
5. **Роли:** sales, owner, measurer (detailed по правам).  
6. **Состояния:** persist spinner; error + draft intact; offline outbox «сохранено локально»; conflict LWW + warning.

---

### 11. E-quote / E-deal — Сделка: КП и follow-up (`e-quote-deal.md`)

1. **ID / имя:** E-quote / E-deal · КП + Deal  
2. **Назначение:** Воронка Deal; версии КП; confirm_sent; outcome; roomAssent; early loss; sequential Deal.  
3. **Ключевые элементы:** Шапка Deal (stage · outcome · dealId) → QuoteRevision[] → roomAssent → follow-up (nextActionAt · lossReason) → история прошлых Deal. Одна работа: редактор КП **или** outcome sheet.  
4. **Переходы:** confirm_sent → quote_sent_confirmed; accepted → tech-ready gate; closed+deferred → new dealId; N+1 на той же Deal.  
5. **Роли:** sales R (confirm/outcome); owner A; crew нет; admin read aggregates; measurer не confirm_sent (Assumption).  
6. **Состояния:** empty quotes + CTA; idempotent confirm error; offline queue; immutable sent → N+1.

---

### 12. E-install — Монтажное задание (`e-install.md`)

1. **ID / имя:** E-install · Монтаж  
2. **Назначение:** Чек-лист; blocker; закрыть комнату. Не коммерция.  
3. **Ключевые элементы:** Комната · адрес · техсмета (цены OK) → чек-лист (N/A + reason) → Blockers → Закрыть. Нет commercial total / КП / Deal outcome.  
4. **Переходы:** Close → room closed (≠ Deal.accepted); Blocker → notify sales/owner. Вход только ordered+tech-ready+accepted.  
5. **Роли:** crew R; sales/owner обзор/resolve blocker; measurer может снять tech blocker.  
6. **Состояния:** default checklist template; нельзя closed при open blocker; offline local sync; waive редкий (owner).

---

### 13. E-academy — Академия (`e-academy.md`)

1. **ID / имя:** E-academy · Хаб обучения  
2. **Назначение:** Обучение навыкам; training ∉ KPI продаж. Детали — D9.  
3. **Ключевые элементы:** Хаб навыков (продажи · монтаж · расчёт) → P0 тренажёры (чат-продажи) → прогресс (отдельный контур). Не смешивать с боевыми Deal.  
4. **Переходы:** → chat/visual trainer (D9); назад без записи в Deal funnel.  
5. **Роли:** Все; P0 sales — sales/owner primary; admin — training analytics отдельно.  
6. **Состояния:** empty CTA начать; offline скачанный сценарий.

---

### 14. E-support — Помощь StP (`e-stp-support.md`)

1. **ID / имя:** E-support · Partner support / StP  
2. **Назначение:** Сигнал → диагностика → intervention → verify tools → outcomes. Детали — D10.  
3. **Ключевые элементы:** Контекст модуля (без ПД клиента) → категория/описание → admin: диагностика · intervention · verify. Не полевой CRM чужой компании.  
4. **Переходы:** Admin → PartnerCard; verify → analytics training vs sales.  
5. **Роли:** Партнёр создаёт case; admin ведёт контур; org isolation.  
6. **Состояния:** loading; unsafe PII blocked; offline queue.

---

### 15. E-analytics — Аналитика (`e-partner-analytics.md`)

1. **ID / имя:** E-analytics · Аналитика партнёра / сети  
2. **Назначение:** Воронка по Deal.outcome; сумма accepted отдельно; early losses; tool use; training **отдельный** срез.  
3. **Ключевые элементы:** Переключатель Продажи | Обучение → воронка dealId-based → early loss by stage → tool adoption.  
4. **Переходы:** Segment → filtered projects/deals; admin drill → PartnerCard.  
5. **Роли:** admin (сеть); owner/sales (компания); crew нет.  
6. **Состояния:** empty zeros; query error; offline last snapshot. Mobile: KPI cards.

---

## Part B — D5–D11 summaries

---

### D5 — Модель данных и контракты (`05-data-model-contracts.md`)

- **Граница:** целевые сущности, инварианты, события, RBAC данных, save/sync/recovery, gaps vs shared/API, миграции — не pixel UI и не алгоритмы PM/Calc.
- **Иерархия:** Org → Project → Room[] (profile, prelim/detailed calc, docs, checklist, blockers, status) + Deal[] (0..1 active; roomAssent; QuoteRevision[] с обязательным dealId).
- **Project:** phone/address не обязательны до confirm_sent; closed Deal ≠ archive/Done при deferred (ADR-008).
- **Room:** projectId обязателен (нет orphan); status = исполнение, не outcome; UI без `quote_sent`; coalesce(detailed, preliminary); room.closed ⇏ Deal.accepted.
- **Deal:** новый id на sequential; ≤1 active; closed immutable; conversion = count(accepted) by dealId; amount отдельно; early_* outcomes; roomAssent ordered|deferred|out_of_scope.
- **QuoteRevision:** dealId REQUIRED; version per dealId; sent_confirmed immutable (PATCH → 409); copy/PDF ≠ sent; outcome не на Quote.
- **Assignments / work:** Room draft→measured→tech_ready→install→blocked→closed; checklist done|na+reason; open blocker блокирует closed.
- **Events:** sales / tools / install / training (training ∉ conversion); без ПД клиента.
- **RBAC данных:** admin no delete чужих; sales no staff create (gap vs `canManageStaff=true`); detailed save measurer + sales if allowed; crew checklist close.
- **Save/sync:** SessionDraft TTL~7д; pendingSync/outbox; Idempotency-Key; anti-loss unload confirm; LWW + warning; sent quote никогда не пересчитывать.
- **Gaps / API / миграция:** early_*, roomAssent, dealId required, version per dealId, deprecate Quote accept/decline, hide quote_sent UI, tech_ready/checklist collections, tighten staff/delete; target ops POST projects atomic, deals single-active, confirm-sent idempotent, calculations type, checklist; 7-step backfill plan; AC-D5-01…06.

---

### D6 — Проблемомер потолочников (`06-probleмомер-ceiling.md`)

- **Граница:** кабинетный PM-путь; не visitor UX; не ломаем акустическое ядро / Result chain / honesty; Deal/Quote SoT вне PM.
- **Принципы P1–P7:** клиент за натяжным; PM формирует потребность в ЗИ; тип потолка не в main path (пресет stretch); next step = project/room; PM опционален; одно ядро два UX; sales/owner/measurer.
- **Кабинет vs public:** другие CTA (Save/Calc/Bind/К проекту); persist = profile document на Room; пресет plannedCeiling=stretch; пол сверху unknown.
- **Сценарии:** S-pm-01 из комнаты; S-pm-02 quick-entry Save→bind; S-pm-03 skip→calc; S-pm-04 sales/owner без measurer; S-pm-05 measurer пересчёт (история ≥1 версии).
- **Анкета Room:** дом → перекрытие → толщина → тип комнаты+площадь → стадия → соседи → приоритет; обязательно только комната+площадь; исключены тип потолка, complaint quiz, роль, этаж, стены, год.
- **CTA Result (обязательные):** Save в комнату / Save+bind; Calc; К проекту/комнате; опц. копия сводки; «ещё раз». Запрет единственного StP lead.
- **States:** Processing; model error + retry без потери answers; save network/outbox; offline draft; abandoned confirm.
- **Deal граница:** Save → profile + опц. stage→assessed; не outcome/Quote/install; отказ клиента — на Deal (D8).
- **AC-D6-01…10** + Assumptions (auto-assessed, advanced non-stretch mode, history, shorter Processing, copy в D4).

---

### D7 — Калькулятор потолочников (`07-calculator-ceiling.md`)

- **Граница:** UX preliminary vs detailed; Save/bind/history/anti-loss; стены вне UI (wall-* код не удалять); sent Quote → N+1; anti-double-count. Алгоритмы раскладки не меняем.
- **Два типа:** preliminary = площадь, не схема, не tech-ready; detailed = геометрия+схема+BOM, даёт tech-ready вместе с материалами+ответственный; оба слота сосуществуют; `roomContribution = coalesce(detailed, preliminary)`.
- **RBAC:** sales/owner/measurer Save prelim; detailed — measurer + sales if allowed; crew read-only без persist.
- **Сценарии:** S-calc-01 prelim; S-calc-02 detailed (+ banner N+1 if sent); S-calc-03 quick-entry; S-calc-04 prelim→detailed; S-calc-05 история (≥5/30д Assumption) + dirty confirm; S-calc-06 связь с КП.
- **Save канон:** явный тип CTA → confirm room или E-quick-bind → E-room; запрет silent orphan / area-as-detailed / auto-overwrite sent.
- **State diagram:** Entry → CeilingArea|CeilingScheme → preview/ready → SavedPrelim|SavedDetailed|BindThenSave → NeedQuoteN1.
- **Loading/error/empty:** progress; area≤0 disabled; no scheme block; org без прайса costs null; crew persist скрыт.
- **AC-D7-01…11** + Assumptions (auto stage calculated, history depth, LWW, host iframe may evolve, walls escape hatch not P0).

---

### D8 — Коммерческий процесс (`08-commercial-process.md`)

- **SoT:** outcome на Deal; stage на Deal; Quote = документ created→shared→sent_confirmed; sent immutable; N+1 тот же dealId; sequential = новый dealId; closed ≠ Project Done при deferred; conversion by dealId; amount отдельно; install = accepted+ordered+tech-ready.
- **Сущности:** roomAssent; early_declined / early_paused (+ stageAtOutcome); Quote accept/decline — gap, не SoT.
- **Карта 11 сценариев:** S-com-01…11 (early без calc; PM без calc; early на calculated; prelim КП; точное КП; multi-room; partial assent; sequential; confirm_sent; post-sent outcomes+loss reasons; N+1).
- **confirm_sent:** только явная кнопка; copy/PDF/share ≠ sent; после — immutable + next «зафиксировать ответ».
- **Outcomes post-sent:** accepted (≥1 ordered); declined (reason); postponed / no_response (+ nextActionAt); справочник lossReason (expensive, no_need, …).
- **Partial / sequential:** crew только ordered; Project Active при deferred; reopen запрещён; аналитика по каждому dealId.
- **Сквозной flowchart** contact→interest→PM?→calc?→early?/Quote→confirm→outcome→tech-ready→install→closed→sequential?
- **Next actions table** после ключевых событий; согласование с D6/D7 (КП без PM, early без calc, coalesce, sent immutable).
- **AC-D8-01…12**; gaps vs shared; Assumptions (auto-stage, snapshot fields, confirm channel warning, когда closed после partial, единый lossReason).

---

### D9 — Академия (`09-academy.md`)

- **Граница:** хаб, механики, P0 sales trainers, instructional+game design; training всегда `context: training`; ∉ Deal conversion; не замена E-materials.
- **Хаб:** sell_multiframe + objections (чат P0); слоты calc_sandbox + install_nodes (не-чат, могут coming_soon); тип механики на карточке; opening ≠ mastery.
- **LearningAttempt:** scenarioId, status assigned→started→completed|abandoned, score 0–100, errorTypes, context=training; события training_*; analytics отдельно (D10).
- **P0 chat каркас:** цели, персонажи, дерево, последствия, оценка+feedback+retry; рубрика DEFAULT_SALES_RUBRIC (7 критериев); falsePromisePenalty=25; порог ≥70.
- **sell_multiframe:** клиент за натяжным → discovery → value → next step (PM/calc); NPC anna/igor; не создаёт Project/Deal.
- **objections:** три секции (price/doubt/later); паттерн clarify/reframe vs pressure/false promise; учебный pause ≠ Deal.outcome.
- **Не-чат:** calc_sandbox (prelim vs detailed, anti-double-count, sandbox storage); install_nodes (checklist/blocker sim, fail на quiet close).
- **RBAC:** все хаб; assign — admin/owner; training never in sales KPI.
- **UI states:** Hub→Lobby→Playing→Feedback|Abandoned; FORBIDDEN_PAYLOAD_KEYS (нет ПД клиента).
- **AC-D9-01…07** + Assumptions (равные веса, NPC, semver, sandbox reuse UI, crew хаб, scripted tree OK without LLM).

---

### D10 — StP support + analytics (`10-stp-support-analytics.md`)

- **Контур 5 шагов:** сигнал → диагностика → intervention → verify tool use → outcomes (Deal отдельно от training). Якорь S-admin-02.
- **Два+ контура метрик:** боевые продажи (dealId, context=work); обучение (LearningAttempt); инструменты (funnelPassKey). Training/demo ∉ sales KPI; open материала ∉ KPI.
- **Сигналы:** funnel_stall, tool_underuse, no_multiframe_offer, early_loss_cluster, support_cta, training_gap; who-stalls + «почему не MF» гипотезы (ручной выбор).
- **Пороги (draft):** 28д окно; N≥5; stall≥40%; calc/consult<0.3; offer/consult<0.5; early_*≥3; иначе «недостаточно наблюдений».
- **Диагностика на PartnerCard:** org, signalIds, module, hypothesis, confidence; запрет ПД клиента; admin ≠ операционный CRM.
- **Intervention:** actionType reply / attach_material / assign_training / call_logged / other; link to signalId; reviewAt; result improved|unchanged|worse|insufficient_data.
- **Verify:** before/after tool funnel (minSamples=5); outcomes Deal отдельной панелью; training completed ≠ рост продаж; окно 14+14д.
- **Очереди:** signals / cases / monitoring / training отдельно; case open→in_progress→resolved→closed.
- **RBAC admin:** create org+one-time creds; aggregates; no delete foreign; no edit чужих сделок; limited diagnosis без ФИО.
- **Экраны:** E-analytics, E-analytics-training, E-partner-card, E-support, E-materials.
- **AC-D10-01…08** + Assumptions (пороги, manual hypothesis, top-user stall, windows, proactive intervention без case).

---

### D11 — Матрица приёмки (`11-acceptance-matrix.md`)

- **Анти-формализм:** нельзя Done по «экран есть / CI green / кнопка нарисована»; каждая строка = сценарий ↔ экран ↔ данные ↔ доказательство; CI необходим но не достаточен.
- **Golden path (4):** AC-GP-01…04 — полный путь ids; quick Save→bind; copy≠sent; conversion=Deal.accepted не room.closed.
- **Early loss (3):** AC-EL-01…03 — early до КП с reason+stage; видно StP; training не подменяет outcome.
- **Sequential Deal (4):** AC-SD-01…04 — новый dealId; одна active; Project не Done при deferred; Quote на новой Deal с новым dealId.
- **Tech-ready (3):** AC-TR-01…03 — crew inbox только accepted+ordered+tech-ready; prelim≠tech-ready; blocker/запрет без detailed/материалов/ответственного.
- **Sent Quote immutable (3):** AC-QI-01…03 — immutable после sent; calc не меняет sent; N+1 тот же dealId.
- **Checklist (3):** AC-CL-01…03 — обязателен до closed; blocker types + open блокирует closed; crew без commercial total.
- **RBAC (5):** AC-RB-01…05 — admin no delete; не CRM; sales detailed flag; org isolation; one-time password not re-shown.
- **Offline/anti-loss (4):** AC-OF-01…04 — draft recoverable; no duplicate room; event dedupe; Save без bind запрещён.
- **Training isolation (6):** AC-TI-01…06 — context training; events excluded; hub mixed mechanics; opening≠mastery / −25 false promise; materials ∉ KPI; StP 5 steps.
- **Трассировка** S-x-01/03/04/05/06/07, S-sales-02a, S-admin-02, D9 → AC-ID; минимальные артефакты доказательств; **итого 35 ключевых AC** (+ локальные D9/D10); Assumptions + out-of-scope Gate C / код до OK.

---

## Cross-reference quick map

| Тема | Экраны | Docs |
|------|--------|------|
| Auth / chrome / homes | E-login, E-nav, E-home-* | D3, D4 |
| Project domain | E-projects, E-project, E-inquiry, E-room | D5, D8 |
| Tools | E-tools, E-pm, E-calc-save | D6, D7 |
| Commercial | E-quote-deal | D5, D8 |
| Install | E-install | D5, D8, D11 |
| Academy | E-academy | D9, D11 TI |
| StP / analytics | E-support, E-analytics (+ PartnerCard) | D10, D11 |

**Файлы источника (абсолютные пути):**

- `/cursor/stores/bc-4e5fdec0-03d5-44d5-95da-9adbe9fb08b4/docs/04-screen-specs/` (00-index + 15 e-*.md)
- `/cursor/stores/bc-4e5fdec0-03d5-44d5-95da-9adbe9fb08b4/docs/05-data-model-contracts.md` … `11-acceptance-matrix.md`
