# Gate C changelog — `rev-gate-c-draft-11`

**Base:** `rev-gate-c-draft-10` · ChatGPT NOT APPROVED on `f202b2d` ([6363117379](https://github.com/Paulos99/multiframe-partner/pull/78#issuecomment-6363117379))  
**Revision:** `rev-gate-c-draft-11` · storage `mf_gate_c_proto_v10`  
**Gate B frozen · Gate D / apps / merge: not authorized**

| Finding | Change |
|---------|--------|
| **GC10-P0-01** | `refreshWallSurfaceCheckboxes` / `applyOptionsToForm`: empty walls ≠ «all walls» on `partner=1&walls=0`; preset survives dims edit, draw/Г-форма, recalc, reopen; `mf-cabinet-calc` + stat cards use `bomTotalsForPartnerBind` (ceiling area/panels/«Итого» one scope) |
| **Keep** | GC9 bridge, GC6 shells, RBAC bind, mobile header |

**Tests:** `node smoke.mjs` → **50/50** · `node e2e-gc9.mjs` → **33/33** (7×3 → **21 m² / 51 panels / 156 646 ₽** ceiling-only; Г-форма bind→reopen; negative bind)

| **GC11-P1-01** | `runQuickAreaCalc()` → `finalizePartnerBomTotals()` so «Смета» install/fasteners/grand match stat card + bind (7×3: 122 196 + 31 500 + 2 950 = **156 646**) |

Human D11 §7 **NOT observed**.
