# Gate C changelog — `rev-gate-c-draft-5`

**Base:** `rev-gate-c-draft-4` @ `5188bf1` · ChatGPT NOT APPROVED + owner clarification on shared tools  
**Revision:** `rev-gate-c-draft-5` · storage key `mf_gate_c_proto_v5`  
**Gate B:** frozen · **Gate D / apps / merge:** not authorized · Gate C **not approved**

| Finding | Changed behavior | How to test |
|---------|------------------|-------------|
| **GC3-P1-02 retry** | `retryPrefill` written to `pendingConflicts[roomId]` (view source). Fields L/W/cutouts/BOM/подпись fill from incoming. Save without 409 clears pending. | Measurer detailed → 409 → «Повторить…» → fields = 7 → save |
| **Owner: shared tools** | All roles: desktop «Инструменты» → Проблемомер + Калькулятор; mobile «Инстр.» hub with two entries. Routes `#/tools/pm`, `#/tools/calc`, `#/tools/bind`. Calc starts without PM; PM without calc. Bind only on Save. Agreed tool look kept (no redesign). | Login as owner/crew/admin/measurer → Инстр. |
| **GC3-P1-01 preview** | Bind banner follows live `select` (`bindSaveType`), not only default. | PM+Calc bind → switch to «Только профиль» → banner updates |

Smoke: `node docs/partner-ux-prototypes/smoke.mjs` → **26/26 PASS**.

Human D11 §7 remains **NOT observed**.
