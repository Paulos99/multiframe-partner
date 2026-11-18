# Gate C changelog — `rev-gate-c-draft-2`

**Base rejected:** SHA `3ad2502` · review [`CHATGPT_GATE_C_REVIEW_2026-10-23.md`](./CHATGPT_GATE_C_REVIEW_2026-10-23.md)  
**Revision:** `rev-gate-c-draft-2` · storage key `mf_gate_c_proto_v2`  
**Gate B:** frozen · **Gate D / apps / merge:** not authorized

| Finding | Changed behavior (clickable) | Route / entry | How to test |
|---------|------------------------------|---------------|-------------|
| **GC-P0-01** | Short PM survey (room/area/neighbors/noise optional). ≥2 personas (quiet vs noise). Result chain norms→current→MF→Δ→next. No pre-filled «соседи сверху». No guaranteed dB. | `#/sales/quick` → persona cards → `#/sales/pm-quick` | Quiet vs noise → different persona + chain text |
| **GC-P0-02** | Bind allows **PM-only** (no calc). Modes **pick existing** project+room **or create**. `need_result` = pmDone \|\| calcDone. Direct persist to picked room. | `#/sales/bind` | After PM Result → Save profile into Сорокина/Гостиная without calc |
| **GC-P0-03** | Accept opens assent sheet (`ordered/deferred/out_of_scope`). ≥1 ordered. Amount = ordered only. Fixture **Волкова 3 комнаты** (`prj_nv_volkova` / `deal_nv_055`). Close → sequential new dealId. No auto-order from calc. | `#/sales/project/prj_nv_volkova?tab=deal` → Принято | Deferred kitchen; only ordered in crew later |
| **GC-P0-04** | Detailed: L/W/cutouts, scheme box, editable BOM, persist `scheme`+`bom`+`geometry`. prelim ≠ detailed on reopen. Optional 409 keep-both demo. | `#/measurer/calc/prj_nv_soroka/room_sor_bedroom` | Save → room shows scheme/BOM |
| **GC-P0-05** | `crewInbox` filters `assigneeCrew === u_denis`. Foreign bath hidden. Missing/empty checklist → `checklist_missing` blocks close; CTA init checklist. | `#/crew/home` · Коридор | Try close without checklist |
| **GC-P0-06** | Score from choices: Path S **88**, P **71**, F **11**. Answer-key subtitle removed. Feedback lists choices. `training_completed` does not touch funnel. | `#/sales/academy` | Run S vs P vs F; check score |
| **GC-P1-01** | Mobile bottom tabs (3–4) instead of only horizontal scroll nav. | width ≤820px | |
| **GC-P1-02** | Offline → outbox queued; Demo loading toggle; calc 409 checkbox. | chrome / detailed | |
| **GC-P1-03** | Owner staff create/reset + one-time password modal (hide once). Admin verify shows before/after adoption %. | `#/owner/staff` · partner Verify | |
| **GC-P1-04** | Copy/PDF open preview; clipboard + downloadable `.txt` mock; lifecycle unchanged. | Deal КП buttons | |
| **GC-P1-05** | Screenshots under `media/`; TEST_CHECKLIST honest agent/not-human status. | `media/` | |
| **GC-P1-06** | PR title/body updated to Gate B approved / Gate C in review. | PR #78 | |
