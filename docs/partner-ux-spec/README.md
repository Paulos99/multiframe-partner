# MultiFrame Партнёр — пакет спецификаций

**Пакет Gate B:** `rev-gate-b-draft-2` · **status: NOT approved**  
**Gate A:** согласован **условно** · снимок [`revisions/rev-gate-a-approved-20261022/`](./revisions/rev-gate-a-approved-20261022/) · SHA `953be7ed7ddc1bddd1a2c0834ccee6cdeec47fbf`  
**Сегмент:** потолочные компании  
**Код:** gap-анализ readonly; продуктовый код **не менялся** · Gate C **не начат**

## Независимое ревью (ChatGPT / внешний эксперт)

1. Открой **[CHATGPT_REVIEW_BRIEF.md](./CHATGPT_REVIEW_BRIEF.md)** — роль, порядок чтения, вопросы.  
2. Ревью draft-1: **[CHATGPT_GATE_B_REVIEW_2026-10-22.md](./CHATGPT_GATE_B_REVIEW_2026-10-22.md)** (Gate B **NOT APPROVED**).  
3. Ответ draft-2: [gate-b-changelog-draft-1-to-2.md](./gate-b-changelog-draft-1-to-2.md) · [gate-b-decisions-for-owner.md](./gate-b-decisions-for-owner.md) · [gate-b-screen-coverage-matrix.md](./gate-b-screen-coverage-matrix.md).  
4. Канон публикации: GitHub `docs/partner-ux-spec/` (не ZIP как SoT).  
5. Репозиторий: https://github.com/Paulos99/multiframe-partner · PR #78.

Манифест: [MANIFEST.md](./MANIFEST.md).

---

## Статусы гейтов

| Gate | Статус | Revision |
|------|--------|----------|
| **A** | Согласован условно (3 правки ADR-008) | `rev-gate-a-approved-20261022` |
| **B** | Черновик draft-2 · **NOT approved** · ждёт ревью | `rev-gate-b-draft-2` |
| **C** | Не начат (запрещён) | — |
| Код / Gate D+ | Не начат | — |

---

## Оглавление D0–D11

| ID | Файл | Содержание | Статус |
|----|------|------------|--------|
| Review A | [gate-a-review.md](./gate-a-review.md) | Резюме Gate A + §8 | approved |
| D0 | [project-context.md](./project-context.md) | Цель, сегмент, P0-разрывы | A |
| D1 | [01-product-architecture.md](./01-product-architecture.md) | Границы, домены, SoT | A |
| D2 | [02-role-scenarios.md](./02-role-scenarios.md) | Сценарии 5 ролей | A |
| D2a | [02a-responsibility-matrix.md](./02a-responsibility-matrix.md) | RACI / handoff | A |
| D3 | [03-information-architecture.md](./03-information-architecture.md) | IA + state diagrams (+ B sync notes) | A + B sync |
| D4 | [04-screen-specs/](./04-screen-specs/) | Screen specs + coverage | B draft-2 |
| D5 | [05-data-model-contracts.md](./05-data-model-contracts.md) | Модель, gaps, миграции | B draft-2 |
| D6 | [06-probleмомер-ceiling.md](./06-probleмомер-ceiling.md) | PM потолочники | B draft |
| D7 | [07-calculator-ceiling.md](./07-calculator-ceiling.md) | Calc потолочники | B draft-2 |
| D8 | [08-commercial-process.md](./08-commercial-process.md) | Коммерческий путь | B draft-2 |
| D9 | [09-academy.md](./09-academy.md) | Академия | B draft-2 |
| D10 | [10-stp-support-analytics.md](./10-stp-support-analytics.md) | StP + аналитика | B draft-2 |
| D11 | [11-acceptance-matrix.md](./11-acceptance-matrix.md) | Приёмка + UX usability | B draft-2 |
| ADR | [adr/](./adr/) | 001–008 | Accepted |
| Assumptions | [assumptions.md](./assumptions.md) | Categorized; not silently approved | B draft-2 |
| Decisions | [gate-b-decisions-for-owner.md](./gate-b-decisions-for-owner.md) | Owner OK table | B draft-2 |
| Coverage | [gate-b-screen-coverage-matrix.md](./gate-b-screen-coverage-matrix.md) | E-* → D4 | B draft-2 |
| Changelog B | [gate-b-changelog-draft-1-to-2.md](./gate-b-changelog-draft-1-to-2.md) | GB-* → fixes | B draft-2 |
| Review B | [gate-b-review.md](./gate-b-review.md) | Резюме | B draft-2 |
| Self-review | [gate-b-self-review.md](./gate-b-self-review.md) | Evidence | B draft-2 |

---

## Как читать

1. Gate A review + ADR-008.  
2. ChatGPT Gate B review → changelog draft-1→2 → D4–D11.  
3. Owner decisions table — **не** считать approved.  
4. Перед реализацией — D11 AC + D5 инварианты.  
5. Gate C / код — только после явного OK заказчика на Gate B.
