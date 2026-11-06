# D2 — Сценарии ролей

**Revision:** `rev-gate-a-approved-20261022`  
**Зависит от:** [D1](./01-product-architecture.md)  
**Матрица:** [D2a](./02a-responsibility-matrix.md)  
**Статус Gate A:** согласован **условно** ([ADR-008](./adr/008-deal-quote-project-identity.md)).  
**Статус Gate A:** не согласован (ждёт финальный OK заказчика).

Каркас каждого **основного** сценария: начало → результат; user actions; system actions; состояния/переходы; данные; ошибки/восстановление; ответственные; AC.

Идентификаторы: `S-<role>-<nn>`. Сквозные: `S-x-nn`.

Разделение полномочий (везде, где релевантно): **право на действие** / **назначение ответственного** / **полномочие завершить этап** — см. D2a §1a.

---

## 0. Сквозной golden path (все роли)

**S-x-01 — От лида до закрытого монтажа**

| Поле | Содержание |
|------|------------|
| **Начало** | Звонок/заявка: клиент хочет натяжной потолок в квартире (1–N комнат). |
| **Результат** | Проект с комнатами; по нужным — профиль и/или расчёты; КП confirm_sent; outcome accepted (возможно частичное согласие по комнатам); бригада закрыла `ordered`-комнаты по чек-листу; Deal closed. |
| **User** | Owner/sales создаёт проект **или** quick-entry (tool→result→Save→bind) → (sales сам PM/preliminary и/или) назначает measurer → detailed calc → sales КП + confirm_sent → outcome + roomAssent → tech-ready → assign crew → crew чек-лист/блокеры → closed; при deferred — следующая sequential Deal. |
| **System** | Одна активная Deal; после closed — **новый dealId** (закрытая неизменна); Quote sent immutable, N+1 на Deal; Project ≠ Deal closed при deferred; early decline/pause; room.status ≠ outcome; без double-count; training ∉ KPI. |
| **Состояния** | State diagrams в [D3](./03-information-architecture.md). |
| **Данные** | Project, Rooms, calc preliminary/detailed, Deal (+roomAssent), QuoteRevision, Assignments, Documents, InstallChecklist, Blockers. |
| **Ошибки** | Потеря контекста при calc → запрет тихого save не туда; отказ → loss reason; срыв монтажа → blocker + эскалация; попытка суммировать оба calc одной комнаты → блок. |
| **Ответственные** | RACI в D2a. |
| **AC** | projectId/roomId не теряются; copy ≠ sent; closed room ≠ accepted; нет безымянных объектов; partial assent отражён в КП и монтаже. |

---

## 1. Admin StP

### S-admin-01 — Завести партнёрскую компанию

| Поле | Содержание |
|------|------------|
| **Начало** | Новая потолочная компания подключает MultiFrame. |
| **Результат** | Org + owner-логин; компания в сети; материалы обучения доступны. |
| **User** | «Партнёры» → создать компанию (логин, название, город) → система выдаёт **одноразовые временные credentials** → передать владельцу → при утере — **безопасный сброс** (новая одноразовая выдача). |
| **System** | Валидирует город; создаёт org; показывает временный пароль **один раз** при создании/сбросе; **не** хранит и не показывает действующий пароль в карточке повторно; audit без лишних ПД клиента. |
| **Состояния** | Form idle → submitting → success (one-time credentials) / error; Reset → one-time credentials. |
| **Данные** | OrgSettings seed, SessionUser owner (хеш пароля, не plaintext). |
| **Ошибки** | Дубликат логина → у поля; город не из справочника → блок; сеть недоступна → retry. |
| **Ответственные** | Admin — R; owner принимает доступ — A после передачи. |
| **AC** | Компания в списке; owner логинится; нет регулярного просмотра действующих паролей; admin не видит чужие клиентские ПД сверх поддержки. |

### S-admin-02 — Контур помощи: сигнал → диагностика → действие → проверка

| Поле | Содержание |
|------|------------|
| **Начало** | Сигнал затруднения (воронка, низкое применение PM/calc, CTA «Нужна помощь») или ручной разбор PartnerCard. |
| **Результат** | Диагноз зафиксирован; intervention выполнен; проверено, начал ли партнёр применять инструменты; отмечен сдвиг результатов (или «без эффекта»). |
| **User** | Home/analytics → сигнал / PartnerCard → диагностика (модуль, гипотеза) → действие (ответ, материал, обучение, созвон-фиксация) → follow-up: смотрит применение инструментов и последующие Deal.outcome **отдельно** от training. |
| **System** | Агрегаты без сырых ПД; малая выборка → «недостаточно наблюдений»; case связан с org; training-события в **отдельном** срезе, не в конверсии продаж. |
| **Состояния** | Signal new → diagnosing → intervening → verifying_adoption → resolved / monitoring. |
| **Данные** | SupportCase, Intervention, tool-usage aggregates, Deal funnel aggregates, training aggregates (отдельно). |
| **Ошибки** | Пустая аналитика → empty state; 403 на чужой org; попытка править чужие сделки как sales → запрет. |
| **Ответственные** | Admin — R/A на разбор; partner contact — C. |
| **AC** | Виден полный контур из 5 шагов; training не смешан с KPI продаж; admin — агрегаты + ограниченная диагностика; **без delete** чужих проектов; не полевой CRM партнёра. |

### S-admin-03 — Библиотека материалов

| Поле | Содержание |
|------|------------|
| **Начало** | Нужно обновить методичку для сети. |
| **Результат** | Файл/папка доступны ролям кабинета на чтение. |
| **User** | Обучение / материалы → папка / загрузка → проверить открытие. |
| **System** | Materials bucket; signed URL; не пишет байты в partners bucket. |
| **Состояния** | Idle → uploading → published / error. |
| **Данные** | MaterialFolder, MaterialFile. |
| **Ошибки** | Лимит размера → сообщение; сеть → retry. |
| **Ответственные** | Admin — A/R. |
| **AC** | Partner roles видят материал; open материала ∉ KPI продаж. |

---

## 2. Owner (владелец компании)

### S-owner-01 — Настроить компанию и команду

| Поле | Содержание |
|------|------------|
| **Начало** | Первый вход или смена прайса/штата. |
| **Результат** | Актуальные РРЦ/монтаж/дюбели; сотрудники с ролями. |
| **User** | «Компания» → поля → Сохранить; «Сотрудники» → создать сотрудника (роль) → получить **одноразовые** credentials → передать сотруднику; при утере — сброс (новая одноразовая выдача); удалить при необходимости. |
| **System** | OrgSettings; временный пароль виден **только** в момент создания/сброса; в карточке сотрудника **нет** регулярного просмотра действующего пароля; loading на кнопке. |
| **Состояния** | Form dirty → saving → saved / error; CreateStaff → one-time credentials; ResetPassword → one-time credentials. |
| **Данные** | OrgSettings, StaffUser (хеш, не plaintext). |
| **Ошибки** | Невалидный город; сеть mid-save → ошибка + повтор; удаление последнего sales — предупреждение. |
| **Ответственные** | Owner — A/R на HR и прайс (**создание staff** — owner; sales — только назначения). |
| **AC** | Калькулятор подхватывает цены; сотрудники логинятся; действующие пароли не отображаются повторно. |

### S-owner-02 — Создать проект с первой комнатой

| Поле | Содержание |
|------|------------|
| **Начало** | Новый клиент на натяжной потолок (данные известны). |
| **Результат** | Project + Room (черновик); одна активная Deal (contact); проект в списке. |
| **User** | Список проектов → «Новый проект» → клиент, телефон (если есть), адрес, город, имя комнаты → создать. |
| **System** | Project+Room с одним projectId; создаёт активную Deal; не требует жалобу на шум. |
| **Состояния** | EmptyDraft → Active (D3 §5.1). |
| **Данные** | Project, Room, Deal. |
| **Ошибки** | Пустой ярлык клиента — валидация; offline — outbox + pendingSync. |
| **Ответственные** | Owner или sales — R (право создать); owner — A. |
| **AC** | Нет объекта без projectId; нет безымянного проекта. |

### S-owner-03 — Контроль воронки и эскалация

| Поле | Содержание |
|------|------------|
| **Начало** | Owner открывает «Сегодня» / зависшее КП. |
| **Результат** | Понятен next step; при необходимости переназначил или запросил StP. |
| **User** | Inbox → проект → сделка → assignments / «Нужна помощь». |
| **System** | Next actions из Deal+комнат+roomAssent; без стека модулей. |
| **Состояния** | По Deal.stage / outcome (D3). |
| **Данные** | Deal, Assignments, SupportCase (опц.). |
| **Ошибки** | Нет сотрудников нужной роли → empty state со ссылкой на Staff. |
| **Ответственные** | Owner — A; sales — R на ведение. |
| **AC** | Owner закрывает разрыв sales↔measurer↔crew без админского кабинета. |

### S-owner-04 — Quick-entry / PM / preliminary (сам владелец)

| Поле | Содержание |
|------|------------|
| **Начало** | Owner на линии с клиентом; полной карточки ещё нет или нужно быстро прикинуть. |
| **Результат** | То же, что S-sales-05 и/или S-sales-04/06: результат в проекте+комнате без orphan. |
| **User** | Home quick-entry или комната → PM / preliminary → результат → Save → bind/create при необходимости → persist. |
| **System** | Те же правила session draft (bind после Save), анти-двойного учёта, одной активной Deal. |
| **Состояния** | SessionDraft → Save → Bind → Saved; Room с profile/preliminary. |
| **Данные** | Project, Room, Deal, preliminary / profile. |
| **Ошибки** | Как S-sales-05: блок save без bind; запрет безымянных. |
| **Ответственные** | Owner — A/R (право действовать без назначения sales). |
| **AC** | Owner не заблокирован отсутствием sales на смене; путь идентичен менеджерскому по данным. |

---

## 3. Sales (менеджер)

### S-sales-01 — Ведение сделки: от проекта к КП

| Поле | Содержание |
|------|------------|
| **Начало** | Проект есть; по комнатам есть preliminary и/или detailed. |
| **Результат** | QuoteRevision по выбранным комнатам; lifecycle `quote_created` → (share) → `quote_sent_confirmed` после confirm. |
| **User** | Inbox или проект → Сделка → выбирает комнаты (учитывая тип calc) → создаёт КП → copy/PDF при необходимости → **confirm_sent** после реальной доставки → ждёт ответ. |
| **System** | copy/PDF **не** = sent; confirm_sent → Quote `sent_confirmed` + Deal.stage `quote_sent_confirmed`; sent revision **immutable**; в сумму комнаты — detailed если есть, иначе preliminary с пометкой; **запрет** сложить оба; до confirm_sent не требовать телефон/адрес всегда — достаточно способа передачи. |
| **Состояния** | Quote §5.4; Deal §5.5 в D3. |
| **Данные** | Deal, QuoteRevision.roomObjectIds, amounts, calc types (snapshot на версии — принцип; поля — Gate B/D5). |
| **Ошибки** | Нет ни одного usable calc → блок с пояснением; только preliminary → предупреждение «КП ориентировочное»; double-count attempt → блок; попытка «обновить» sent КП живым calc → предложить N+1. |
| **Ответственные** | Sales — R (действие + завершение этапа «отправка»); owner — A. |
| **AC** | После copy lifecycle не «отправлено»; после confirm — next action «Зафиксировать ответ»; пересчёт комнаты не меняет sent revision. |

### S-sales-02 — Исход сделки и частичное согласие

| Поле | Содержание |
|------|------------|
| **Начало** | КП в `sent_confirmed` **или** ранняя потеря/пауза на консультации/демо (до КП). |
| **Результат** | Deal.outcome задан; при accepted — roomAssent (ordered/deferred/out_of_scope); конверсия = outcome accepted; отдельно учитывается сумма принятого заказа. |
| **User** | Сделка → outcome → при accepted отмечает комнаты заказанные/отложенные → при declined/early — loss reason + этап воронки. |
| **System** | Пишет outcome на **Deal** (не на Quote); early decline/pause **до КП** с `lossReason` и `stageAtOutcome`; не выводит accepted из room.closed; монтажный пул = только ordered + tech-ready. |
| **Состояния** | Deal: early_* **или** sent_confirmed → outcome ветки; Quote при пересмотре — **новый экземпляр** N+1 на **этой** Deal (sent неизменна). |
| **Данные** | Deal.outcome, Deal.roomAssent, lossReason, stageAtOutcome. |
| **Ошибки** | Accepted без ни одной ordered → валидация; early без причины/этапа → блок; попытка outcome на Quote UI как SoT — запрещено. |
| **Ответственные** | Sales — R завершить этап «ответ клиента» / ранний исход; owner — A. |
| **AC** | Конверсия = `outcome=accepted`; сумма accepted — отдельный показатель; StP видит потери до КП; deferred не в inbox crew. |

### S-sales-02a — Ранний отказ / пауза до КП

| Поле | Содержание |
|------|------------|
| **Начало** | Контакт, предложение, PM/демо или ориентир по площади — клиент отказался или поставил на паузу **до** создания КП. |
| **Результат** | Deal в `early_declined` / `early_paused` (или closed с причиной); воронка и StP видят этап потери. |
| **User** | Сделка / inbox → «Отказ» или «Пауза» → выбирает этап (contact/offered/assessed/calculated) → причину → сохраняет. |
| **System** | Фиксирует outcome + stageAtOutcome + lossReason; **не** требует Quote; пауза возобновляема; отказ ведёт к closed. |
| **Состояния** | D3 §5.5 early_* ветки. |
| **Данные** | Deal.outcome, stageAtOutcome, lossReason. |
| **Ошибки** | Пустая причина или этап → валидация. |
| **Ответственные** | Sales — R; owner — A. |
| **AC** | Потери до КП видны в аналитике воронки; training-события не подменяют этот исход. |

### S-sales-03 — Назначения на этапы

| Поле | Содержание |
|------|------------|
| **Начало** | Нужен замер или монтаж (или sales передаёт то, что мог сделать сам). |
| **Результат** | Assignments заполнены; у исполнителей next actions. |
| **User** | Проект → назначения → выбирает sales/measurer/crew. |
| **System** | Обновляет assignments; derived assignedTo для совместимости. |
| **Состояния** | Assignment empty → assigned → (переназначение). |
| **Данные** | ObjectAssignments / project-level assignments. |
| **Ошибки** | Сотрудник другой org — невозможно; пустой список роли — «создайте у owner». |
| **Ответственные** | Sales — R на **назначение**; owner — A; исполнитель — R на действие. |
| **AC** | Measurer видит задачи; crew — только после accepted + ordered + **tech-ready** (detailed, материалы, ответственный). |

### S-sales-04 — PM в контексте комнаты (сам менеджер)

| Поле | Содержание |
|------|------------|
| **Начало** | Клиент на встрече; проект/комната выбраны (или только что созданы). |
| **Результат** | Профиль акустики в комнате; можно preliminary/detailed или КП. |
| **User** | Из комнаты «Диагностика» → PM (без лишнего «тип потолка» в основном пути) → «Сохранить в комнату». |
| **System** | Profile document + answers; сохраняет project/room ids. |
| **Состояния** | Room draft/measured с профилем. |
| **Данные** | Profile document, roomId, projectId. |
| **Ошибки** | Save без комнаты → picker/bind; сеть → retry/outbox. |
| **Ответственные** | Sales — R (**право на действие** PM); назначение measurer не обязательно для этого шага. |
| **AC** | Возврат в ту же комнату; CTA не уводят в visitor Result без контекста. |

### S-sales-05 — Quick-entry: консультация/расчёт без полной карточки

| Поле | Содержание |
|------|------------|
| **Начало** | Звонок/встреча; адрес/телефон ещё неизвестны; нужна консультация или ориентир по площади. |
| **Результат** | Результат PM и/или preliminary (реже detailed) **сохранён** в существующий или новый проект+комнату; нет orphan и безымянных объектов. |
| **User** | Home «Быстрая консультация» / «Быстрый расчёт» → **открывает tool → получает результат** → Save → **выбирает/создаёт** проект+комнату (ярлык клиента/«Черновик дата» + имя комнаты) → **confirm persist**. |
| **System** | Держит session draft с результатом до Save; bind **после** Save (не до расчёта); persist только после выбора/создания + confirm; дедуп: повторный save того же draft обновляет ту же комнату; запрет empty name. |
| **Состояния** | SessionDraft (результат) → Save → BindModal → SavedToRoom / Abandoned (D3 §5.3 / §3b). |
| **Данные** | SessionDraft, Project (min), Room, preliminary calc / profile. |
| **Ошибки** | Save без bind → блок модалкой; дубликат по ошибке пользователя → поиск существующего в модалке; уход без save → draft discard с confirm. |
| **Ответственные** | Sales/owner — R; measurer — R если имеет право calc. |
| **AC** | После save есть projectId+roomId и читаемое имя в списке; телефон/адрес можно дополнить позже; нет «Объект без проекта». |

### S-sales-06 — Preliminary calc (сам менеджер)

| Поле | Содержание |
|------|------------|
| **Начало** | Комната есть (или после S-sales-05 bind); нужна ориентировочная сумма по площади. |
| **Результат** | `calculation.preliminary` на комнате; итог проекта обновлён по правилу анти-двойного учёта. |
| **User** | Calc → режим площади → «Сохранить предварительный расчёт в комнату». |
| **System** | Пишет preliminary; **не** помечает как detailed/схему; если detailed уже есть — UI показывает оба, в сумме использует detailed. |
| **Состояния** | AreaPreview → SavedPreliminaryToRoom. |
| **Данные** | Room.calculation.preliminary. |
| **Ошибки** | Попытка выдать preliminary за схему в КП без warning — блок/предупреждение. |
| **Ответственные** | Sales — R (право действовать); measurer может уточнить detailed позже. |
| **AC** | Бейдж «предварительно»; в КП/итоге нет суммы preliminary+detailed одной комнаты; preliminary **не** даёт tech-ready для install. |

### S-sales-07 — Detailed calc при разрешении

| Поле | Содержание |
|------|------------|
| **Начало** | У sales есть право detailed; комната открыта; нужна схема без ожидания measurer. |
| **Результат** | `calculation.detailed` на комнате; вклад в tech-ready; sent QuoteRevision не меняется (при уже отправленном КП — нужна N+1). |
| **User** | Calc → геометрия/чертёж → «Сохранить расчёт (со схемой) в эту комнату». |
| **System** | Те же правила, что S-measurer-02; RBAC-флаг права detailed у sales. |
| **Состояния** | SchemeReady → SavedDetailedToRoom. |
| **Данные** | Room.calculation.detailed. |
| **Ошибки** | Нет права → блок / предложить назначить measurer; save без комнаты → picker. |
| **Ответственные** | Sales — R при разрешении; measurer — основной R по умолчанию. |
| **AC** | Без разрешения sales не persist detailed; с разрешением путь идентичен measurer по данным. |

---

## 4. Measurer (замерщик)

### S-measurer-01 — Продолжить черновик комнаты

| Поле | Содержание |
|------|------------|
| **Начало** | Inbox: «Продолжить замер» / pendingSync. |
| **Результат** | Комната с актуальными данными; sync ok. |
| **User** | Открывает комнату → поля / PM / calc → сохраняет. |
| **System** | Sync state; flush outbox. |
| **Состояния** | Draft ↔ Measured; pendingSync → synced. |
| **Данные** | Room fields, documents. |
| **Ошибки** | Конфликт offline → retry; не молча дублировать комнату. |
| **Ответственные** | Measurer — R на действие замера. |
| **AC** | Не обязан править прайс, чтобы видеть свои комнаты. |

### S-measurer-02 — Detailed calc в комнату

| Поле | Содержание |
|------|------------|
| **Начало** | Комната открыта; нужна смета со схемой. |
| **Результат** | `calculation.detailed` + document estimate; preliminary при наличии остаётся, но не суммируется вместе. |
| **User** | «Рассчитать» → геометрия/чертёж → «Сохранить расчёт (со схемой) в эту комнату» → возврат. |
| **System** | Scheme + BOM; objectId=roomId; обновляет итог проекта (detailed вытесняет preliminary в агрегате). |
| **Состояния** | SchemeReady → SavedDetailedToRoom. |
| **Данные** | Room.calculation.detailed, estimate document. |
| **Ошибки** | Save без комнаты → picker; area-only в этом CTA → направить в preliminary save; сеть → outbox. |
| **Ответственные** | Measurer — R; sales может detailed при разрешении — R/C. |
| **AC** | После save — исходная комната; PDF «Смета» (техсмета с ценами для crew ≠ клиентское КП); схема доступна crew; вклад в tech-ready. |

### S-measurer-03 — Создать проект «с поля»

| Поле | Содержание |
|------|------------|
| **Начало** | Замерщик у клиента; проекта нет. |
| **Результат** | Проект + первая комната; активная Deal. |
| **User** | «Новый замер» → минимальные поля (ярлык + комната; адрес по возможности) → далее calc/PM. |
| **System** | Пара project+room; одна активная Deal; нет orphan. |
| **Состояния** | EmptyDraft → Active. |
| **Данные** | Project, Room, Deal. |
| **Ошибки** | Пустой ярлык → блок; offline → outbox. |
| **Ответственные** | Measurer — R создать с поля; owner — A на орг-итог. |
| **AC** | projectId всегда есть; альтернатива — S-sales-05 bind к существующему. |

### S-measurer-04 — Preliminary на объекте (если sales не сделал)

| Поле | Содержание |
|------|------------|
| **Начало** | Комната открыта (или после S-measurer-03); нужен ориентир по площади до схемы. |
| **Результат** | `calculation.preliminary` на комнате; итог проекта обновлён без double-count. |
| **User** | Calc → режим площади → «Сохранить предварительный расчёт в комнату». |
| **System** | Пишет preliminary; не выдаёт за detailed; если позже появится detailed — агрегат берёт detailed. |
| **Состояния** | AreaPreview → SavedPreliminaryToRoom. |
| **Данные** | Room.calculation.preliminary. |
| **Ошибки** | Save без комнаты → picker/bind; выдача preliminary как «смета со схемой» → warning. |
| **Ответственные** | Measurer — R. |
| **AC** | Бейдж «предварительно»; sales может использовать в ориентировочном КП. |

---

## 5. Crew (бригада)

### S-crew-01 — Выполнить монтаж по чек-листу

| Поле | Содержание |
|------|------------|
| **Начало** | Inbox: комнаты install, assignment на crew, roomAssent=ordered, **tech-ready**. |
| **Результат** | Чек-лист пройден (N/A с причиной допускается); комната `closed`; Deal **не** авто-accepted. |
| **User** | Открывает задание → смотрит **техсмету с ценами** (не клиентское КП) и схему → проходит **базовый монтажный чек-лист (P0)** → «Монтаж выполнен / Закрыто». |
| **System** | Фильтр назначенных install+ordered+tech-ready; secondary tools без persist сметы; чек-лист **обязателен**; пункты done / N/A+причина; исключения waive — Gate B; crew **не** видит коммерческий итог проекта / quote amount. |
| **Состояния** | Install → ChecklistInProgress → Closed (D3 §5.2). |
| **Данные** | Room.status, InstallChecklist items, documents detailed. |
| **Ошибки** | Нет detailed/схемы / материалов / ответственного → **blocker** (S-crew-02) или запрет передачи; не тихое closed; offline — локальный просмотр кэша. |
| **Ответственные** | Crew — R завершить монтаж комнаты; sales/owner — A на передачу в install. |
| **AC** | Чек-лист заполнен (или N/A с причиной); closed ≠ Deal accepted; нет quote amount и project commercial total у crew. |

**Базовый чек-лист P0 (каркас; формулировки — D4/D8):** наличие схемы; комплектация/материалы на месте; крепёж/профиль по смете; панели/полотно по плану; финальный осмотр / фото (если политика компании). Пункты: done / **N/A с причиной**.

### S-crew-02 — Зафиксировать препятствие

| Поле | Содержание |
|------|------------|
| **Начало** | На объекте нельзя продолжить: нет схемы, нет материалов, вопрос по монтажу, нужен ответственный. |
| **Результат** | Blocker на комнате с типом и комментарием; next action у sales/owner/measurer; комната **не** closed. |
| **User** | Задание → «Препятствие» → тип: `no_scheme` \| `no_materials` \| `install_question` \| `contact_responsible` → текст → отправить. |
| **System** | Пишет Blocker; статус комнаты остаётся install (или подстатус blocked в UX); уведомляет assignee сделки; не меняет Deal.outcome. |
| **Состояния** | Install → Blocked → Install (после снятия) → Closed. |
| **Данные** | RoomBlocker { type, note, createdBy, createdAt, resolvedAt? }. |
| **Ошибки** | Пустой тип → валидация; сеть → outbox blocker. |
| **Ответственные** | Crew — R зафиксировать; sales/owner/measurer — R снять причину; owner — A. |
| **AC** | Препятствие видно в проекте/сделке; после resolve crew может продолжить чек-лист; нет «тихого» закрытия при blocker. |

### S-crew-03 — Связаться с ответственным (из препятствия)

| Поле | Содержание |
|------|------------|
| **Начало** | Выбран тип `contact_responsible` или CTA «Связаться». |
| **Результат** | Ответственный (sales/owner с assignment) видит запрос; crew получает ответ/снятие blocker. |
| **User** | Из blocker или комнаты — «Связаться с ответственным» (показывает кто assigned; канал — телефон/что есть в карточке; в системе — пометка «запрошен контакт»). |
| **System** | Next action ответственному; лог события без лишних ПД клиента в analytics. |
| **Состояния** | Blocker open → awaiting_response → resolved. |
| **Данные** | Blocker, Assignment contacts. |
| **Ошибки** | Нет assigned sales — эскалация owner. |
| **Ответственные** | Crew — R запрос; sales/owner — R ответ. |
| **AC** | Запрос не теряется; не требует у crew доступа к КП. |

---

## 6. Сквозные handoff-сценарии

### S-x-02 — Sales → Measurer

Sales назначает measurer **или** сам делает PM/preliminary → measurer дополняет detailed → sales готовность к КП.

### S-x-03 — Sales → Crew

Outcome **accepted** + roomAssent ordered + **tech-ready** (актуальный detailed, материалы, ответственный) → assignment crew → S-crew-01/02 → closed rooms; Deal closed отдельно. Preliminary в КП **не** заменяет tech-ready.

### S-x-04 — Partner → Admin StP

Любая роль: «Нужна помощь» + module context → S-admin-02 (полный контур). Training-обращения не смешиваются с воронкой продаж в метриках. Admin: агрегаты + ограниченная диагностика; без delete чужих проектов.

### S-x-05 — Инструмент → Комната (анти-разрыв)

Вход в PM/Calc: из комнаты **или** quick-entry (tool → result → Save → bind/create → persist) **или** tools+picker. Запрещён silent create без имени/проекта; запрещён bind **до** результата в quick-entry.

### S-x-06 — Quick-entry → Проект

Session draft с результатом → Save → bind existing / create min project → confirm persist → тот же SoT, что у обычного проекта; дальнейший путь = S-x-01 с середины.

### S-x-07 — Partial assent → следующая sequential Deal (новый dealId)

Deal.outcome accepted с deferred-комнатами → crew видит только **ordered** текущей Deal. После закрытия текущей Deal (ordered закрыты / сделка закрыта) sales создаёт **новую Deal с новым `dealId`** в том же проекте (закрытая Deal **не reopen**): deferred→ordered в новой сделке + **новая QuoteRevision на новой Deal**, tech-ready, назначение монтажа. Project при наличии deferred **не** становится Done только из‑за закрытия Deal. **Пока Deal активна** — одна активная нить; параллельный multi-order UI нет. Повторный заказ deferred — **в первой версии** ([ADR-008](./adr/008-deal-quote-project-identity.md)).

---

## 7. Что не сценарии Gate A (деталь, не дырка каркаса)

- Пошаговые поля анкеты PM и точные formulas calc (D6/D7).  
- Полные screen specs pixel/CTA copy (D4).  
- API error codes (D5).  
- Полный instructional design Академии (D9) — механики зафиксированы в D1/ADR-006.  
- Пороги сигналов StP в цифрах (D10) — **контур** шагов описан в S-admin-02.

P0-каркасы (типы calc, quick-entry порядок, early loss, sequential Deal, tech-ready, sent immutable, чек-лист, blockers, SoT Deal, права sales на PM/preliminary/detailed-по-праву, one-time credentials) **не** откладываются формулировкой «потом реализуем».

---

## Связь

- Матрица: [02a-responsibility-matrix.md](./02a-responsibility-matrix.md)  
- Экраны и state diagrams: [03-information-architecture.md](./03-information-architecture.md)
