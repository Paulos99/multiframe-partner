# Gate B — резюме для заказчика

**Revision:** `rev-gate-b-draft-2`  
**Дата:** 2026-10-22  
**После:** Gate A `rev-gate-a-approved-20261022` (условно, ADR-008)  
**Статус:** черновик Gate B · **NOT approved**. **Gate C и код не начаты.**  
**Ответ на:** [CHATGPT_GATE_B_REVIEW_2026-10-22.md](./CHATGPT_GATE_B_REVIEW_2026-10-22.md)

---

## 1. Что сделано в draft-2

Исправлены все P0 (GB-P0-01…06) и P1 (GB-P1-01…02) по замечаниям независимого ревью. Детали: [gate-b-changelog-draft-1-to-2.md](./gate-b-changelog-draft-1-to-2.md).

| Блок | Суть draft-2 |
|------|----------------|
| **D4** | Role homes; E-quick-bind, room-docs, partner-card, analytics-training, staff, org; [coverage matrix](./gate-b-screen-coverage-matrix.md) |
| **D5** | Pause nonterminal; migration sent≠ordered; append-only calc + 409; A-06/09/11 proposals + AC |
| **D7/D8** | Concurrency; pause/resume flowchart fixed |
| **D9** | Full scripted sell_multiframe example (3 trajectories) |
| **D10** | Observational denominator + coverage warning |
| **D11** | + migration/pause/concurrency AC; **§7 UX usability** per role |

---

## 2. Неизменные решения Gate A

Project→Rooms; Deal≠room; sequential dealId; Quote sent immutable; ADR-008 — **сохранены**.

---

## 3. Нужны решения владельца (не approved)

Таблица: [gate-b-decisions-for-owner.md](./gate-b-decisions-for-owner.md)  
Ключевые: A-06 close policy, A-09 stage hybrid, A-11 atomic create, confirm A-12 (no LWW), pause canon, migration assent.

---

## 4. Просьба

1. Ревью draft-2 (ChatGPT / заказчик) по changelog.  
2. Отметить OK/правки по owner decisions — **молчание ≠ согласование**.  
3. Gate C / код — только после явного OK на Gate B.

Ссылки: [README](./README.md) · [self-review](./gate-b-self-review.md) · PR #78
