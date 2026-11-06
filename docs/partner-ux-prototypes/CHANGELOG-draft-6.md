# Gate C changelog — `rev-gate-c-draft-6`

**Base:** `rev-gate-c-draft-5` @ `693668c` (+ ACCESS note) · owner feedback: stiff / LMS voice in Academy  
**Revision:** `rev-gate-c-draft-6` · storage key unchanged `mf_gate_c_proto_v5` (copy-only)  
**Gate B:** frozen · **Gate D / apps / merge:** not authorized · Gate C **not approved**

| Change | Behavior | How to test |
|--------|----------|-------------|
| **Voice · Academy hub** | Human titles/subs; «Предложить MultiFrame» instead of `sell_multiframe · Anna`; slots «Скоро» without jargon | Sales → Академия |
| **Voice · Anna trainer** | Goal + challenge; feedback names next job on site; no `context: training` / path codes in chrome | Start dialogue → finish S/P/F |
| **Voice · scores** | Titles/feedback/nextJob rewritten; scores **88 / 71 / 11** and paths unchanged | Smoke + manual S/P/F |
| **Chrome tone** | Nav «Академия» → hub; sales home / tools / analytics / admin training microcopy softened | Spot-check roles |

Smoke: `node docs/partner-ux-prototypes/smoke.mjs` → expect PASS (store scoring mechanics unchanged).

Human D11 §7 remains **NOT observed**.
