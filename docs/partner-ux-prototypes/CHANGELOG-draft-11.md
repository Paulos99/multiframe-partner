# Gate C changelog — `rev-gate-c-draft-11`

**Base:** `rev-gate-c-draft-10` · **GC9-P0-01 CLOSED** on tip  
**Open P0:** **GC10-P0-01** — ceiling preset `walls=0` lost after dims/draw recalc; bind amount used full BOM  
**Revision:** `rev-gate-c-draft-11` · storage `mf_gate_c_proto_v9`  
**Gate B frozen · Gate D / apps / merge: not authorized**

| Finding | Change |
|---------|--------|
| **GC10-P0-01** | `refreshWallSurfaceCheckboxes` / `applyOptionsToForm`: empty wall selection ≠ «all walls» on `partner=1&walls=0`; partner bind uses `bomTotalsForPartnerBind` (ceiling stats + partner «Итого»); stat cards scoped the same in host iframe |
| **Keep** | GC9 calc bridge, GC6 shells, RBAC bind, mobile header |

**Tests:** `node smoke.mjs` · `node e2e-gc9.mjs` (GC10 dims invariants)

Human D11 §7 **NOT observed**.
