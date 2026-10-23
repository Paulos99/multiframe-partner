# Gate C changelog — `rev-gate-c-draft-10`

**Base:** `rev-gate-c-draft-9` @ `2f67153` · ChatGPT **GC9-P0-01** ([comment 6362930611](https://github.com/Paulos99/multiframe-partner/pull/78#issuecomment-6362930611))  
**Revision:** `rev-gate-c-draft-10` · storage `mf_gate_c_proto_v8`  
**Gate B frozen · Gate D / apps / merge: not authorized**

| Finding | Change |
|---------|--------|
| **GC9-P0-01** | Calc iframe URL: `partner=1`, `gateC=1`, `walls=0` (ceiling preset) + optional PM `area` handoff. Snapshot `publishCalcToCabinet` + area preliminary for Gate C; host `mf-gate-c-calc-publish` / **Сохранить расчёт** without nuking iframe on ingest; `calcMeta` on draft; removed misleading demo→14 м² button. |
| **Keep** | GC6-P0-03 visual, GC6-P0-01/02, GC8-P1-01 |

Tests: `node docs/partner-ux-prototypes/smoke.mjs` · `node docs/partner-ux-prototypes/calc-bridge-e2e.mjs` (playwright + `:8765` server)

Human D11 §7 **NOT observed**.
