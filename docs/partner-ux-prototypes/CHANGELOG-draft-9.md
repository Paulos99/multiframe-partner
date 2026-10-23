# Gate C changelog — `rev-gate-c-draft-9`

**ChatGPT reviewed:** `aa0d166` ([comment 6362406643](https://github.com/Paulos99/multiframe-partner/pull/78#issuecomment-6362406643)) — NOT APPROVED (GC6-P0-03 remainder)  
**Already on tip before this work:** `28fd127` calc iframe snapshot · sibling `3785c18` also started draft-9 PM iframe  
**Revision:** `rev-gate-c-draft-9` · storage key `mf_gate_c_proto_v8`  
**Gate B frozen · Gate D / apps / merge: not authorized · Gate C not approved**

### Tip clarification (aa0d166 → now)

| SHA | What ChatGPT / tip had |
|-----|------------------------|
| `aa0d166` | Redrawn PM/Calc shells in `views.js` — logos/cards OK; draw = L×W placeholder; scheme = empty rect; PM result abbreviated; double «Начать»; store-only screenshots |
| `28fd127` | Calc `#/tools/calc` → real `tools/calculator/` iframe (draw editor / BOM) |
| **draft-9** | PM also full-bleed `tools/problemomer/`; full result composition + DEMO listen; one-click Начать; GC8 mobile chrome; **repo** `media/gate-c-draft9-*.png` |

| Finding | Status | Change |
|---------|--------|--------|
| **GC6-P0-03** draw/scheme | addressed | Calc iframe: Шаблоны → Г-форма, contour, panel layout / cuts (see `gate-c-draft9-calc-scheme-panels.png`) |
| **GC6-P0-03** PM result | addressed | Params card, 4 KPI now/after, product+image, norms table, visual compare, **Сравнить на слух** До/После, 5 pillars, next step — DEMO labeled |
| **GC6-P0-03** PM chrome | addressed | Compact light logo row + elongated progress segments; tool full-bleed |
| **GC6-P0-03** one Начать | addressed | Snapshot `start` → Q1 |
| **GC8-P1-01** | addressed | Thin tool-chrome; calc header stacks ≤520px — check 360/390/768 shots |
| **Keep** | kept | GC6-P0-01/02, role tools, area/quote/409, Academy, ceiling stretch preset |

Evidence (PR repo): `docs/partner-ux-prototypes/media/gate-c-draft9-*.png`  
Map: [`REFERENCE_TOOLS.md`](./REFERENCE_TOOLS.md)

Smoke: `node docs/partner-ux-prototypes/smoke.mjs` → **41/41 PASS**.

Human D11 §7 **NOT observed**.
