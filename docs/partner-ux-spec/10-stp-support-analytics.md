# D10 — StP: поддержка и аналитика

**Revision:** `rev-gate-b-final-candidate`  
**ID:** D10  
**Зависит от:** [D1 §5.5](./01-product-architecture.md), [D2 S-admin-02 / S-x-04](./02-role-scenarios.md), [D3 §4.2](./03-information-architecture.md), [D9](./09-academy.md), [D6](./06-probleмомер-ceiling.md), [D8](./08-commercial-process.md)  
**Ориентир кода (readonly):** `packages/shared/support.ts`, `funnel.ts`, `events.ts`, `learning.ts`  
**Статус:** final-candidate Gate B · **APPROVED 2026-10-23** · **не Gate C**

---

## 1. Цель контура

Продуктовая аналитика StP — **не дашборд ради графиков**, а рабочий контур помощи партнёру:

```text
1. Сигнал затруднения
2. Диагностика
3. Intervention (действие StP)
4. Verify: применение инструментов
5. Outcomes: Deal.outcome / сумма accepted — отдельно от training
```

Сценарий-якорь: **S-admin-02**. Экраны: E-analytics, E-partner-card, E-support, E-analytics-training.

---

## 2. Два контура метрик (жёсткое разделение)

| Контур | Что считает | Что запрещено |
|--------|-------------|----------------|
| **Боевые продажи** | Уникальные `dealId` + `context: work` | Мешать `training_*`, `context: training\|demo` |
| **Обучение** | LearningAttempt + `training_*` | Подменять конверсию / «кто продаёт» |
| **Инструменты** | Уникальные проходы PM/Calc (`funnelPassKey`) | Сырые «всего PDF» как KPI успеха партнёра |

Ориентиры:

- Конверсия = доля / число Deal с `outcome=accepted` (SoT на Deal).  
- Сумма принятого заказа — **отдельный** показатель.  
- `countsTowardSalesKpi` отсекает training/demo.  
- `learningAttemptAffectsSalesFunnel ≡ false`.  
- Open материала ∉ KPI продаж ([S-admin-03](./02-role-scenarios.md)).

---

## 3. Сигналы затруднения

Сигнал = повод открыть диагностику на PartnerCard / очереди admin. Не CRM чужой компании.

### 3.1 Типы сигналов

| Код | Смысл | Источник данных |
|-----|--------|-----------------|
| `funnel_stall` | Партнёр «застревает» на этапе воронки Deal | `computeDealFunnel` + stop-анализ по стадии |
| `tool_underuse` | Мало применяют PM/Calc относительно консультаций | tool funnel + события `problemomer_*` / `calculator_*` |
| `no_multiframe_offer` | Консультации есть, оффера MF нет / редко | `consultation_started` без `multiframe_offered` на dealId |
| `early_loss_cluster` | Кластер **только** `early_declined` (и post-quote `declined`) до/после КП — **проигранные** сделки | `Deal.outcome=early_declined` (+ declined); **исключить** `early_paused` |
| `paused_followup` | Отдельный срез: активные `early_paused` + просроченный follow-up | `outcome=early_paused` + `nextActionAt`; **не** входит в lost/decline rate |
| `support_cta` | Партнёр нажал «Нужна помощь» | SupportCase `open` |
| `training_gap` | Низкий progress / abandoned trainers | training aggregates (**отдельная** очередь, не sales KPI) |

**C2:** `early_paused` = waiting, не lost. Lost count / decline rate / `early_loss_cluster` считают только terminal losses (`early_declined`, `declined`). Паузы — только в `paused_followup` и inbox «Возобновить».

### 3.2 «Кто застревает» (who stalls)

Для org (и опционально user внутри org при достаточном N):

| Вопрос UI | Метрика |
|-----------|---------|
| На каком этапе Deal останавливаются? | stop-доля: offered → calculated → quote_created → quote_sent_confirmed → accepted |
| Где рвётся инструмент? | PM: open→result→pdf→share; Calc: open→calc_done→pdf (`funnelStopCounts`) |
| Кто в org тянет простой? | **Assumption:** v1 — org-level сигнал + top users по stall только при N≥minReliable; иначе «недостаточно наблюдений» |

### 3.3 «Почему не предлагают MultiFrame» + observational denominator (GB-P1-02)

Гипотезы диагностики (фиксируются текстом на case, не авто-корнем истины):

| Гипотеза | Наблюдаемый паттерн |
|----------|---------------------|
| Не умеют встроить оффер в консультацию натяжного | Много `consultation_started`, мало `multiframe_offered` |
| Боятся «допа» / цены | Early loss на contact/offered с lossReason price/upsell |
| Не доходят до PM/calc | tool_underuse при наличии проектов |
| Техошибка / не понимают UI | SupportCase category `tech_error` / `calculation` |

**Assumption:** автоматический классификатор гипотез v1 **не** обязателен — admin выбирает hypothesis вручную из справочника; сигнал только подсвечивает паттерн.

#### Observational denominator + session dedupe (C4)

`multiframe_offered / consultation_started` измеряет **только сессии, зафиксированные в приложении**. Это **не** «все консультации компании» и не «все продажи».

| Понятие | Идентификатор / правило |
|---------|-------------------------|
| **consultationSessionId** | Стабильный UUID на старте консультационного intent (home quick-entry **или** open PM/Calc с `intent=consult` / room-bound sales consult). Живёт в SessionDraft / client session storage до bind/abandon/timeout |
| **Dedupe-key** | `consultationSessionId` (primary). Fallback если legacy: `(orgId, userId, dayBucket, dealId\|draftId)` — только для миграции |
| Logged consultation | Одно событие `consultation_started` **на sessionId** (`context: work`); повторный open того же tool / retry / reopen PM+Calc **в той же session** → **не** +1 к знаменателю; могут писаться child events `tool_opened` с тем же sessionId |
| End of session | bind persist **или** explicit abandon **или** SessionDraft TTL (A-13) → session closed; следующий старт = новый sessionId |
| Unsaved / abandoned quick-entry | `consultation_started` только если session создан с consult intent; discard → опц. `consultation_abandoned` (не sale, не conversion); sessionId не переиспользуется |
| Demo / training | `context: training\|demo` — **exclude** |
| Early pre-Quote | `early_declined` (lost) и `early_paused` (waiting) представимы без Quote / без fabricated sale |
| Coverage warning | UI: `N = distinct consultationSessionId (work)`, `offered/N`, текст: «Доля среди консультаций **в приложении**; офлайн/незалогированные не входят» |

**Запрет:** подписывать метрику как «доля всех консультаций партнёра» или «доля реальных продаж».  
**AC:** одна консультация / несколько tool opens → один знаменатель (AC-D10-12).

### 3.4 Пороги (черновик цифр)

| Сигнал | Порог срабатывания | Окно |
|--------|--------------------|------|
| `funnel_stall` | stop-доля на одном этапе ≥ **40%** при N deals ≥ **5** | 28 дней |
| `tool_underuse` | calc_done / consultation_started < **0.3** при consultations ≥ **5** | 28 дней |
| `no_multiframe_offer` | offered/consultation < **0.5** при consultations ≥ **5** | 28 дней |
| `early_loss_cluster` | **`early_declined` (+ declined)** ≥ **3** за окно (**без** `early_paused`) | 28 дней |
| `paused_followup` | active `early_paused` с `nextActionAt` просрочен ≥ **3** | 28 дней |
| Малая выборка | любое N < **5** | UI: «недостаточно наблюдений» (`diagnosisConfidence`, `INSUFFICIENT_OBSERVATIONS_LABEL`) |

**Assumption:** пороги выше — стартовые для Gate B; калибровка по пилоту сети без смены контура шагов.

---

## 4. Диагностика (шаг 2)

На **E-partner-card** / case:

| Поле | Обязательность | Правило |
|------|----------------|---------|
| Org | да | Только агрегаты + ограниченный контекст модуля |
| SignalId(s) | да, если из сигнала | Связь intervention↔signal |
| Module | да | Экран/домен без карточки клиента |
| Hypothesis | да | Из справочника + свободный комментарий StP |
| Sample confidence | да | `reliable` / label insufficient |

**Запрет ПД:** SupportCase и события **не** прикладывают clientName/phone/address (`assertSupportPayloadSafe` / `assertEventPayloadSafe` в `packages/shared` — ориентир).

Admin видит: агрегаты воронки, tool usage, training **отдельным** блоком, open cases.  
Admin **не** видит: полный полевой канбан чужой компании как операционист; сырые ПД клиентов сверх минимума поддержки.

---

## 5. Intervention (шаг 3)

Ориентир сущности `Intervention`:

| Поле | Смысл |
|------|--------|
| `supportCaseId` | Связь с обращением (nullable если proactiva) |
| `problemType` | Код сигнала / гипотезы |
| `actionType` | Ответ · материал · назначение обучения · созвон-фиксация · иное |
| `signalId` | `linkInterventionToSignal` |
| `reviewAt` | Когда проверить adoption |
| `result` | `improved` \| `unchanged` \| `worse` \| `insufficient_data` \| null |

Категории SupportCase: `sales` · `calculation` · `install` · `materials` · `tech_error` · `other`.

| actionType | Следствие в продукте |
|------------|----------------------|
| `reply` | Статус case → in_progress / ответ партнёру |
| `attach_material` | Ссылка на E-materials (open ∉ sales KPI) |
| `assign_training` | `training_assigned` + LearningAttempt assigned (**training contour**) |
| `call_logged` | Фиксация созвона без записи чужих сделок |
| `other` | Свободное действие + reviewAt |

---

## 6. Verify tool use → outcomes (шаги 4–5)

После `reviewAt`:

1. **Verify adoption:** сравнить tool-funnel / ключевые события **до/после** intervention на той же org.  
2. **`interventionResultFromSamples(before, after, minSamples=5)`** — при малом N → `insufficient_data`, **не** «улучшение».  
3. **Outcomes:** смотреть Deal.outcome / accepted sum в том же окне **отдельной** панелью.  
4. Training completed **не** засчитывается как рост продаж.

```text
before window ──intervention── after window
   tools N1                      tools N2  → result
   deals outcomes                deals outcomes → отдельный блок
   training attempts             training attempts → E-analytics-training only
```

**Assumption:** окно before/after = 14 дней каждое относительно `startedAt` / `reviewAt`, если admin не задал иное.

---

## 7. Очередь admin и состояния case

```text
Signal new → diagnosing → intervening → verifying_adoption → resolved | monitoring
SupportCase: open → in_progress → resolved → closed
```

| Очередь | Содержимое |
|---------|------------|
| Inbox сигналов | Неразобранные signal по сети |
| Cases | SupportCase open/in_progress |
| Monitoring | Interventions с наступившим reviewAt без result |
| Training (отдельно) | Назначенные/просроченные trainers — **не** смешивать с sales inbox |

---

## 8. RBAC admin StP

| Разрешено | Запрещено |
|-----------|-----------|
| Создать org + one-time credentials | Регулярный просмотр действующего пароля |
| Агрегаты сети, PartnerCard, сигналы | Delete **чужих** проектов / комнат / Deal |
| SupportCase + Intervention | Править чужие сделки как sales |
| Назначить training / материал | Полевой CRM операциониста партнёра |
| Ограниченная диагностика модуля | Сырые ПД клиента в analytics payload |

**AC-якорь:** S-admin-02 — admin без delete foreign projects; training не смешан с KPI продаж.

**Assumption:** «ограниченная диагностика» = read-only агрегаты + meta модуля/экрана + count сущностей; без списка ФИО клиентов org.

---

## 9. Partner → StP (вход)

Любая роль: CTA «Нужна помощь» + `module` context → SupportCase ([S-x-04](./02-role-scenarios.md)).

| Правило | Следствие |
|---------|-----------|
| Payload без client PII | `isSupportPayloadSafe` |
| category обязателен | UI picker |
| Training-тема | Может создать case, но метрики case outcome ≠ Deal conversion |

---

## 10. Экраны и данные (сводка)

| Экран | Данные |
|-------|--------|
| E-analytics | Deal funnel aggregates, tool funnel, early loss |
| E-analytics-training | attempts, scores, assigned/completed (**отдельно**) |
| E-partner-card | signals, cases, interventions, confidence |
| E-support | SupportCase create/view (partner + admin) |
| E-materials | библиотека; open ∉ sales KPI |

Идентичность коммерции для outcomes: воронка по **`dealId`**, не по room; после closed Deal — новый dealId в истории ([ADR-008](./adr/008-deal-quote-project-identity.md)).

---

## 11. Критерии приёмки D10

| ID | AC | Доказательство |
|----|----|----------------|
| AC-D10-01 | UI контура показывает 5 шагов signal→…→outcomes | E-partner-card / case |
| AC-D10-02 | Training aggregates не входят в sales conversion widgets | assert + UI separation |
| AC-D10-03 | N<5 → «недостаточно наблюдений», не improved | `diagnosisConfidence` / `interventionResultFromSamples` |
| AC-D10-04 | Support payload без client PII keys | `assertSupportPayloadSafe` |
| AC-D10-05 | Admin не может delete чужой project | RBAC test |
| AC-D10-06 | Видны stall-этап и паттерн «нет оффера MF» при достаточных N | signal list |
| AC-D10-07 | Intervention связана с signalId и reviewAt | `linkInterventionToSignal` |
| AC-D10-08 | Outcomes Deal считаются по dealId, context=work | `computeDealFunnel` |
| AC-D10-09 | Offer-rate UI показывает N (distinct sessionId), ratio и coverage warning | E-analytics / PartnerCard |
| AC-D10-10 | training/demo excluded from consultation denominator | events filter |
| AC-D10-11 | `early_declined` в early_loss; `early_paused` **не** в lost/decline rate | funnel assert |
| AC-D10-12 | Одна consultationSessionId + 3 tool opens → знаменатель +1 | fixture dedupe |
| AC-D10-13 | paused_followup отдельный сигнал; не смешивается с early_loss_cluster | signal list |

Полная матрица — [D11](./11-acceptance-matrix.md).

---

## 12. Assumptions (сводка)

1. **Assumption:** пороги §3.4 стартовые (28д / N≥5 / 40% stall / 0.3 tool / 0.5 offer).  
2. **Assumption:** гипотеза «почему не MF» выбирается admin вручную из справочника.  
3. **Assumption:** top-user stall внутри org только при reliable N.  
4. **Assumption:** before/after окна 14+14 дней по умолчанию.  
5. **Assumption:** ограниченная диагностика без списка ФИО клиентов.  
6. **Assumption:** proactive Intervention без SupportCase допустима (supportCaseId null).

---

## Связь

- Академия: [09-academy.md](./09-academy.md)  
- Приёмка: [11-acceptance-matrix.md](./11-acceptance-matrix.md)  
- Сценарий: [02-role-scenarios.md](./02-role-scenarios.md) S-admin-02
