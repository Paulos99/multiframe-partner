# Independent Gate B review — MultiFrame Партнёр

**Reviewed revision:** `rev-gate-b-draft-1`  
**Repository branch:** `cursor/partner-ux-spec-gate-b-chatgpt`  
**Source commit (before review):** `2631cb8c7dc53b1b76b517a1f7e844c9be48a3c1`  
**GitHub discussion:** [PR #78](https://github.com/Paulos99/multiframe-partner/pull/78)  
**Decision:** **Gate B NOT APPROVED**. Gate C, UI prototypes and product code are **not authorized**.

## Purpose and scope

This review is for the Cursor Agent maintaining the MultiFrame Партнёр UX specifications. It is **feedback**, not a change to approved Gate A architecture and not an instruction to edit application code.

I reviewed D5–D11, D4 screen-spec clusters, D3 screen inventory, and the assumption register from the published revision. The project direction is sound: one platform, `Project → Room`, separate commercial and installation processes, ceiling-company specialization, quick-entry, explicit calculation saving, Academy separated from sales telemetry. **Preserve these decisions.**

Below are blocking problems whose ambiguity can produce incorrect data, misleading analytics, or another overloaded UX.

## P0 — must resolve before Gate B approval

### GB-P0-01 · A paused customer must be able to resume the same Deal

**Evidence:** [D8 §3, S-com-01 / S-com-10 and §4 flowchart](./08-commercial-process.md); [D5 §1.3](./05-data-model-contracts.md); [D3 Deal state diagram](./03-information-architecture.md).

**Conflict:** `early_paused` is described as resumable (and has next action “Возобновить”), but D8’s flow routes `early_declined_или_paused → Deal_closed`. D5 prohibits reopening closed Deals.

**Required resolution:** define a distinct *nonterminal pause* and terminal decline. Resuming a paused consultation should not create a new deal or mutate an immutable closed deal. Specify state transitions and outcome/stage semantics, who resumes, which event is counted, and what happens to a scheduled follow-up. Synchronize D3/D5/D8/D11. Add a negative test for accidental close on pause.

### GB-P0-02 · A sent quote must never become proof of purchase during migration

**Evidence:** [D5 §4, step 3](./05-data-model-contracts.md).

**Conflict:** migration says `roomAssent` defaults for “rooms in latest sent quote → ordered” while other rooms become deferred when Deal accepted. “Sent” is *not* “accepted”; rooms listed in an offer are not necessarily ordered.

**Required resolution:** backfill `ordered` only from credible evidence of client acceptance **and** the accepted scope. When historical data cannot prove per-room consent, use an explicit unresolved state such as `unknown / needs_review` (or leave unset with well-specified UI handling), not a fabricated sale. Preserve raw history and require audit/reconciliation before using migrated amounts in conversion/KPI or the crew inbox. Supply migration fixtures: quote sent/no response, declined, accepted all, accepted partial, ambiguous legacy. Prove no false sales or installation assignments.

### GB-P0-03 · Do not use unqualified last-write-wins for calculation records

**Evidence:** [D5 §1.8 and assumptions A-12](./05-data-model-contracts.md), [D7 §4 S-calc-05 / §5](./07-calculator-ceiling.md), [E-calc-save](./04-screen-specs/e-calc-save.md).

**Risk:** field worker and manager can edit from different devices/offline. Last-write-wins with a warning *after overwriting* is insufficient; it can discard a more recent detailed scheme or quantities.

**Required resolution:** append-only calculation revisions; deterministic current revision selection; optimistic concurrency checks (`expectedRevision`/`ETag` or equivalent) and explicit 409/conflict handling for concurrent edits. Keep both variants recoverable, allow review/retry, do not overwrite immutable sent quote snapshots. Define sync idempotency for draft/bind and `Project+Room+Deal` create. Cover a two-device and reconnect test in D11. A solution different from the proposed mechanism is acceptable if it guarantees the same invariants.

### GB-P0-04 · Resolve implementation-defining assumptions explicitly

**Evidence:** [assumptions A-06, A-09, A-11](./assumptions.md); [D5 §3](./05-data-model-contracts.md); [D8 §3/§9](./08-commercial-process.md).

**Current ambiguity:**
- **A-06:** who and when closes a Deal after installation; accepted purchase versus fulfilled installation must remain distinct.
- **A-09:** when PM/Calc saves advance `Deal.stage` automatically vs manual; do not make telemetry dependent on undocumented guesses.
- **A-11:** atomic creation of Project+Room+Deal, especially under retry/offline and quick-entry bind.

**Required resolution:** propose one canonical rule per assumption with rationale, failure recovery, impact on UX and API, and executable AC. Put any true product trade-offs in a **short decision table for customer approval**; **do not label an assumption as user-approved**. Explain how deals without any quote and quick-entry drafts are represented. Ensure D3/D5/D6/D7/D8/D11 agree.

### GB-P0-05 · D4 screen specs are not yet sufficiently implementation-independent or complete

**Evidence:** [D4 index](./04-screen-specs/00-index.md), [E-home five roles](./04-screen-specs/e-home-roles.md), [D3 screen inventory](./03-information-architecture.md).

**Gap:** all five role homes fit in one thin document. Some named screens lack a dedicated or unambiguously traceable specification, including `E-quick-bind`, `E-room-docs`, `E-partner-card`, `E-analytics-training`, `E-staff` and organization/partner administration. A developer would still invent UX structure and behavior.

**Required resolution:**
1. Create a screen-coverage matrix with every `E-*` from D3: dedicated spec **or** explicit well-described subsection/merged route with rationale. Canonicalize aliases (`E-deal` vs `E-project-deal`, `E-install` vs `E-room-install`, `E-academy` vs `E-academy-hub`, etc.).
2. Expand the five home screens **separately by role**: task sorting/priority, what is shown in first viewport, primary CTA and exact destination, empty/loading/error/offline, what gets hidden, mobile behavior, handling of a first-time user and a returning expert.
3. Detail project/room/quote/bind cross-screen flows: fields and validation, data preview, confirm/cancel, contextual back navigation, stale data, and recovery. Specify who can change what, beyond visible buttons.
4. State UX text for high-stakes transitions (“saved locally” vs “saved on server”, “quote copied” vs “sent confirmed”, preliminary vs detailed).
5. Do **not** re-create a long vertical stack. A screen may link to a separate task-focused view rather than show every related module at once.

### GB-P0-06 · D11 must separately test human comprehension and successful task completion

**Evidence:** [D11](./11-acceptance-matrix.md) emphasizes data invariants and technical proof; [D4](./04-screen-specs/).

**Gap:** 35 core AC are useful but do not establish that a ceiling-company employee understands the interface. UX previously scored 1.73/5 with a deeply confusing ObjectsPanel.

**Required resolution:** add **independent UX usability acceptance** to D11 with observable tasks for each role, tested on the future Gate C interactive prototype without explanation:
- sales: start a new inquiry, obtain preliminary estimate, persist into the right room, create/share/confirm quote;
- measurer: find assigned room, create detailed calculation, save and return;
- crew: find own assignment, read scheme/checklist, report blocker;
- owner: find what needs intervention, assign responsibility;
- StP admin: locate the partner’s actual stalled stage, initiate support.
Record first-click success, blocking confusion, re-entry of data, clarity of next step, recovery behavior, device size, and user comments. No UI task is “done” just because a route renders or a user eventually finds a buried button. Distinguish Gate B **specified tests** from Gate C/E **observed results**.

## P1 — substantive improvements before the interactive prototype

### GB-P1-01 · Academy should contain one truly complete training example

**Evidence:** [D9 §4 N0–N3](./09-academy.md).

The sales trainer has learning objectives, rubric, characters, and a branching outline. It is **not** yet a dialogue script. Define one fully scripted example with concrete client and player utterances, at least three distinct end-to-end trajectories (successful / partial / poor), state changes, score calculation and tailored feedback citing what happened. Define how the chat behaves for free text (if supported), wrong answer, retry, accessibility, and pause. Do not equate “message bubbles around multiple-choice buttons” with a conversational simulator. Keep `context: training` isolated from work KPIs.

### GB-P1-02 · StP analytics needs a clear observational denominator

**Evidence:** [D10 §3.3 and §3.4](./10-stp-support-analytics.md), [D6 quick-entry](./06-probleмомер-ceiling.md), [ADR-007](./adr/007-quick-entry-without-full-client-card.md).

`multiframe_offered / consultation_started` only measures sessions captured in this application. Quick-entry can finish without a persisted Deal, and many offline/real-world consultations might never be logged. Specify identifiers and event lifecycle for unsaved sessions and explicit exclusion rules for demo/training; don't imply that all company consultations or actual sales are observable. Display denominator, sample size and coverage/measurement warning. An early loss before Quote must still be representable without fabricating a sale.

## Evidence and cross-document quality

Before presenting the next revision, apply these exact reconciliation checks:

| Topic | Must agree across |
|---|---|
| Pause/resume vs immutable closed Deal | D3, D5, D8, D11 |
| Legacy quote `sent` vs accepted scope | D5 migration, D8, D10, D11 |
| Preliminary/detailed revisions + offline conflicts | D4 calc-save, D5, D7, D11 |
| Create and stage rules | D2, D3, D4, D5, D6, D7, D8 |
| D3 screen names and coverage | D3, D4 index/all screen specs, D11 |
| Academy scenario outcomes and KPI exclusion | D9, D10, D11 |
| Consultation-denominator observability | D6, D8, D10 |

## Required handoff from Cursor Agent

Create a **new revision `rev-gate-b-draft-2`** (retain draft-1 history) with:

1. Updated affected specs and ADR **only where a new architecture decision genuinely requires one**.
2. A concise `gate-b-changelog-draft-1-to-2.md` listing finding ID → before → after → affected files → validation proof.
3. A refreshed, explicitly categorized assumptions register: **resolved/approved**, **proposed awaiting owner**, **deferred and nonblocking**. Do not silently adopt assumptions.
4. Screen coverage matrix, role-specific behavior, and cross-document links.
5. Expanded D11 containing the new human usability test criteria.
6. Self-review **with evidence** of contradictions addressed (not a list of “PASS” assertions).
7. Reply on [PR #78](https://github.com/Paulos99/multiframe-partner/pull/78) with the new commit/revision, summary, unresolved decisions, and links.

**Hard stop:** Do not begin Gate C, generate HTML prototypes, edit `apps/web` or `apps/api`, merge this PR, or mark Gate B approved without the owner’s explicit permission.

The review is intended to improve completeness and coherence, **not** to increase document count artificially. Preserve the solid core of Gate A and already-correct sections.
