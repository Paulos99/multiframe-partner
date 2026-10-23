# Gate C smoke — `rev-gate-c-draft-3`

**Не user testing.** Store VM checks below + prior draft-2 screenshots in [`media/`](./media/).

| | |
|--|--|
| Against review | PR comment GC2-P0-01…04 on `eefc726` |
| Store smoke (GC2) | **19/19 PASS** |
| Verdict | GC2-P0 clickable behaviors implemented; Gate C still needs human UX evidence |

## GC2-P0 / P1 checks (store)

| ID | Result |
|----|--------|
| P0-01 area 21 → estimate 71400 (not 12×) | PASS |
| P0-04 prelim bind keeps acousticProfile | PASS |
| P0-03 empty assent → `assent_incomplete`, no mutate | PASS |
| P0-03 no ordered → `need_one_ordered`, no mutate | PASS |
| P0-03 bedroom-only ordered | PASS |
| P0-02 close blocked until ordered closed | PASS |
| P0-02 close OK after install close | PASS |
| P1-01 no normative class А/Б/В | PASS |
| P1-02 409 leaves current detailed unchanged | PASS |

Repro (Node, from this directory):

```bash
# see agent transcript / run store.js under stub localStorage
```

## Residual

Full unassisted human D11 §7 panel (desktop+mobile) still open. Do not invent observed results.
