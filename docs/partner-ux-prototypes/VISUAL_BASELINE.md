# Gate C — Visual baseline (owner feedback 2026-10-23)

**Status:** **VISUAL NOT APPROVED** · functional prototype (draft-13/14) remains valid for logic/smoke only.  
**Revision:** `rev-gate-c-visual-baseline-1` · **no** Gate C UX acceptance · **no** Gate D.

Owner rejected the parallel HTML UI system (primitive cards, ①②③ nav, separate chrome). This document starts **VISUAL BASELINE FIRST** per PR #78.

## Step 0 — Inventory (production → prototype)

| Production source (`apps/web`) | What it defines | Gate C before | Baseline v1 (`visual-baseline-1`) |
|--------------------------------|-----------------|---------------|-----------------------------------|
| `src/styles/tokens.css` `--cab-*` | Palette, radii, shadows, title/kpi scale | Ad-hoc `--bg0`, `--radius: 12px` | `assets/cabinet-tokens.css` mirror + alias in `proto.css` |
| `app-shell/CabinetChrome.module.css` | 260px grid, radial page bg, sticky topbar | Stacked header + 220px nav | `.cab-frame`, `.cab-topbar`, `.cab-work` |
| `app-shell/Sidebar.module.css` | Logo row, 44px nav, **filled green active** | Inset accent bar, text-only brand | StP + MultiFrame PNGs, `.nav.desktop-nav a.active` |
| `partner/Projects.module.css` | XL card radius, 44px buttons, caption uppercase | 12px panels, 8px buttons | `--cab-radius-xl` panels, `min-height: 44px` buttons |
| `partner/CabinetBrand.module.css` | Logo filters on light sidebar | «MultiFrame» text only | `logo-stp.png` + `logo-multiframe.png` |
| Mobile ≤640px | Bottom tab bar, no ①②③ | Unstyled `.bottom-nav` | Fixed bottom bar, short labels |

**Preserve without redesign:** brand green `#01644f`, logo assets, sidebar width 260px, card elevation, touch 44px, queue-not-dashboard for «Сегодня».

**Explicitly not claimed:** pixel-perfect match to production React components; full 5-role reskin; D11 §7 human pass.

## Step 1 — Scope (2–3 screens only)

| # | Route | Fixture | Purpose |
|---|--------|---------|---------|
| 1 | `#/sales/home` | login `sales` | Personal queue «Сегодня» |
| 2 | `#/sales/room/prj_nv_soroka/room_sor_living` | empty room | CTA + tools path |
| 3 | `#/sales/room/prj_nv_soroka/room_sor_bedroom` | prelim saved | Filled room card |
| 4 | `#/tools/hub` | any role | PM/Calc entry (organic back via chrome) |

## Step 2 — Evidence in PR

Screenshots in `media/visual-baseline-1-*` (desktop **1440×900**, mobile **390×844**):

- `visual-baseline-1-sales-home-{desktop,mobile}.png`
- `visual-baseline-1-room-empty-{desktop,mobile}.png`
- `visual-baseline-1-room-filled-{desktop,mobile}.png`

**Production reference** (for owner side-by-side): live partner UI at https://paulos99.github.io/multiframe-partner/ (same tokens as `apps/web`). Capture login/projects from that deployment when comparing; prototype does not modify `apps/*`.

Regenerate:

```bash
cd docs/partner-ux-prototypes && node capture-visual-baseline.mjs
```

## Step 3 — Approval gate

Owner approves **this baseline** before reskinning admin/crew/measurer clusters. Smoke/e2e green ≠ visual OK.

## Step 4 — After visual OK

Roll cabinet styles across roles; keep Gate A/B store invariants unchanged.
