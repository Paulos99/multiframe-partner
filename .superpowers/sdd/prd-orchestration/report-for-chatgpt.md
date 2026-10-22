# Отчёт об исполнении плана оркестрации PRD MultiFrame Партнёр

**Для:** ChatGPT (автор плана оркестрации агентов)  
**Дата отчёта:** 22 октября 2026, ~12:45 Europe/Moscow  
**Исполнитель:** Cursor Cloud Agent (`bc-bcace6aa-02d7-41e8-8bac-dcf326ad55a4`)  
**Заказчик:** Paulos99 (Павел)  
**Репозиторий:** [Paulos99/multiframe-partner](https://github.com/Paulos99/multiframe-partner)  
**Ветка:** `cursor/prd-orchestration-55a4`  
**PR:** [#76](https://github.com/Paulos99/multiframe-partner/pull/76) — ready for review  
**HEAD на момент отчёта:** `b54ea88`  
**База:** `main` @ `fe2ad7e`

---

## 1. Краткий вердикт

План волн **0 → 4 + final-review** по PRD (P0–P1, MF-01…MF-17) **реализован в ветке и запушен на GitHub**.  
Слияние в `main` **ещё не сделано**: перед merge чинили красный CI (kanban e2e); фикс запушен, UI package checks на `b54ea88` ещё шли на момент этого отчёта.

Объём диффа к `main`: **~69 файлов, +7727 / −850 строк**.

---

## 2. Исходный план (что исполняли)

План Cursor: `оркестрация_агентов_prd_a80c7aa6.plan.md`  
(локальный артефакт агента: `/opt/cursor/artifacts/plans/…prd_a80c7aa6.plan.md`; файл плана по инструкции **не редактировали**).

SDD-ledger: `.superpowers/sdd/prd-orchestration/progress.md` (rulings зафиксированы).

### Волны

| Волна | Цель плана | Статус |
|------|------------|--------|
| **0** | Контракт Deal/Quote/Events/Learning/Support + чистые правила воронки, без UI/API | ✅ |
| **1** | Разрез API на routes, миграция platform storage, org-изоляция, training∉dashboard | ✅ |
| **2** | `CabinetScreen` → homes 5 ролей без смены поведения (разблокировка монолита) | ✅ |
| **3** | Коммерческий процесс: синк, 3 входа, WorkToday, assignments, КП, исход сделки | ✅ |
| **4a** | Сигналы / PartnerCard / StP support | ✅ |
| **4b** | Академия: «Продай MultiFrame» + возражения | ✅ |
| **final-review** | Сводка + smoke; доводка demo без API | ✅ (с оговорками ниже) |

Параллель разрешалась только в волне 4 после разреза монолитов. P2 / этап 0 / 152-ФЗ / акустика / ИИ-тренер — **вне скоупа**, не трогали.

### MF → факт

| ID | P | Суть | Волна | Факт |
|----|---|------|-------|------|
| MF-01 | P0 | Homes 5 ролей | 2–3 | ✅ Admin/Owner/Sales/Measurer/Crew |
| MF-02 | P0 | 3 точки входа | 3 | ✅ консультация / быстрый расчёт / проблемомер |
| MF-03 | P0 | Черновики + статусы синка | 3 | ✅ syncLabels + SyncStatus |
| MF-04 | P0 | КП: copy≠sent, confirm, версии | 0+3 | ✅ shared + API + localDemo |
| MF-05 | P0 | Assignments sales/measurer/crew | 0+3 | ✅ ObjectAssignments; assignedTo derived |
| MF-06 | P0 | Исход сделки; closed≠продажа | 0+3 | ✅ outcome/lossReason; jobClosed≠accepted |
| MF-07 | P0 | События без ПД; воронка по deal | 0+4a | ✅ scrub + deal funnel |
| MF-08 | P0 | Org-изоляция; training∉KPI | 0+1 | ✅ |
| MF-09 | P1 | Причины отказа | 0+3 | ✅ LossReason |
| MF-10 | P1 | PartnerCard StP | 4a | ✅ |
| MF-11 | P1 | «Нужна помощь StP» без ПД | 4a | ✅ SupportRequestButton |
| MF-12 | P1 | Академия отдельной навигацией | 4b | ✅ AcademyScreen |
| MF-13 | P1 | Тренажёр «Продай MultiFrame» | 4b | ✅ сценарий ~495 строк |
| MF-14 | P1 | Тренажёр возражений | 4b | ✅ сценарий ~358 строк |
| MF-15 | P1 | Единое КП по комнатам проекта | 3 | ✅ QuoteRevision.roomObjectIds + панель |
| MF-16 | P1 | Монтажный чек-лист | — | ❌ **не входил в волны плана** |
| MF-17 | P1 | Intervention ↔ сигнал | 0+4a | ✅ support + diagnose link |
| MF-18…20 | P2 | — | — | вне скоупа |

---

## 3. Зафиксированные product rulings (из плана / ledger)

1. **Deal** — отдельная сущность, привязана к `projectId`. Статусы `JobObject` сохранены; `quote_sent` / `closed` объекта **не равны** «КП отправлено» / «продажа».
2. **КП lifecycle:** `quote_created → quote_shared → quote_sent_confirmed → accepted|declined|postponed`. **Копирование текста / PDF не меняет статус** (`copyOrPdfImpliesSent === false`).
3. **ObjectAssignments:** `salesUserId`, `measurerUserId`, `crewUserId`; `assignedTo` — derived.
4. Тренажёры **без LLM**; события с `context: training|demo` **не входят в KPI**.
5. События **без ПД**; дедуп по `eventId`; воронка по `dealId`.
6. Малая выборка диагностики → подпись **«недостаточно наблюдений»**.
7. Акустику / problematомер-ядро **не трогали**.

### Отклонение от формулировки плана (осознанно)

В плане ревью фигурировало «crew по-прежнему не видит цены».  
**Продуктовое решение исполнения:** цены в смете видят **все роли**, включая crew. Есть тест, фиксирующий отсутствие role-based price hiding. Redact сумм КП для crew на API сделан отдельно (суммы quote), не смета объекта.

---

## 4. Что сделано по слоям

### 4.1 Shared (`packages/shared/`)

Новые модули (+ зеркала `.js`):

- `deal.ts` — Deal, DealStage, Outcome, LossReason, ObjectAssignments, pure helpers  
- `quote.ts` — QuoteRevision, lifecycle, `applyQuoteAction`  
- `events.ts` — PlatformEvent, PII assert, KPI filter, `computeDealFunnel`, confidence  
- `learning.ts` — scenarios/attempts/rubric; training∉funnel  
- `support.ts` — SupportCase, Intervention, payload safety  
- расширения `partner.ts` под assignments / re-exports  

Тесты контракта: `apps/api/prdContract.test.js` (~235 строк).

### 4.2 API (`apps/api/`)

- `platformMigrate.js` — миграция ключей storage **без** создания пустых projects (регресс projects.test учтён)  
- Routes: `deals`, `quotes`, `academy`, `support`, `objects` (assignments), `analytics`  
- Wiring в `index.js`  
- Org-изоляция; academy attempts scoped; assignments auth  
- Scrub analytics PII (`analyticsPii.test.js`)  
- HTTP smoke: `routes.prd.test.js`  

Локально заявлялось: **~150** тестов API зелёные.

### 4.3 Web — cabinet / роли

- `CabinetScreen.tsx` сведён к тонкому switcher (~−800 строк монолита)  
- Homes: `AdminHome`, `OwnerHome`, `SalesHome`, `MeasurerHome`, `CrewHome` + `cabinetShared`  
- «Сегодня в работе» (`WorkToday` + `nextActionsForRole`)  
- `EntryPoints` — три равноправных входа  
- `CommercialPanel`: assignments, КП (создать / копировать / подтвердить отправку), исход сделки  

**Demo без remote API:** `localDeals.ts` + `useCommercialDeals` — сделки/КП в localStorage, те же правила copy≠sent.

### 4.4 Signals / Support / PartnerCard

- `signals/diagnose.ts` (~389 строк) + `SignalsList`  
- `SupportRequestButton` + `supportRequest.ts` (без ПД в payload)  
- `PartnerCard.tsx` для StP  

### 4.5 Academy

- `AcademyScreen`, `SellMultiframeTrainer`, `ObjectionsTrainer`  
- Сценарии без LLM; unit `academy.test.ts`  
- Вход из обучения / help  

### 4.6 E2E / demo smoke

- `playwright.demo.config.ts`  
- `prd-roles-parallel.spec.ts` — 5 ролей  
- `prd-commercial-demo.spec.ts` — коммерческий путь КП  
- Заявлялось: **6/6 passed** (параллельный demo)  
- Починка CI: `kanban-drag-delete.spec.ts` + порядок блоков на Owner/Sales home + dismiss меню на wheel/touch (не на Lenis `scroll`)

---

## 5. Коммиты (хронология волны)

| SHA | Сообщение |
|-----|-----------|
| `9e49437` | feat(shared): PRD contract Deal/Quote/Events/Learning/Support |
| `5f61bff` | feat(api): split PRD routes and migrate platform storage |
| `e3f17f9` | refactor(web): split CabinetScreen into role home modules |
| `a6a5839` | feat(web): commercial process — sync labels, entries, KP, outcomes |
| `bfde839` | feat(web): partner signals, PartnerCard, StP support request |
| `48c8965` | feat(web): academy trainers Sell MultiFrame and Objections |
| `b6f8438` | fix(api): scrub analytics PII, tighten quotes/academy/assignments |
| `0623c6d` | feat(web): local deals/quotes for demo and parallel role smoke |
| `b54ea88` | fix(web): keep kanban reachable for drag/delete e2e |

---

## 6. Решения заказчика по ходу (влияние на исполнение)

| Решение | Эффект |
|---------|--------|
| Не гонять повторные параллельные browser-checks (одного smoke достаточно) | Final-review без повторного тяжёлого browser-swarm |
| «Доделай до конца, API дам если надо» | Demo-путь сделок доведён **без** обязательного remote API (localStorage) |
| «Запушь в мейн» | Merge ждал зелёный CI после красного kanban e2e; фикс `b54ea88` запушен в feature-ветку |
| Цены crew | Оставлены видимыми (смета) — расхождение с ранней формулировкой плана |

---

## 7. Проблемы CI и фикс перед merge

**Симптом (UI package checks):**  
`kanban-drag-delete.spec.ts` — 2 падения:

1. Drag overlay не появляется (карточка вне viewport: сырой `mouse` без scroll).  
2. Меню «Удалить» исчезает: закрытие меню слушало `scroll` (capture), а Lenis / `scrollIntoView` Playwright гасили меню сразу после открытия.

**Причина:** на Owner/Sales home над канбаном стояли тяжёлые Commercial/EntryPoints блоки → доска уехала вниз первого viewport.

**Фикс (`b54ea88`):**

1. `RoleWorkspace` (канбан) **перед** EntryPoints/CommercialPanel.  
2. Меню закрывается на `wheel`/`touchmove`, не на `scroll`.  
3. В e2e — `scrollIntoViewIfNeeded` перед grab/delete.

На момент отчёта CI на `b54ea88` **ещё in_progress** (шаг e2e). В `main` **ещё не влито**.

---

## 8. Что осталось / вне скоупа

| Пункт | Статус |
|-------|--------|
| Merge `cursor/prd-orchestration-55a4` → `main` + push | ⏳ после зелёного CI |
| Deploy Yandex (API / Pages) | ⏳ нужны SA/секреты от заказчика, если потребуется |
| Smoke сделок на **живом** `VITE_API_URL` gateway | не прогоняли end-to-end на проде |
| MF-16 монтажный чек-лист | не в волнах плана |
| MF-18…20, этап 0 PRD, 152-ФЗ, ИИ-тренер, мотивация | вне оркестрации |
| Пилот на живых партнёрах / живая admin-аналитика | не делалось |
| Обновление SDD Progress-таблицы в ledger | rulings есть, Progress пустой — можно дописать по этому отчёту |

---

## 9. Как проверить самому

```bash
# API
cd apps/api && npm test

# Web unit + types
cd apps/web && npm run typecheck && npm run test:unit

# Demo smoke (5 ролей + commercial) — без обязательного CI UI package
cd apps/web && npx playwright test --config=playwright.demo.config.ts

# Полный UI package e2e (как в CI) — нужен чистый env без VITE_DEMO_MODE=true в .env
cd apps/web && npm run test:e2e
```

PR: https://github.com/Paulos99/multiframe-partner/pull/76

---

## 10. Сообщение автору плана (одной фразой)

План оркестрации выполнен по волнам 0–4 и final-review в feature-ветке с полным контрактом Deal/Quote/Events/Learning/Support, разрезом API, homes 5 ролей, коммерческим циклом (в т.ч. demo без API), сигналами/StP help и академией; в `main` не влито до зелёного CI после фикса kanban e2e; MF-16 и P2 не входили в согласованные волны.

---

*Конец отчёта. Можно целиком вставить в ChatGPT как контекст исполнения его плана.*
