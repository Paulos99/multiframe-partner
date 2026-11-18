# Gate C — независимое ревью интерактивных прототипов MultiFrame Партнёр

**Дата:** 2026-10-23  
**Base prototype SHA:** `3ad2502bcb687d531596b51a95f03a97ff04d27f` (Gate C files inspected in PR #78; later status-only docs commits are not product evidence)  
**Owner-approved Gate B:** `rev-gate-b-final-candidate`; [owner approval](../partner-ux-spec/gate-b-owner-approval-2026-10-23.md)  
**Decision:** **Gate C NOT APPROVED — needs fixes**. **Gate D / product code / merge/deploy NOT authorized.**

## Evidence basis and limitation

I independently read the source files `assets/views.js`, `assets/store.js`, `assets/app.js`, `assets/proto.css`, `README.md`, `TEST_CHECKLIST.md`, and `SMOKE_TEST.md`. The agent reports **18/18 store smoke** and clickable paths; this is useful engineering evidence. I did **not** observe a rendered browser session or human usability test in this review. Screenshots in `SMOKE_TEST.md` refer to `/opt/cursor/artifacts/screenshots/`, not inspectable files in this PR; checklists contain no filled-in observations. Do not interpret code review as visual or human UX approval.

**Gate C is a simulation**, so it need not compute real certified acoustics or write production data. However, controls and user journeys central to Gate B must be interactive and faithfully express the product decision; static status labels and one-click shortcuts cannot substitute for those journeys.

## P0 — blockers to acceptance

### GC-P0-01 · PM does not demonstrate the needs-forming consultation

**Proof:** [views.js L273–292](https://github.com/Paulos99/multiframe-partner/blob/3ad2502bcb687d531596b51a95f03a97ff04d27f/docs/partner-ux-prototypes/assets/views.js#L273-L292), [store.js L313–349](https://github.com/Paulos99/multiframe-partner/blob/3ad2502bcb687d531596b51a95f03a97ff04d27f/docs/partner-ux-prototypes/assets/store.js#L313-L349), [Gate B D6](../partner-ux-spec/06-probleмомер-ceiling.md).

The quick-entry field `Что беспокоит` is pre-filled with **«соседи сверху»**, and the PM screen renders only **two static lines** about impact noise and a Comfort recommendation; no guided room interview, Result chain `norms → current → with MultiFrame → difference → next step`, or client-awareness journey. It bypasses the core product promise for clients who *did not know* they needed sound insulation.

**Required:** simulate a short but real questionnaire with optional/unknown noise answers and stretch-ceiling implicit preset, changing demo evidence/results for at least 2 contrasting clients (no complaint vs known noise); include comparison, qualified claims and meaningful next-step CTA. The formulas may be fixture-based, but result must change based on inputs and never promise guaranteed dB.

### GC-P0-02 · Save/bind omits PM-only and existing-room paths

**Proof:** [views.js L316–346](https://github.com/Paulos99/multiframe-partner/blob/3ad2502bcb687d531596b51a95f03a97ff04d27f/docs/partner-ux-prototypes/assets/views.js#L316-L346), [store.js L358–420](https://github.com/Paulos99/multiframe-partner/blob/3ad2502bcb687d531596b51a95f03a97ff04d27f/docs/partner-ux-prototypes/assets/store.js#L358-L420); D6 S-pm-01/02, D4 E-quick-bind.

`salesBind` refuses to persist until `calcDone` and only shows **create new project**, while Gate B explicitly allows **saving PM profile without calculator** and **pick existing Project+Room OR create new**. Quick-entry result is therefore forcibly converted into a calculated sale, and a repeat consultation for an existing client makes a duplicate project.

**Required:** separate save acoustic profile, save preliminary, save detailed; quick-bind pick existing project/room **or** create new. Demonstrate that a PM-only result can be saved to an existing or new room, preserving `projectId/roomId`; no orphan/duplicate. When project/room known, save directly without binding again.

### GC-P0-03 · Partial assent is not modeled; click «Принято» fabricates ordered rooms

**Proof:** [store.js L528–549](https://github.com/Paulos99/multiframe-partner/blob/3ad2502bcb687d531596b51a95f03a97ff04d27f/docs/partner-ux-prototypes/assets/store.js#L528-L549), [views.js L483–503](https://github.com/Paulos99/multiframe-partner/blob/3ad2502bcb687d531596b51a95f03a97ff04d27f/docs/partner-ux-prototypes/assets/views.js#L483-L503); approved Gate B D8 S-com-07, M-assent.

Click `Принято` sets `roomAssent=ordered` for **every room with any calculation**, with no visible selection of rooms or scope, no deferred/out_of_scope choice, and no explicit confirmation of client consent. This violates the accepted per-room assent model; it can send undesired rooms toward install.

**Required:** an interactive accepted-outcome sheet listing quote rooms and their `ordered/deferred/out_of_scope` decisions; validate ≥1 ordered, compute accepted amount from ordered scope only, and show only ordered + tech-ready to crew. Include a **3-room partial sale** fixture and demonstrate new sequential Deal after old close, keeping original sent Quote and dealId immutable. Do not auto-order rooms from presence of a calculation or a sent quote.

### GC-P0-04 · Detailed calculation does not let a measurer do detailed work

**Proof:** [views.js L785–804](https://github.com/Paulos99/multiframe-partner/blob/3ad2502bcb687d531596b51a95f03a97ff04d27f/docs/partner-ux-prototypes/assets/views.js#L785-L804), [store.js L423–440](https://github.com/Paulos99/multiframe-partner/blob/3ad2502bcb687d531596b51a95f03a97ff04d27f/docs/partner-ux-prototypes/assets/store.js#L423-L440); Gate B D7; D11 AC-UX-M02.

Detailed view only displays `areaM2 × 3550` and a Save button, without room geometry, layout, sample scheme, quantities/BOM, or meaningful inputs. Saving toggles `schemeOk=true` without any represented scheme. This may satisfy a path smoke test but cannot test whether a measurer understands the **detailed** job.

**Required:** lightweight simulated geometry (e.g. room dimensions, cutouts/obstructions), visual layout/diagram and material list with editable inputs and a distinct save of the detailed revision; show prelim ≠ detailed and persistence when reopening. **No need for a production-grade layout solver** in Gate C.

### GC-P0-05 · Crew inbox and checklist gate do not reflect core assignment/safety invariants

**Proof:** [store.js L695–705](https://github.com/Paulos99/multiframe-partner/blob/3ad2502bcb687d531596b51a95f03a97ff04d27f/docs/partner-ux-prototypes/assets/store.js#L695-L705), [store.js L601–612](https://github.com/Paulos99/multiframe-partner/blob/3ad2502bcb687d531596b51a95f03a97ff04d27f/docs/partner-ux-prototypes/assets/store.js#L601-L612), [views.js L807–907](https://github.com/Paulos99/multiframe-partner/blob/3ad2502bcb687d531596b51a95f03a97ff04d27f/docs/partner-ux-prototypes/assets/views.js#L807-L907); D11 AC-UX-C01/02 and AC-CL-01.

`crewInbox()` filters only `ordered && techReady && !closed`, **not** `assigneeCrew === current crew`. Thus «Мои задания» can show a different crew member's installation. `tryCloseInstall()` accepts `installChecklist || []`: an *absent/empty checklist* has zero incomplete items, so closure succeeds, although the checklist is mandatory.

**Required:** filter by current crew assignment; forbid room close when checklist missing/empty (unless later separately owner-approved waiver policy). Show meaningful error/recovery UI. Test wrong assignee and empty-checklist fixtures, in addition to deferred/no-tech-ready.

### GC-P0-06 · Academy scores by ending, not by actual dialogue path

**Proof:** [views.js L577–690](https://github.com/Paulos99/multiframe-partner/blob/3ad2502bcb687d531596b51a95f03a97ff04d27f/docs/partner-ux-prototypes/assets/views.js#L577-L690), [app.js L317–329](https://github.com/Paulos99/multiframe-partner/blob/3ad2502bcb687d531596b51a95f03a97ff04d27f/docs/partner-ux-prototypes/assets/app.js#L317-L329); Gate B D9 Anna successful/partial/poor score fixtures.

`OfferOk` always has hard-coded `score:88`. Therefore the **partial path** `P0c → PTfix → P1c → P2b_fix → P2a` also gets **88**, whereas approved Anna script specifies **71**, with different feedback. This means the current interactive trainer cannot test evaluation and meaningful feedback. The screen even exposes the successful answer sequence in its subtitle.

**Required:** store actions/flags per attempt and calculate/explain path-dependent rubric/score for at least three complete Anna fixtures **88/71/11**; feedback should reference actual choices and allow retry. Hide the answer-key path from trainee. Keep training separate from any Deal/sales KPI.

## P1 — UX and coverage gaps

### GC-P1-01 · Mobile is horizontal desktop navigation, not a mobile workflow

**Proof:** [proto.css media `max-width:820px`](https://github.com/Paulos99/multiframe-partner/blob/3ad2502bcb687d531596b51a95f03a97ff04d27f/docs/partner-ux-prototypes/assets/proto.css) and [views.js chrome/nav](https://github.com/Paulos99/multiframe-partner/blob/3ad2502bcb687d531596b51a95f03a97ff04d27f/docs/partner-ux-prototypes/assets/views.js#L62-L125).

On narrow screens, desktop nav becomes a horizontally scrolling row. Gate B E-nav calls for **3–4 primary bottom tabs + overflow**, especially for mobile-first measurer/crew. Provide actual role-focused mobile navigation, fixed primary action where appropriate, no horizontal hiding of key functions, 360/390px and 768px view checks.

### GC-P1-02 · UI states and offline recovery are insufficiently demonstrable

**Proof:** [README states](https://github.com/Paulos99/multiframe-partner/blob/3ad2502bcb687d531596b51a95f03a97ff04d27f/docs/partner-ux-prototypes/README.md), [SMOKE_TEST residual](https://github.com/Paulos99/multiframe-partner/blob/3ad2502bcb687d531596b51a95f03a97ff04d27f/docs/partner-ux-prototypes/SMOKE_TEST.md), [views.js `loadingView`](https://github.com/Paulos99/multiframe-partner/blob/3ad2502bcb687d531596b51a95f03a97ff04d27f/docs/partner-ux-prototypes/assets/views.js#L1193-L1205). The loading skeleton exists but is not wired to normal transitions. Offline simply disables bind/create; Gate B permits recoverable offline drafts/outbox. There is no interactive two-device **409** conflict simulation.

Provide controllable demo fixtures/toggle for loading, retryable error, local pending save/reconnect, and calc 409 conflict compare-and-keep-both. Use simulation, not real sync. Explain what is saved locally and what is server-confirmed.

### GC-P1-03 · Owner staff and StP verify should be genuine task simulations

**Proof:** [views.js L1031–1044](https://github.com/Paulos99/multiframe-partner/blob/3ad2502bcb687d531596b51a95f03a97ff04d27f/docs/partner-ux-prototypes/assets/views.js#L1031-L1044) staff screen is a static roster; Gate B E-staff promises owner create/reset, one-time credentials. [views.js L1089–1165](https://github.com/Paulos99/multiframe-partner/blob/3ad2502bcb687d531596b51a95f03a97ff04d27f/docs/partner-ux-prototypes/assets/views.js#L1089-L1165) admin can press “Adopted” without any baseline, post period, or evidence.

Prototype owner staff creation/reset (one-time credentials) and an admin verify panel showing demo **before vs after** adoption, explicitly separate from conversion/outcome, instead of pure status buttons.

### GC-P1-04 · Copy/PDF are toast-only

**Proof:** [store.js L462–470](https://github.com/Paulos99/multiframe-partner/blob/3ad2502bcb687d531596b51a95f03a97ff04d27f/docs/partner-ux-prototypes/assets/store.js#L462-L470), [app.js L266–270](https://github.com/Paulos99/multiframe-partner/blob/3ad2502bcb687d531596b51a95f03a97ff04d27f/docs/partner-ux-prototypes/assets/app.js#L266-L270).

Both actions just emit a demo event and toast, no clipboard text or downloadable mock PDF; for UX task AC-UX-S03 actual affordance cannot be evaluated. Implement a browser clipboard copy or displayed share preview, and a lightweight printable/downloadable mock quote (no production API). Keep `copy/PDF ≠ sent`.

### GC-P1-05 · No recorded human UX evidence or inspectable visual artifacts in PR

**Proof:** [TEST_CHECKLIST.md](https://github.com/Paulos99/multiframe-partner/blob/3ad2502bcb687d531596b51a95f03a97ff04d27f/docs/partner-ux-prototypes/TEST_CHECKLIST.md) unfilled; [SMOKE_TEST.md](https://github.com/Paulos99/multiframe-partner/blob/3ad2502bcb687d531596b51a95f03a97ff04d27f/docs/partner-ux-prototypes/SMOKE_TEST.md) explicitly technical smoke; screenshot paths external to PR.

Run at least a representative **unassisted user walkthrough** for all 12 D11 §7 tasks on desktop and mobile, collect first-click, confusion, repeated data entry, clarity, recovery and comments as specified; do not invent respondents or test outcomes. Commit browser screenshots or a short visual walkthrough into accessible GitHub artifacts (or link to a real published preview) so the reviewer can assess layout and responsive behavior. Agent-only screenshot/test is valuable but cannot replace human usability evidence.

### GC-P1-06 · PR metadata still describes obsolete Gate B permission state

The [PR #78 description](https://github.com/Paulos99/multiframe-partner/pull/78) still says owner approval pending, Gate C forbidden, although [official owner approval](../partner-ux-spec/gate-b-owner-approval-2026-10-23.md) has been committed and Gate C files exist. Update PR description/title to reflect **Gate B approved, Gate C in review**; do not merge.

## Required next deliverable

1. Fix **GC-P0-01…06** with real clickable behaviors, not assertions in README.
2. Improve P1 essential mobile, recovery and inspectable evidence; distinguish implementation simulation vs production.
3. Update D11 mapping and `TEST_CHECKLIST.md` with exact steps/repro fixtures and **honest** observed/not observed status. Agent smoke passing is not UX PASS.
4. Commit `rev-gate-c-draft-2` under `docs/partner-ux-prototypes/` with changelog finding → exact changed behavior → route → test.
5. Leave Gate B frozen, Gate D and product code prohibited, no merge/deploy.
6. Reply in [PR #78](https://github.com/Paulos99/multiframe-partner/pull/78) with new SHA, path/URL to test, screenshots/review artifacts and remaining limitations.

**Gate C final approval requires functioning, testable critical paths and user comprehension evidence.** This review is intentionally a rejection of *current prototype completeness*, not of the approved product architecture.
