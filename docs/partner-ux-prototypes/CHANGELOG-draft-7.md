# Gate C changelog — `rev-gate-c-draft-7`

**Base:** `rev-gate-c-draft-6` @ `5457e87` · ChatGPT NOT APPROVED (GC6-P0-01/02)  
**Revision:** `rev-gate-c-draft-7` · storage key `mf_gate_c_proto_v6`  
**Gate B:** frozen · Gate D / apps / merge: not authorized · Gate C **not approved**

| Finding | Changed behavior | How to test |
|---------|------------------|-------------|
| **GC6-P0-01** | D5 §1.7: `crew`/`admin` can open PM/Calc but `bindDraft` returns `forbidden_role`. UI offers **личный результат** (`personalResults`) without mutating Project/Room/Deal. Sales/owner/measurer keep pick/create. | Login crew → calc 21 → bind → personal save; Сорокина unchanged |
| **GC6-P0-02** | `ui.bindPickPair` + `bindCreateFields` persist across saveType/mode changes; banner shows actual target; options keep `selected`. | Choose Гостиная → switch both→profile → Save → living only |

Smoke: `node docs/partner-ux-prototypes/smoke.mjs` → **36/36 PASS**.

Human D11 §7 remains **NOT observed**.
