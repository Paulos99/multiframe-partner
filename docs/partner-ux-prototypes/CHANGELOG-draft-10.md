# Gate C changelog — `rev-gate-c-draft-10`

**Base:** `rev-gate-c-draft-9` @ `2f67153` · ChatGPT **GC6-P0-03 / GC8-P1-01 CLOSED** on visual review  
**Open P0:** **GC9-P0-01** ([comment 6362930611](https://github.com/Paulos99/multiframe-partner/pull/78#issuecomment-6362930611))  
**Revision:** `rev-gate-c-draft-10` · storage `mf_gate_c_proto_v9`  
**Gate B frozen · Gate D / apps / merge: not authorized**

| Finding | Change |
|---------|--------|
| **GC9-P0-01** | Calc iframe `?partner=1&walls=0&surfaces=ceiling`; `publishCalcToCabinet` + `scheduleCabinetPublish` for **area / dims / draw**; `panelsCost` = partner «Итого»; host `ingestCalcToolResult` rejects empty/14 fixture; removed «Демо→черновик»; host preserves iframe on `mf-cabinet-calc` + return from bind; optional PM→calc `area` handoff when `pmDone && !calcDone` |
| **Keep** | GC6-P0-01/02, RBAC, area/quote/409, Academy, ceiling scope |

**Tests:** `node smoke.mjs` · `node e2e-gc9.mjs` (browser calc→bind→room)

Human D11 §7 **NOT observed**.
