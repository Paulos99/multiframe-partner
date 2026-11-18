# Brief для независимой экспертизы в ChatGPT

**Пакет:** MultiFrame Партнёр — спецификации UX / продукта  
**Revision Gate B:** `rev-gate-b-draft-1`  
**Revision Gate A (снимок):** `rev-gate-a-approved-20261022`  
**База кода (аудит, не менялась в этом пакете):** `main` · SHA `953be7ed7ddc1bddd1a2c0834ccee6cdeec47fbf`  
**Репозиторий:** https://github.com/Paulos99/multiframe-partner  
**Каталог в репо:** [`docs/partner-ux-spec/`](./)  
**ZIP:** [`docs/partner-ux-spec-rev-gate-b-draft-1.zip`](../partner-ux-spec-rev-gate-b-draft-1.zip)

---

## Роль эксперта

Ты — независимый архитектурный и продуктовый ревьюер B2B SaaS для **потолочных компаний** (натяжные потолки + звукоизоляция MultiFrame).

Оцени пакет спецификаций (Gate A + Gate B). **Не предлагай сразу писать код.** Не считай задачу выполненной, если «файлы есть» или «CI зелёный» — в пакете это явно запрещено.

Сегмент: партнёрский кабинет (роли admin StP, owner, sales, measurer, crew). Иерархия **Проект → Комнаты**; коммерция (Deal/КП) отделена от исполнения (статус комнаты / монтаж).

---

## Как читать (порядок)

1. [README.md](./README.md) — статусы гейтов, оглавление D0–D11  
2. [gate-a-review.md](./gate-a-review.md) + [adr/008-deal-quote-project-identity.md](./adr/008-deal-quote-project-identity.md)  
3. [gate-b-review.md](./gate-b-review.md) + [gate-b-handoff-report.md](./gate-b-handoff-report.md)  
4. [01-product-architecture.md](./01-product-architecture.md) → [03-information-architecture.md](./03-information-architecture.md)  
5. [02-role-scenarios.md](./02-role-scenarios.md) + [02a-responsibility-matrix.md](./02a-responsibility-matrix.md)  
6. D4: [04-screen-specs/00-index.md](./04-screen-specs/00-index.md) и экраны  
7. [05-data-model-contracts.md](./05-data-model-contracts.md)  
8. [06-probleмомер-ceiling.md](./06-probleмомер-ceiling.md) · [07-calculator-ceiling.md](./07-calculator-ceiling.md) · [08-commercial-process.md](./08-commercial-process.md)  
9. [09-academy.md](./09-academy.md) · [10-stp-support-analytics.md](./10-stp-support-analytics.md)  
10. [11-acceptance-matrix.md](./11-acceptance-matrix.md)  
11. [assumptions.md](./assumptions.md) · [gate-b-self-review.md](./gate-b-self-review.md)  
12. При необходимости: [report-gate-a-fixes-and-gate-b.md](./report-gate-a-fixes-and-gate-b.md), changelogs, снимок `revisions/rev-gate-a-approved-20261022/`

Каталог-выжимка экранов: [gate-b-d4-d11-catalog.md](./gate-b-d4-d11-catalog.md).

---

## Что уже утверждено заказчиком (не оспаривай без сильной причины)

- Единая платформа ≠ пять клонов кабинета; Проект → Комнаты; запрет вертикальных стеков.  
- Специализация на потолочниках (PM/Calc).  
- §8 решений Gate A (14 пунктов) + три правки ADR-008: новый `dealId` после closed; sent QuoteRevision immutable и на Deal; Project ≠ закрытие одной Deal.  
- Design-first: код и Gate C (прототипы) ещё не разрешены.

Всё в [assumptions.md](./assumptions.md) — **не** утверждения заказчика; отмечай как Assumption.

---

## Вопросы экспертизы (ответь структурированно)

### A. Архитектура и целостность
1. Есть ли противоречия между D1/D3/D5 и ADR-004/008 (Deal, Quote, Project, Room)?  
2. Согласованы ли sequential Deal, roomAssent, tech-ready и монтаж?  
3. Не смешиваются ли sale / conversion / закрытие комнаты / training KPI?

### B. Продукт для потолочников
4. Реалистичны ли сценарии менеджера, замерщика, бригады?  
5. Достаточны ли D6/D7 (без типа потолка в main path; walls вне UI; prelim vs detailed; Save/bind)?  
6. Покрыты ли early decline, partial assent, повторный заказ?

### C. UX / экраны (D4)
7. Нет ли риска снова собрать «вертикальный стек»?  
8. Достаточны ли screen specs для прототипов Gate C без изобретения сценариев?  
9. Пробелы empty/error/offline/mobile/RBAC?

### D. Данные и миграции (D5)
10. Понятны ли gaps к текущему коду и риски миграции?  
11. Достаточны ли инварианты immutability / anti-double-count / org isolation?

### E. Академия и StP (D9/D10)
12. Разведены ли training и продажи?  
13. Рабочий ли контур StP; адекватны ли пороги (Assumption A-28)?

### F. Приёмка (D11)
14. Можно ли принять продукт по AC без формализма «экран есть»?  
15. Какие AC слабые или непроверяемые?

### G. Вердикт
16. Готов ли пакет к Gate C (прототипы)? Что блокирует?  
17. Топ-10 критических замечаний (severityритет).  
18. Список решений, которые заказчик должен утвердить до реализации (из Assumptions и твоих находок).

---

## Формат ответа эксперта

1. **Вердикт:** Ready for Gate C / Ready with fixes / Not ready  
2. **Критические findings** (таблица: id · severity · где в спеках · суть · рекомендация)  
3. **Продуктовые риски**  
4. **Противоречия и пробелы**  
5. **Что утвердить заказчику до кода**  
6. **Что можно отложить на Gate C / реализацию**

Пиши по-русски, конкретно, со ссылками на файлы пакета (`D3 §…`, `ADR-008`, `AC-GP-01` и т.д.).

---

## Стартовый промпт (скопировать в ChatGPT)

```
Ты независимый архитектурный и продуктовый ревьюер. В репозитории
https://github.com/Paulos99/multiframe-partner в каталоге docs/partner-ux-spec/
лежит пакет MultiFrame Партнёр (Gate A approved snapshot + Gate B rev-gate-b-draft-1).

Сначала открой docs/partner-ux-spec/CHATGPT_REVIEW_BRIEF.md и следуй порядку чтения
и вопросам экспертизы из этого файла. Не предлагай писать код. Верни вердикт
Ready / Ready with fixes / Not ready, критические findings со ссылками на документы
пакета и список решений, которые должен утвердить заказчик до реализации.
```

Если ChatGPT не видит GitHub: загрузи ZIP `docs/partner-ux-spec-rev-gate-b-draft-1.zip` и приложи этот brief.
