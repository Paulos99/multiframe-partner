# Gate B — решения, требующие утверждения владельца

**Revision:** `rev-gate-b-final-candidate` · **APPROVED владельцем 2026-10-23**  
**Owner (2026-10-23):** явным согласием утвердил A-06 / A-09 / A-11 / A-12 / Pause / M-assent вместе с Gate B; Gate C разрешён только для изолированных прототипов. [Официальная запись утверждения](./gate-b-owner-approval-2026-10-23.md).  
**Правило:** шесть перечисленных выше решений **approved**; остальные — только proposal/deferred. Gate A / ADR-008 остаётся в силе.

| ID | Тема | Proposal (канон в спеках) | Альтернатива | Влияние | Статус решения |
|----|------|---------------------------|--------------|---------|-----------|
| A-06 | Закрытие Deal после монтажа | Sales/owner **явно** закрывает; нет авто из `room.closed`; accepted ≠ install done | Авто-close когда все ordered rooms closed | KPI «закрытые сделки» vs операционка | **approved 2026-10-23** |
| A-09 | Advance `Deal.stage` | Hybrid: auto ≥ assessed/calculated/quote_sent_confirmed; outcome/pause/decline только вручную | Только ручной stage | Telemetry / inbox | **approved 2026-10-23** |
| A-11 | Create Project+Room+Deal | Atomic + Idempotency-Key; draft без bind ≠ Deal | Сначала Project, Deal отдельно | Offline/retry duplicates | **approved 2026-10-23** |
| A-12 | Conflict calc | Append-only revisions + optimistic concurrency (409); **не** LWW | LWW + warning (отвергнуто ревью) | Потеря схем field/manager | **approved 2026-10-23** |
| A-07 | confirm_sent без канала | Warning, не hard-block, если sentComment | Hard-block без phone/channel | UX полевых продаж | желательно |
| A-05 | Waive checklist | Только owner + reason | Запрет waive | Монтаж edge cases | желательно |
| A-01 | Inbox size | ≤8 next actions | Другой N | Home density | нет (мелочь) |
| A-14 | Calc history depth | ≥5 save или 30 дней | Другой порог | Storage | нет |
| A-28 | StP signal thresholds | 28д / N≥5 / stall 40% / … | Калибровка пилота | Сигналы admin | пилот |
| M-assent | Migration roomAssent | sent ≠ ordered; unknown/needs_review без evidence | (запрещено) auto-ordered from sent | False sales / crew inbox | **approved 2026-10-23** |
| Pause | early_paused | Nonterminal; resume same dealId | (запрещено) pause→closed | Данные / UX | **approved 2026-10-23** |

**Owner OK получен на шесть решений** (A-06, A-09, A-11, A-12, M-assent, Pause). A-05/A-07 остаются на отдельное согласование до соответствующей реализации, A-28 — на пилот. См. [owner approval](./gate-b-owner-approval-2026-10-23.md).
