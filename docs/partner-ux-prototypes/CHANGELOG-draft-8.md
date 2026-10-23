# Gate C changelog — `rev-gate-c-draft-8`

**Base:** `rev-gate-c-draft-7` @ `f4b70ce` · ChatGPT/owner finding **GC6-P0-03**  
**Authoritative:** [PR #78 comment 6361514937](https://github.com/Paulos99/multiframe-partner/pull/78#issuecomment-6361514937)  
**Revision:** `rev-gate-c-draft-8` · storage key `mf_gate_c_proto_v7`  
**Gate B:** frozen · Gate D / apps / merge: **not authorized** · Gate C **not approved** until re-acceptance

| Finding | Changed behavior (clickable) | Route / entry | How to test |
|---------|------------------------------|---------------|-------------|
| **GC6-P0-03** | Restored recognizable **original shell** for Problemer + Calculator inside Gate C only: StP/MultiFRAME logos, light/dark toggle, green brand header, large type, choice cards. **Problemer:** intro «Проверьте уровень акустического комфорта…» + Начать; progress Старт→Объект→Итог; stepped survey «Вопрос N из 7» (ceiling preset `stretch` — no plannedCeiling Q); large answer cards; fixed Назад/Далее; result composition (params / KPI / norms / compare / pillars / next step) with demo data and honesty disclaimer (no new acoustic claims). **Calculator:** branded «КАЛЬКУЛЯТОР»; entries Ввести размеры / Нарисовать схему / По площади; left params + large «Схема монтажа»; L/W/H, surfaces, mounting; area/panels/cost + expandable estimate lines; PDF/Share demo UI. | `#/tools/pm`, `#/tools/calc` | Open tools after any role login; walk PM intro→survey→result; calc entry→scheme→result |
| **Keep** | GC6-P0-01 RBAC bind (crew/admin → personal only); GC6-P0-02 bindPickPair persistence; all-role `#/tools/pm\|calc`; area identity; quote scope; 409 retry; Academy voice | unchanged store contracts | `node docs/partner-ux-prototypes/smoke.mjs` |

**Disputed / flagged for owner (not invented):** wall surface chip remains demo-visible in calc sidebar (original calc has walls; ceiling-company Gate A/B prefers ceiling-primary — chip labeled demo). NoiseKind skipped when «тихо» (same as original visibleRoomSubsteps).

Smoke: `node docs/partner-ux-prototypes/smoke.mjs` → **36/36 PASS**.

Evidence: `/cursor/stores/bc-4e5fdec0-03d5-44d5-95da-9adbe9fb08b4/media/gate-c-original-vs-proto/`

Human D11 §7 remains **NOT observed**.
