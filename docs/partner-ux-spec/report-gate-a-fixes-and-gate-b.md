# Отчёт: доработка Gate A (3 пункта) и разработка Gate B

**Проект:** MultiFrame Партнёр (потолочные компании)  
**Дата:** 2026-10-22  
**База кода (аудит):** `main` · SHA `953be7ed7ddc1bddd1a2c0834ccee6cdeec47fbf`  
**Исполнитель:** агент [Complete Gate A then B](bc-e46da56b-ac3d-53c2-9620-190234c93452) под координацией Project  

**Ревизии:**

| Этап | Revision ID | Статус |
|------|-------------|--------|
| Gate A (после 3 правок) | `rev-gate-a-approved-20261022` | Согласован **условно** заказчиком |
| Gate B | `rev-gate-b-draft-1` | Черновик на ревью заказчика |

**Ограничения соблюдены:** продуктовый код (`apps/web`, `apps/api`, `packages/*`) не изменялся; Gate C (прототипы) не начинался.

---

## 1. Контекст работы

После пакета `rev-gate-a-final-candidate` заказчик дал условное согласование Gate A при условии трёх архитектурных исправлений и заранее разрешил автономный переход к полному комплекту Gate B (D4–D11) без промежуточных остановок.

Задача состояла из двух этапов:

1. Зафиксировать три правки идентичности Deal / Quote / Project, провести самопроверку, сделать версионированный снимок архитектуры.  
2. Разработать полный комплект спецификаций Gate B и провести саморевью.

---

## 2. Три пункта доработки Gate A

Документ решения: [ADR-008](./adr/008-deal-quote-project-identity.md)  
Changelog: [gate-a-changelog-final-candidate-to-approved.md](./gate-a-changelog-final-candidate-to-approved.md)  
Снимок: [revisions/rev-gate-a-approved-20261022/](./revisions/rev-gate-a-approved-20261022/) (+ [MANIFEST](./revisions/rev-gate-a-approved-20261022/MANIFEST.md))

Обновлены зависимые документы: D0, D1, D2, D2a, D3, ADR-004, gate-a-review, README.

### 2.1. Deal — новый `dealId` после закрытия

| | |
|--|--|
| **Проблема** | Переход `closed → contact` читался как переоткрытие той же сделки; история outcome и суммы могла быть переписана. |
| **Решение** | Закрытая Deal **неизменна** в истории проекта. Следующая sequential Deal — **новый экземпляр** с **новым `dealId`** в том же `projectId`. Reopen / recycle того же id запрещены. Параллельные активные Deal запрещены. |
| **Зачем** | Сохранить аудит исхода, сумму принятого заказа и корректность аналитики StP. |

### 2.2. QuoteRevision — неизменяемость и привязка к Deal

| | |
|--|--|
| **Проблема** | N+1 версии КП не была жёстко привязана к конкретной Deal; в коде `dealId` на Quote ещё nullable. |
| **Решение** | После `sent_confirmed` экземпляр **immutable**. Пересмотр / новый calc / новый состав → **новый** QuoteRevision (N+1), не patch sent. Каждая ревизия **обязательно** принадлежит одной Deal (`dealId` required для новых записей). Sent-версии прошлых Deal остаются в истории своей Deal. |
| **Зачем** | Не смешивать КП разных коммерческих нитей; не переписывать обещание клиенту. |

### 2.3. Project — закрытие Deal ≠ завершение проекта

| | |
|--|--|
| **Проблема** | UX-фаза Project `Done` после `deal_closed` выглядела как «сделка закрыта = проект завершён», хотя возможны deferred-комнаты и повторные заказы. |
| **Решение** | Закрытие Deal завершает **коммерческую нить**, не обязательно Project. Project остаётся Active при deferred / незакрытых комнатах / следующей Deal. Конверсия считается **по `dealId`**, не по «проект закрыт». |
| **Зачем** | Один адрес клиента живёт дольше одной продажи; повторный заказ по отложенным комнатам возможен в первой версии продукта. |

### 2.4. Итог этапа Gate A

- Три противоречия сняты на уровне архитектуры (не отложены в Gate B).  
- Создан переносимый снимок `rev-gate-a-approved-20261022`.  
- Gate A считается **условно согласованным** с этими корректировками.  
- Автоматический переход к Gate B выполнен по разрешению заказчика.

---

## 3. Разработка Gate B

**Revision:** `rev-gate-b-draft-1`  
Резюме для заказчика: [gate-b-review.md](./gate-b-review.md)  
Handoff: [gate-b-handoff-report.md](./gate-b-handoff-report.md)  
Оглавление пакета: [README.md](./README.md)  
Каталог экранов (выжимка): [gate-b-d4-d11-catalog.md](./gate-b-d4-d11-catalog.md)

Цель Gate B: настолько подробные спецификации, чтобы последующие агенты могли проектировать интерфейсы и реализовывать продукт **без изобретения** пользовательских сценариев.

### 3.1. Состав комплекта D4–D11

| ID | Документ | Содержание |
|----|----------|------------|
| **D4** | [04-screen-specs/](./04-screen-specs/) | 15 кластеров экранов: login, 5 homes, nav, projects, project, inquiry, room, tools, PM, calc-save, quote/deal, install, academy, StP support, analytics. Для каждого: кто/зачем/вход/иерархия/CTA/данные/переходы/состояния/mobile/RBAC/AC. Запрет вертикальных стеков (ADR-003). |
| **D5** | [05-data-model-contracts.md](./05-data-model-contracts.md) | Целевая модель Project/Room/Deal/Quote/calc/assent/checklist; инварианты ADR-008; events; RBAC данных; save/sync/recovery; **gaps** vs `packages/shared` и API; план миграций. |
| **D6** | [06-probleмомер-ceiling.md](./06-probleмомер-ceiling.md) | PM для потолочников: без вопроса типа потолка; клиент без осознания ЗИ; «Следующий шаг» с контекстом проекта/комнаты; ядро акустики не ломаем. |
| **D7** | [07-calculator-ceiling.md](./07-calculator-ceiling.md) | Calc: стены вне main UI; preliminary + detailed; Save в комнату; quick-entry → bind; история; anti-loss; связь с КП (N+1). Алгоритмы раскладки не меняем. |
| **D8** | [08-commercial-process.md](./08-commercial-process.md) | Полный коммерческий путь: early loss → консультация → prelim/exact КП → multi-room → partial assent → sequential Deal (новый dealId) → confirm_sent → outcomes. |
| **D9** | [09-academy.md](./09-academy.md) | Хаб; P0 чат-тренажёры продаж; слоты не-чат механик (монтаж/расчёт); `context: training` не входит в KPI продаж. |
| **D10** | [10-stp-support-analytics.md](./10-stp-support-analytics.md) | Контур StP: сигнал → диагностика → intervention → verify → outcomes; learning vs sales раздельно. |
| **D11** | [11-acceptance-matrix.md](./11-acceptance-matrix.md) | 35 измеримых AC со связью сценарий ↔ экран ↔ данные; запрет Done по «экран есть / CI green». |

Дополнительно:

- [assumptions.md](./assumptions.md) — A-01…A-35 (явные предположения, не решения заказчика)  
- [gate-b-self-review.md](./gate-b-self-review.md) — саморевью по 10 критериям  
- ADR 001–008 в [adr/](./adr/)

### 3.2. Саморевью Gate B

| # | Критерий | Вердикт |
|---|----------|---------|
| 1 | Согласованность D0–D11 | PASS |
| 2 | Соответствие Gate A / §8 / ADR-008 | PASS |
| 3 | Пять ролей (home / nav / RBAC) | PASS |
| 4 | Переходы / отсутствие хаоса re-entry | PASS |
| 5 | Реализм потолочников (D6/D7) | PASS |
| 6 | Empty / error / offline | PASS |
| 7 | Глубина RBAC | PASS |
| 8 | Глубина AC (не формализм) | PASS |
| 9 | Готовность к Gate C без догадок сценариев | PASS with notes (pixel copy — Gate C) |
| 10 | Нет ломки SoT / архитектуры | PASS |

### 3.3. Ключевые gaps к текущему коду (зафиксированы, не чинились)

- `dealId` на Quote nullable; versioning не per dealId.  
- Нет `roomAssent` / `early_*` / checklist в shared.  
- `canManageStaff(sales)=true` расходится с решением §8.11 (staff создаёт owner).  
- UI homes на `main` — вертикальные стеки; целевой UX описан в D4.

### 3.4. Что оставлено на утверждение / уточнение заказчика

Из [assumptions.md](./assumptions.md) и residual self-review наиболее важны:

- пороги сигналов StP (A-28);  
- политика waive чек-листа (A-05);  
- момент явного закрытия Deal после partial (A-06);  
- atomic create Project+Room+Deal (A-11).

---

## 4. Что сознательно не делалось

| Запрет | Статус |
|--------|--------|
| Изменение продуктового кода | Соблюдён |
| Gate C (wireframes / HTML-прототипы) | Не начат |
| Gate D+ / реализация UI | Не начат |
| Сохранение утверждённых спек в git-репозиторий | Только по отдельному разрешению заказчика |

---

## 5. Рекомендуемый следующий шаг

1. Заказчик ревьюирует Gate B (`rev-gate-b-draft-1`) — старт: [gate-b-review.md](./gate-b-review.md).  
2. При OK — снимок `docs/revisions/rev-gate-b-approved-…/` и явное разрешение на **Gate C** (изолированные прототипы).  
3. Код — только после отдельного «можно в код».

Список экранов-кандидатов на прототипирование Gate C — в §5 [gate-b-handoff-report.md](./gate-b-handoff-report.md).

---

## 6. Ссылки на артефакты

| Артефакт | Путь |
|----------|------|
| Этот отчёт | [report-gate-a-fixes-and-gate-b.md](./report-gate-a-fixes-and-gate-b.md) |
| ADR-008 (3 правки) | [adr/008-deal-quote-project-identity.md](./adr/008-deal-quote-project-identity.md) |
| Снимок Gate A | [revisions/rev-gate-a-approved-20261022/](./revisions/rev-gate-a-approved-20261022/) |
| Gate A review | [gate-a-review.md](./gate-a-review.md) |
| Gate B review | [gate-b-review.md](./gate-b-review.md) |
| Gate B handoff | [gate-b-handoff-report.md](./gate-b-handoff-report.md) |
| Оглавление D0–D11 | [README.md](./README.md) |
| Каталог D4 + D5–D11 | [gate-b-d4-d11-catalog.md](./gate-b-d4-d11-catalog.md) |
| Assumptions | [assumptions.md](./assumptions.md) |
| Self-review Gate B | [gate-b-self-review.md](./gate-b-self-review.md) |

---

*Конец отчёта.*
