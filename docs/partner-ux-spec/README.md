# MultiFrame Партнёр — пакет спецификаций

**Пакет Gate B:** `rev-gate-b-draft-1`  
**Gate A:** согласован **условно** · снимок [`revisions/rev-gate-a-approved-20261022/`](./revisions/rev-gate-a-approved-20261022/) · SHA `953be7ed7ddc1bddd1a2c0834ccee6cdeec47fbf`  
**Сегмент:** потолочные компании  
**Код:** gap-анализ readonly; продуктовый код **не менялся** · Gate C **не начат**

## Независимое ревью (ChatGPT / внешний эксперт)

1. Открой **[CHATGPT_REVIEW_BRIEF.md](./CHATGPT_REVIEW_BRIEF.md)** — роль, порядок чтения, вопросы, стартовый промпт.  
2. Либо скачай ZIP из репозитория: [`docs/partner-ux-spec-rev-gate-b-draft-1.zip`](../partner-ux-spec-rev-gate-b-draft-1.zip).  
3. Репозиторий публичный: https://github.com/Paulos99/multiframe-partner · каталог `docs/partner-ux-spec/`.

Манифест файлов пакета: [MANIFEST.md](./MANIFEST.md).

---

## Статусы гейтов

| Gate | Статус | Revision |
|------|--------|----------|
| **A** | Согласован условно (3 правки ADR-008) | `rev-gate-a-approved-20261022` |
| **B** | Черновик на ревью заказчика | `rev-gate-b-draft-1` |
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
| D3 | [03-information-architecture.md](./03-information-architecture.md) | IA + state diagrams | A |
| D4 | [04-screen-specs/](./04-screen-specs/) | Screen specs по экранам | B draft |
| D5 | [05-data-model-contracts.md](./05-data-model-contracts.md) | Модель, gaps, миграции | B draft |
| D6 | [06-probleмомер-ceiling.md](./06-probleмомер-ceiling.md) | PM потолочники | B draft |
| D7 | [07-calculator-ceiling.md](./07-calculator-ceiling.md) | Calc потолочники | B draft |
| D8 | [08-commercial-process.md](./08-commercial-process.md) | Коммерческий путь | B draft |
| D9 | [09-academy.md](./09-academy.md) | Академия | B draft |
| D10 | [10-stp-support-analytics.md](./10-stp-support-analytics.md) | StP + аналитика | B draft |
| D11 | [11-acceptance-matrix.md](./11-acceptance-matrix.md) | Матрица приёмки | B draft |
| ADR | [adr/](./adr/) | 001–008 | Accepted |
| Assumptions | [assumptions.md](./assumptions.md) | Все Assumption | B |
| Review B | [gate-b-review.md](./gate-b-review.md) | Резюме для заказчика | B |
| Self-review | [gate-b-self-review.md](./gate-b-self-review.md) | 10 пунктов | B |
| Handoff | [gate-b-handoff-report.md](./gate-b-handoff-report.md) | Итог координатору | B |

Changelog A: [final-candidate→approved](./gate-a-changelog-final-candidate-to-approved.md).

---

## Как читать

1. Gate A review + ADR-008 (идентичность Deal/Quote/Project).  
2. Gate B review → нужный D4–D11.  
3. Перед реализацией — D11 AC + D5 инварианты.  
4. Gate C / код — только после явного OK заказчика на Gate B.
