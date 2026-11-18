# Changelog: rev-gate-b-draft-2 → rev-gate-b-final-candidate

**Status:** Gate B **NOT approved**. Responds to ChatGPT re-review on SHA `347b392` (findings C1–C4).  
**No** Gate C / product code / merge.

| Finding | Before (draft-2) | After (final-candidate) | Files | Proof |
|---------|------------------|-------------------------|-------|-------|
| **C1** | D5 §2.1 migration «default ordered для rooms в quote»; schema enum 3 values vs §1.3 five | Evidence-only backfill; enum `ordered\|deferred\|out_of_scope\|unknown\|needs_review` synced in §1 tree + §2.1 | D5 | Grep: no «default ordered» for quote rooms |
| **C2** | `early_loss_cluster` = declined **and** paused; D8 flowchart `ED → P` (install close node) | Loss signal = terminal only; `paused_followup` separate; flowchart splits commercial close vs A-06 install close | D10 §3.1/§3.4, D8 §4, D11 AC-EL-02 | AC-D10-11/13 |
| **C3** | Anna script sketch with ellipsis paths / score bands | Full 3 paths with utterances, 7 rubric numbers, computed scores 88/71/11, per-path feedback | D9 §4.2.1 | AC-D9-08 |
| **C4** | Denominator without stable session id / dedupe | `consultationSessionId` + dedupe; multi tool-open → +1; AC-D10-12; coverage warning kept | D10 §3.3 | AC-D10-09/12 |

## Owner decisions

Unchanged: still **proposed** in [gate-b-decisions-for-owner.md](./gate-b-decisions-for-owner.md). Silence ≠ approval. ChatGPT recommends accepting A-06/A-09/A-11/A-12/pause/migration — as **expert recommendation only**.

## Gate A

Preserved. No new architecture gates.
