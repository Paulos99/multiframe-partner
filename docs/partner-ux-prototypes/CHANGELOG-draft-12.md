# Gate C changelog — `rev-gate-c-draft-12`

**Base:** `rev-gate-c-draft-11` @ `bd03fc9` · **GC10-P0-01 CLOSED** (independent review)  
**Open:** **GC11-P1-01** — quick-area «Смета» showed panels-only total while card/bind used full partner «Итого»  
**Revision:** `rev-gate-c-draft-12` · storage `mf_gate_c_proto_v10`  
**Gate B frozen · Gate D / apps / merge: not authorized**

| Finding | Change |
|---------|--------|
| **GC11-P1-01** | `finalizePartnerBomTotals()` shared by `buildBOM` + `runQuickAreaCalc`; install/dowels/grandTotal on `bom.total` for detailed «Смета»; bind uses `grandTotal` when present |
| **Keep** | GC10 ceiling scope, GC9 bridge, RBAC bind |

**Tests:** `node smoke.mjs` · `node e2e-gc9.mjs` (GC11 smeta ↔ card on 7×3)

Human D11 §7 **NOT observed**.
