# Changelog: rev-gate-b-draft-1 → rev-gate-b-draft-2

**Status:** Gate B **NOT approved**. Gate C / product code **not started**.  
**Source review:** [CHATGPT_GATE_B_REVIEW_2026-10-22.md](./CHATGPT_GATE_B_REVIEW_2026-10-22.md)

| Finding | Before (draft-1) | After (draft-2) | Why | Files | Validation proof |
|---------|------------------|-----------------|-----|-------|------------------|
| **GB-P0-01** | D8 flowchart `early_declined_или_paused → Deal_closed`; pause looked terminal | `early_paused` = **nonterminal** (Deal active); `early_declined` = **terminal closed**; resume = **same dealId**; separate CTAs | Avoid accidental close / new deal on pause | D3 §5.5, D5 §1.3, D8 §1/§3/§4, D11 AC-EL-04/05, e-quote-deal | AC-D5-10, AC-D8-13/14, AC-EL-04 |
| **GB-P0-02** | Migration: rooms in latest **sent** quote → `ordered` | `sent ≠ ordered`; evidence-only ordered; else `unknown` / `needs_review`; fixtures M-F1…5; exclude from KPI amount & crew inbox | No false sales / install | D5 §4, D8 roomAssent, D11 AC-MG-01…03 | Migration fixtures + AC-D5-07/08 |
| **GB-P0-03** | Offline calc: LWW + warning after overwrite | **Append-only** CalculationRevision + `expectedRevision`/ETag → **409**; both recoverable; sent Quote never overwritten | Field+manager multi-device | D5 §1.8, D7 S-calc-05, e-calc-save, A-12 superseded, D11 AC-OF-05 | AC-D5-09, AC-D7-12/13, AC-CS-05 |
| **GB-P0-04** | A-06/A-09/A-11 vague assumptions | One **canonical proposal** each + rationale + recovery + executable AC; owner table; **not** labeled approved | Implementation-defining clarity | D5 §3.1, assumptions.md, [gate-b-decisions-for-owner.md](./gate-b-decisions-for-owner.md) | AC-A06/A09/A11-* |
| **GB-P0-05** | Thin single home doc; missing E-quick-bind, room-docs, partner-card, analytics-training, staff, org | Coverage matrix; 5 role homes; dedicated/merged specs + aliases | Implementation-independent UX | [gate-b-screen-coverage-matrix.md](./gate-b-screen-coverage-matrix.md), `04-screen-specs/*` | Matrix covers all D3 E-* |
| **GB-P0-06** | D11 = data/RBAC only | Independent **UX usability** tasks per role; Gate B=specified, Gate C=observed | UX 1.73/5 history; comprehension ≠ route render | D11 §7 AC-UX-* | Protocol + 12 role tasks |
| **GB-P1-01** | Sales trainer = outline only | Full scripted example: utterances, 3 trajectories, score, feedback, free-text/retry/pause/a11y | Conversational simulator | D9 §4.2.1, AC-D9-08/09 | Script table |
| **GB-P1-02** | Offer rate without denominator caveat | Observational denominator = app-logged work sessions; coverage warning; exclude training/demo; early loss without fabricated sale | Honest analytics | D10 §3.3, AC-D10-09…11, A-36 | UI fields specified |

## Self-review contradictions (evidence)

| Topic | Agree across | Evidence |
|-------|--------------|----------|
| Pause vs closed | D3, D5, D8, D11 | Nonterminal pause; flowchart no longer merges pause→closed |
| Sent vs ordered | D5 migration, D8, D10, D11 | unknown/needs_review; crew exclude |
| Calc concurrency | D4 calc-save, D5, D7, D11 | 409 + append-only; LWW removed |
| Create/stage rules | D5 §3.1, D6/D7/D8 assumptions aligned to A-09/A-11 proposals | Owner decisions table |
| Screen names | D3, D4 index, coverage matrix, D11 | Aliases documented |
| Academy / KPI | D9, D10, D11 | context training; script isolation |
| Consultation denominator | D6 ref, D8 early loss, D10 | coverage warning |

## Explicit non-claims

- Gate B **not** approved.  
- Assumptions A-06/A-09/A-11/A-12/pause/migration = **proposed**, awaiting owner.  
- No Gate C, no `apps/*` / `packages/*` edits.
