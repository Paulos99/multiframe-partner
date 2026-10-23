# D9 — Академия: instructional + game design

**Revision:** `rev-gate-b-final-candidate`  
**ID:** D9  
**Зависит от:** [D1 §5.4](./01-product-architecture.md), [D2](./02-role-scenarios.md) (admin/materials), [D3 §4.1](./03-information-architecture.md), [ADR-006](./adr/006-academy-mixed-mechanics.md)  
**Ориентир кода (readonly):** `packages/shared/learning.ts`, события `training_*` в `packages/shared/events.ts`  
**Статус:** Gate B **APPROVED** 2026-10-23 · Gate C: изолированные прототипы в `docs/partner-ux-prototypes/`

---

## 1. Цель и границы

| Входит | Не входит |
|--------|-----------|
| Хаб Академии, типы механик, P0 sales-тренажёры | Pixel/wireframes (Gate C) |
| Instructional + game design чат-симуляторов | Боевые Deal / Quote / KPI продаж |
| Слоты не-чат механик (install / calc) | Полный контент всех узлов монтажа v1 |
| Изоляция `context: training` | Замена библиотеки материалов (E-materials) |

**Жёсткое правило:** `LearningAttempt.context === 'training'` всегда; `learningAttemptAffectsSalesFunnel ≡ false`; события `training_*` и `context: training|demo` **не** входят в конверсию Deal (`packages/shared/events.ts` → `countsTowardSalesKpi` — ориентир).

---

## 2. Хаб первым (IA)

Экран **E-academy-hub** — единственная точка входа в тренажёры. Не список «двух чатов», не смешение со справкой кабинета.

```text
E-academy-hub
 ├─ [P0] Продажи MultiFrame     → chat · sell_multiframe
 ├─ [P0] Возражения             → chat · objections
 ├─ [слот] Расчёты / практика   → не-чат · calc_sandbox   (далее)
 └─ [слот] Монтаж / узлы        → не-чат · install_nodes  (далее)
Рядом (не внутри тренажёра): E-materials · E-help-cabinet
```

| Правило хаба | Следствие |
|--------------|-----------|
| Карточка механики показывает **тип** (чат / визуальный / симуляция чек-листа) | Запрет проектировать так, будто единственный тип = chat |
| Слот «далее» видим, но может быть `coming_soon` | Не прятать не-чат форматы — иначе вернутся к «вся Академия = чат» |
| Открытие тренажёра ≠ освоение навыка | `openingCountsAsMastery ≡ false` |
| Материалы PDF/видео | Библиотека рядом; open материала ∉ KPI и ≠ attempt |

---

## 3. Модель попытки и аналитика обучения

Ориентир сущностей (`learning.ts`):

| Поле | Смысл |
|------|--------|
| `scenarioId` | `sell_multiframe` \| `objections` \| `calc_sandbox` \| `install_nodes` |
| `status` | `assigned` → `started` → `completed` \| `abandoned` |
| `score` | 0…100 после штрафа за ложные обещания |
| `errorTypes[]` | Типы ошибок для разбора (не ПД клиента) |
| `context` | всегда `'training'` |

События платформы (ориентир): `training_assigned` → `training_started` → `training_completed`.  
Админский срез — **E-analytics-training**, отдельно от Deal funnel ([D10](./10-stp-support-analytics.md)).

**Assumption:** версии сценария (`LearningScenario.version`) версионируются строкой semver контента; смена version не инвалидирует историю completed attempts, но новые assigned берут актуальную version.

---

## 4. P0 — чат-симуляторы продаж

Приоритет первой версии: **продажи и возражения**. Механика — **диалоговая симуляция**, не тест с кнопками-ответами как единственный UI (кнопки допускаются только как ускоритель реплик игрока внутри чата).

### 4.1 Общий каркас чат-тренажёра

Для **каждого** P0-сценария обязательны:

1. **Учебные цели** (1–3 навыка).  
2. **Персонажи** (роль, мотив, тон).  
3. **Дерево решений** (узлы: реплика NPC → выбор/ввод игрока → ветка).  
4. **Последствия** (сдвиг доверия / риск / прогресс к офферу).  
5. **Оценка + обратная связь** (рубрика + разбор) + **повтор**.

#### Рубрика продаж (DEFAULT_SALES_RUBRIC)

| Критерий | Что проверяем |
|----------|----------------|
| `need_discovery` | Выяснил потребность / контекст потолка, не сразу «купи» |
| `tech_accuracy` | Верно про MultiFrame под полотном; без выдуманных дБ |
| `non_pushy_offer` | Предложение без давления |
| `clarity` | Понятные следующие шаги клиенту |
| `objection_handling` | Работа с возражением, не спор |
| `next_step` | Зафиксировал измеримый next step (замер / КП / пауза) |
| `no_false_promises` | Нет «гарантированной тишины» и т.п. |

Штраф: `falsePromisePenalty = 25` → `scoreWithFalsePromisePenalty`.

**Assumption:** итоговый score считается по взвешенному среднему критериев (равные веса v1) минус штраф; порог «сдал» = score ≥ 70 **и** нет критического false promise на hard.

---

### 4.2 Сценарий `sell_multiframe` — «Предложить MultiFrame»

| Поле | Содержание |
|------|------------|
| **Роль аудитории** | sales, owner (primary); measurer — optional observe |
| **Difficulty** | easy → medium (P0); hard — later |
| **Цель обучения** | Сформировать потребность в звукоизоляции у клиента, пришедшего за **натяжным**, и предложить MultiFrame без ложных обещаний |
| **Связь с продуктом** | Зеркалит кабинетный PM-путь (клиент не обязан жаловаться на шум) — без записи в боевую комнату |

#### Персонажи

| ID | Роль | Мотив | Тон |
|----|------|-------|-----|
| `client_anna` | Заказчица квартиры | Хочет красивый натяжной в спальне/гостиной; шум — вторичный фон | Дружелюбно, торопится |
| `client_igor` | Заказчик, скептик к «допам» | Бюджет на полотно; допы = развод | Коротко, проверяет |
| `coach` (off-dialog) | Система | Подсказки после узла / в конце | Нейтрально |

**Assumption:** в P0 активен один NPC за прохождение (`client_anna` easy; `client_igor` medium); выбор NPC — в лобби сценария.

#### Дерево решений (сжатое)

```text
N0 Intro: клиент «нужен натяжной»
 ├─ A: сразу оффер MF → trust−, ветка Pushy → штраф non_pushy / false_promise риск
 ├─ B: вопросы о комнате/соседях/ожиданиях → N1 Discovery
 └─ C: только цена полотна → N1b PriceTrap (можно вернуться к discovery)

N1 Discovery done
 ├─ A: демо «зачем под полотном» (язык PM) → N2 Value
 ├─ B: техжаргон дБ без опоры → tech_accuracy− → N2b Confusion
 └─ C: «гарантируем тишину» → false_promise → жёсткий штраф → ветка FailFast

N2 Value
 ├─ A: предложить PM/расчёт как next step → N3 OfferOk
 ├─ B: требовать решение сейчас → non_pushy− → N3 Pressure
 └─ C: уйти без next step → next_step=0 → Incomplete

N3 Завершение
 → Feedback + score + errorTypes[]
```

#### Последствия (runtime)

| Метрика попытки | Диапазон | Влияние |
|-----------------|----------|---------|
| `trust` | 0…100 | Низкий trust блокирует «хороший» оффер |
| `clarity` | флаг | Нужен для next_step |
| `falsePromise` | bool | Штраф 25 + критерий fail |

Попытка **не** создаёт Project/Deal/Quote. Любые «результаты PM» в симуляторе — учебные артефакты attempt.

#### Обратная связь

1. Итоговый score + radar по критериям.  
2. 2–4 карточки: «что сработало» / «что улучшить» с цитатой узла.  
3. CTA: **Пройти снова** (новая attempt) · **К хабу** · (admin) **Назначить коллеге**.

#### 4.2.1 Эталонный сценарий `sell_multiframe` / `client_anna` (C3 / GB-P1-01)

Один **воспроизводимый** эталон (только Anna). Кнопки = ускорители реплик; free text матчится к ближайшему узлу или → «выберите ближе к смыслу или кнопкой».  
**Score formula (v1):** среднее арифметическое 7 критериев (0…100, равные веса) − `falsePromisePenalty` (25 если `falsePromise=true`, иначе 0); clamp ≥0. Порог сдачи ≥70 и нет critical false promise.

Критерии: `need_discovery` · `tech_accuracy` · `non_pushy_offer` · `clarity` · `objection_handling` · `next_step` · `no_false_promises`.

##### Узлы и реплики (общий пул)

| Node | NPC Anna | Choices (player) → next |
|------|----------|-------------------------|
| **N0** | «Здравствуйте, нужен натяжной в спальню, хочется побыстрее.» | **P0a** «Отлично, сразу MultiFrame — без него у вас будет шумно.» → PushyN1 · **P0b** «Расскажите про комнату: соседи сверху есть, что беспокоит кроме вида?» → N1 · **P0c** «Полотно от 400 ₽/м². Что ещё интересует по цене?» → PriceTrap |
| **PriceTrap** | «Цену полотна поняла. А зачем вы про что-то ещё?» | **PTfix** «Сначала пойму задачу комнаты — шум, соседи, ожидания — потом сориентирую по составу.» → N1 · **PTbad** «Берите сразу пакет с MultiFrame, иначе переплатите потом.» → PushyN1 |
| **N1** | «Соседи иногда слышны, но я за красотой пришла.» | **P1a** «Под натяжным можно поставить каркас MultiFrame. Давайте коротко разберём, зачем он вам — без покупки сейчас.» → N2 · **P1b** «Гарантируем −35 дБ и полную тишину.» → FailFast · **P1c** «Это Rw/DnT,w по ISO, демпфер, развязка по периметру…» (без бытового смысла) → N2b |
| **N2b** | «Я ничего не поняла. Это мне точно нужно?» | **P2b_fix** «Простыми словами: каркас под полотном снижает ударный шум соседей. Могу показать профиль и дать ориентир по площади.» → N2 · **P2b_bad** «Если не разберётесь в терминах — не наш клиент.» → PoorEnd |
| **PushyN1** | «Вы сразу продаёте допы. Мне просто потолок.» | **PPu_fix** «Извините за напор. Давайте сначала про комнату и ваши ожидания.» → N1 · **PPu_bad** «Без MultiFrame смысла нет, решайте сегодня.» → PoorEnd |
| **N2** | «И что дальше, если мне это подойдёт?» | **P2a** «Могу открыть проблемомер и дать предварительный ориентир по площади — без обязательства покупать.» → OfferOk · **P2b** «Решать надо сегодня, иначе цена вырастет.» → PressureEnd · **P2c** «Ну ок, думайте сами.» → IncompleteEnd |
| **FailFast / ends** | (конец попытки) | Feedback + score |

##### Три полных пути

**Path S — Successful** `N0 → P0b → N1 → P1a → N2 → P2a → OfferOk`

1. Диалог: Anna N0 → Player P0b → Anna N1 → Player P1a → Anna N2 → Player P2a → OfferOk.  
2. Rubric (0–100): need_discovery **90**, tech_accuracy **85**, non_pushy_offer **90**, clarity **85**, objection_handling **70**, next_step **95**, no_false_promises **100**.  
3. Average = (90+85+90+85+70+95+100)/7 = **87.86** → **88**. Penalty = 0. **Score = 88** (pass).  
4. Feedback: «Выяснили контекст комнаты до оффера» (P0b); «Объяснили MultiFrame без давления и дали next step — проблемомер/ориентир» (P1a/P2a).

**Path P — Partial** `N0 → P0c → PriceTrap → PTfix → N1 → P1c → N2b → P2b_fix → N2 → P2a → OfferOk`

1. Диалог: Anna N0 → P0c → PriceTrap → PTfix → N1 → P1c → N2b → P2b_fix → N2 → P2a → OfferOk.  
2. Rubric: need_discovery **70**, tech_accuracy **45**, non_pushy_offer **75**, clarity **55**, objection_handling **65**, next_step **90**, no_false_promises **100**.  
3. Average = (70+45+75+55+65+90+100)/7 = **71.43** → **71**. Penalty = 0. **Score = 71** (pass marginal).  
4. Feedback: «Старт с цены ослабил discovery» (P0c); «Жаргон без бытового смысла» (P1c); «Вернулись к простому языку и мягкому next step» (P2b_fix/P2a).

**Path F — Poor** `N0 → P0b → N1 → P1b → FailFast`

1. Диалог: Anna N0 → P0b → N1 → P1b «Гарантируем −35 дБ и полную тишину.» → FailFast.  
2. Rubric: need_discovery **80**, tech_accuracy **20**, non_pushy_offer **60**, clarity **40**, objection_handling **30**, next_step **20**, no_false_promises **0**.  
3. Average = (80+20+60+40+30+20+0)/7 = **35.71** → **36**. `falsePromise=true` → penalty **25**. **Score = 11** (fail).  
4. Feedback: «Ложное обещание „гарантированной тишины / −35 дБ“ недопустимо» (P1b); «Discovery был хорош, но сорван неверной технической претензией».

**Runtime UX:** wrong (non-fatal) → coach tip + retry узла; false_promise → FailFast без retry; pause → confirm `abandoned`; a11y: focus chat → choices.  
**Isolation:** `context: training`; **0** записей в Deal/KPI.

---

### 4.3 Сценарий `objections` — «Возражения»

| Поле | Содержание |
|------|------------|
| **Цель** | Отработать типовые отказы без спора и без ложных обещаний |
| **Difficulty** | medium (P0); hard — later |

#### Персонажи

| ID | Возражение-ядро |
|----|-----------------|
| `obj_price` | «Дорого / это развод на доп» |
| `obj_doubt` | «Не верю, что под натяжным что-то даст» |
| `obj_later` | «Потом, сначала просто полотно» |

**Assumption:** P0 = три мини-диалога в одном scenarioId (секции), общий score; abandoned если вышли до завершения ≥1 секции без completed.

#### Паттерн узла возражения

```text
Objection uttered
 ├─ Argue / pressure     → trust−, objection_handling−
 ├─ Clarify + reframe    → partial credit
 ├─ False promise        → penalty
 └─ Accept pause + next  → next_step+ (legitimate early pause — не «проигрыш»)
```

Связь с продуктом: учебный «early pause» **не** пишет `Deal.outcome`; в боевом кабинете early loss — отдельно ([D2 S-sales-02a](./02-role-scenarios.md)).

---

## 5. Не-чат механики (слоты хаба)

Запрещено сводить Академию к чату ([ADR-006](./adr/006-academy-mixed-mechanics.md)). Ниже — **спека механик**, контент узлов может наполняться после P0 sales.

### 5.1 `calc_sandbox` — визуальная практика расчёта

| Элемент | Спека |
|---------|--------|
| **Формат** | Песочница UI калькулятора **без** persist в боевую комнату |
| **Цель** | Отличить preliminary (площадь) от detailed (схема); анти-двойной учёт |
| **Механика** | Задания-карточки: «собери предварительный» / «почему сумма не preliminary+detailed» / «что нужно для tech-ready» |
| **Оценка** | Чек правильности выбора режима + quiz на SoT; не чат |
| **Изоляция** | Save пишет только в attempt sandbox; `context: training` |

**Assumption:** UI может переиспользовать визуальные паттерны Calc, но маршрут и storage — учебные (`scenarioId=calc_sandbox`).

### 5.2 `install_nodes` — монтажные узлы / чек-лист

| Элемент | Спека |
|---------|--------|
| **Формат** | Визуальные слоты узлов + симуляция чек-листа (done / N/A+причина / blocker) |
| **Цель** | Навык фиксации препятствий и обязательности чек-листа до closed |
| **Механика** | Drag/select узла → выбрать действие; ошибка «тихо closed без пунктов» = fail |
| **Оценка** | Rubric subset: `tech_accuracy`, `clarity`, `next_step` (+ install-specific errorTypes) |
| **Изоляция** | Не меняет Room.status боевых проектов |

---

## 6. Назначение, роли, RBAC

| Действие | admin | owner | sales | measurer | crew |
|----------|-------|-------|-------|----------|------|
| Открыть хаб / пройти P0 sales | ✓ | ✓ | ✓ | ✓ (opt) | ✓ (opt install later) |
| Назначить attempt коллеге | ✓ сети | ✓ org | — | — | — |
| Видеть training aggregates | ✓ отдельно | ✓ org | свой progress | свой | свой |
| Писать training в sales KPI | ✗ | ✗ | ✗ | ✗ | ✗ |

**Assumption:** crew в v1 видит хаб и слот install (даже `coming_soon`); обязательный P0-контент — sales trainers.

---

## 7. Состояния UI тренажёра

```text
Hub → Lobby(scenario) → Playing → Feedback → (Retry | Hub)
                ↘ Abandoned (confirm)
```

| Состояние | Данные |
|-----------|--------|
| Playing | attempt `started`; частичный transcript **без** ПД реального клиента |
| Feedback | `completed` + score + errorTypes |
| Abandoned | `abandoned`; score null |

Запрещено в payload событий/attempts: ФИО/телефон/адрес боевого клиента (`FORBIDDEN_PAYLOAD_KEYS` в `packages/shared/events.ts` — ориентир).

---

## 8. Критерии приёмки D9 (измеримые)

| ID | AC | Доказательство |
|----|----|----------------|
| AC-D9-01 | Хаб показывает ≥2 типа механик (чат + слот не-чат) | E-academy-hub |
| AC-D9-02 | P0: `sell_multiframe` и `objections` проходимы end-to-end с Feedback | attempt completed |
| AC-D9-03 | Любая learning attempt имеет `context: training` и **не** увеличивает Deal funnel | unit + analytics assert |
| AC-D9-04 | False promise снижает score на 25 (не ниже 0) | `scoreWithFalsePromisePenalty` |
| AC-D9-05 | Opening ≠ mastery | `openingCountsAsMastery` false |
| AC-D9-06 | Материалы открываются из E-materials, не подменяют тренажёр | nav IA |
| AC-D9-07 | Слоты `calc_sandbox` / `install_nodes` существуют в хабе (хотя бы coming_soon) | E-academy-hub |
| AC-D9-08 | Эталон Anna §4.2.1: Path S/P/F воспроизводимы; rubric 7 чисел + вычисленный score (88 / 71 / 11) | fixture attempt |
| AC-D9-09 | Free-text unknown / retry / pause не пишут Deal | events assert |

Полная матрица приёмки продукта — [D11](./11-acceptance-matrix.md) (блок Training isolation).

---

## 9. Assumptions (сводка)

1. **Assumption:** равные веса критериев рубрики в v1; порог сдачи ≥70 без критического false promise на hard.  
2. **Assumption:** P0 NPC — один за прохождение; objections = три секции в одном scenarioId.  
3. **Assumption:** version сценария — semver контента; история completed сохраняется.  
4. **Assumption:** calc/install sandbox переиспользует визуальные паттерны инструментов, но отдельный storage.  
5. **Assumption:** crew видит хаб в v1; обязательный контент P0 — sales chat trainers.  
6. **Assumption:** LLM-генерация реплик **не** обязательна в P0 — допускается скриптовое дерево с вариативными шаблонами.

---

## Связь

- Аналитика и StP-контур: [10-stp-support-analytics.md](./10-stp-support-analytics.md)  
- Приёмка: [11-acceptance-matrix.md](./11-acceptance-matrix.md)  
- ADR: [006-academy-mixed-mechanics.md](./adr/006-academy-mixed-mechanics.md)
