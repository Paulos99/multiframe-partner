# Gate C changelog — `rev-gate-c-draft-11`

**Base:** `rev-gate-c-draft-10` · ChatGPT NOT APPROVED on `f202b2d` ([6363117379](https://github.com/Paulos99/multiframe-partner/pull/78#issuecomment-6363117379))  
**Open P0:** **GC10-P0-01** — `walls=0` must stick after geometry refresh; bind payload area/panels/amount single ceiling scope.

| ID | Fix |
|----|-----|
| **GC10-P0-01** | `refreshWallSurfaceCheckboxes` / `applyOptionsToForm`: empty `selectedWallIds` + `calcWalls === false` ≠ «all walls»; partner iframe keeps walls off through dims edit, draw/Г-форма, recalc, resize, reopen; `mf-cabinet-calc` uses ceiling-only panels/dowels/amount (partner «Итого») aligned with `areaM2`. |

**Tests:** `node smoke.mjs` · `node e2e-gc9.mjs` (7×3 → 21 m² / ~51 panels / amount &lt; wall+ceiling; Г-форма bind→reopen; negative bind).

**Storage:** `mf_gate_c_proto_v10`
