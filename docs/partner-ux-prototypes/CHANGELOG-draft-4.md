# Gate C changelog — `rev-gate-c-draft-4`

**Base:** `rev-gate-c-draft-3` @ `16a90c0` · ChatGPT re-acceptance NOT APPROVED  
**Revision:** `rev-gate-c-draft-4` · storage key `mf_gate_c_proto_v4`  
**Gate B:** frozen · **Gate D / apps / merge:** not authorized · Gate C **not approved**

| Finding | Changed behavior | Route / entry | How to test |
|---------|------------------|---------------|-------------|
| **GC3-P0-01** | Bind to existing with area mismatch requires explicit adopt/recalc. Saved prelim keeps `areaM2`+amount; room header syncs. Reopen calc shows saved identity; save preserves it. Create uses consultation area. | PM 21 → calc → bind Сорокина/Спальня | Adopt → room 21 м² / 71 400; reopen Preliminary stays 71 400 |
| **GC3-P0-02** | `scopedRoomsForDeal` = rooms of sent/sent_confirmed Quote only. Calculated rooms outside quote listed as out-of-scope, not in assent sheet. | Deal tab · store fixture Quote.rooms=`[bed]` | scoped = bed only |
| **GC3-P1-01** | Room card shows saved `acousticProfile` + openable Result chain without re-survey. Profile-only preview text does not promise prelim. | After PM bind → room | Profile panel visible |
| **GC3-P1-02** | Full incoming in `pendingConflicts`; compare UI; keep / apply / retry; dismiss banner does not wipe incoming. | Measurer detailed · 409 | Compare → restore L=7 |

Executable smoke: `node smoke.mjs` → **18/18 PASS**.

Human D11 §7 walkthrough remains **NOT observed**.
