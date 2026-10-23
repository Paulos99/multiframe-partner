# Gate C smoke — `rev-gate-c-draft-4`

**Не user testing.**

| | |
|--|--|
| Against review | PR comment GC3 on `16a90c0` |
| Store smoke | **18/18 PASS** via executable script |
| Verdict | GC3-P0/P1 clickable; Gate C still needs human UX evidence |

## Command

```bash
cd docs/partner-ux-prototypes
node smoke.mjs
```

Script: [`smoke.mjs`](./smoke.mjs)

## Checks covered

GC3-P0-01 area mismatch + adopt + create + reopen identity · GC3-P0-02 quote-only scope · GC3-P1-01 profile-only · GC3-P1-02 409 pending/dismiss/apply.

## Residual

Full unassisted human D11 §7 panel still open. Do not invent observed results.
