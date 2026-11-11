# Gate C changelog — `rev-gate-c-draft-3`

**Base:** `rev-gate-c-draft-2` @ `eefc726` · new review comment on PR #78 (GC2-P0-01…04)  
**Revision:** `rev-gate-c-draft-3` · storage key `mf_gate_c_proto_v3`  
**Gate B:** frozen · **Gate D / apps / merge:** not authorized · Gate C **not approved**

| Finding | Changed behavior (clickable) | Route / entry | How to test |
|---------|------------------------------|---------------|-------------|
| **GC2-P0-01** | Calc reads `draftAreaM2()` from `answers.areaM2` / `pmResult.areaM2`. Label shows real m² (not `undefined` / not default 12). | `#/sales/pm-quick` area **21** → `#/sales/calc-quick` | Estimate = 21 × rate, not 12 × rate |
| **GC2-P0-02** | `closeAcceptedDeal` blocked while any `roomAssent=ordered` has `status≠closed` (A-06). UI lists unfinished rooms; button disabled. | `#/sales/project/prj_nv_volkova?tab=deal` after accept bedroom | Close → error `install_incomplete` until crew closes room |
| **GC2-P0-03** | Assent sheet default **«Не выбрано»**. Validate all scoped rooms first; mutate atomically only on success. Failed accept leaves `roomAssent` untouched. | Accept sheet on Волкова | Confirm with blanks → rejected; bedroom ordered + kitchen out_of_scope OK |
| **GC2-P0-04** | Saving preliminary/both with PM done **also** persists `acousticProfile`. Bind UI shows what will be saved. Default `both` when PM+Calc. | PM → Calc → Bind → room | Room has profile **and** prelim without re-survey |
| **GC2-P1-01** | PM Result uses verbal risk/comfort levels + disclaimer; no normative «класс А/Б/В». | PM Result | Chain text says «иллюстрация», «риск» |
| **GC2-P1-02** | 409 path appends history only; **does not** overwrite confirmed `detailed/scheme/bom`. | Measurer detailed · checkbox 409 | current revisionId unchanged after conflict |

Human D11 §7 walkthrough remains **NOT observed** (no fake UX PASS).
