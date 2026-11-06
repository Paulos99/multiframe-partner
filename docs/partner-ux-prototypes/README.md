# Gate C — изолированные HTML-прототипы MultiFrame Партнёр

**Revision:** `rev-gate-c-visual-baseline-1`  
**Статус:** Gate C **visual NOT APPROVED** (owner) · **visual baseline v1** (sales, 3 screens) · functional smoke green · Gate B **frozen**  
**Периметр:** только этот каталог. **Не** `apps/*`, **не** merge/deploy, **не** Gate D.  
**Прототип ≠ production proof.**

Visual baseline: [`VISUAL_BASELINE.md`](./VISUAL_BASELINE.md) · media: [`media/visual-baseline/`](./media/visual-baseline/) · Changelog: [`CHANGELOG-draft-14.md`](./CHANGELOG-draft-14.md) · Smoke: `node smoke.mjs` · Capture: `node capture-visual-baseline.mjs`

**Инструменты:** `#/tools/pm` · `#/tools/calc` — full-bleed iframes over `tools/problemomer/` + `tools/calculator/`. Owner ref: https://paulos99.github.io/multiframe-partner/ · Bind — RBAC D5 §1.7.

---

## Как открыть

```bash
python3 -m http.server 8765 --directory docs/partner-ux-prototypes
# http://localhost:8765/
```

Или откройте [`index.html`](./index.html). Состояние: `localStorage` key **`mf_gate_c_proto_v10`** (сброс в nav).

---

## Фикстуры для P0

| Project / deal | Notes |
|----------------|-------|
| `prj_nv_soroka` / `deal_nv_041` | PM + calc bind, area mismatch |
| `prj_nv_volkova` / `deal_nv_055` | 3-room partial assent + sent quote |

---

## Роли (кратко)

| Роль | Сценарий |
|------|----------|
| sales | quick personas → PM → calc → bind; **baseline UI** on `#/sales/home`, `#/sales/room/*`, `#/sales/tool/*` |
| measurer | detailed geometry/BOM/scheme save → reopen |
| crew | inbox (свой assignee) → checklist/blocker |
| owner | inbox · staff create/reset one-time password |
