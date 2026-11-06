# Gate C — Visual baseline (owner feedback 2026-10-23)

**Status:** **VISUAL NOT APPROVED** · functional invariants (GC9–GC11, bind) unchanged · **no** Gate D.  
**Revision:** `rev-gate-c-visual-baseline-1`  
Owner rejected the parallel HTML UI ([PR #78 comment](https://github.com/Paulos99/multiframe-partner/pull/78#issuecomment-6368191763)). This slice matches **live** cabinet patterns before wider rollout.

## Kept

- Store/smoke/e2e behavior; tool iframes unchanged.
- Other roles: legacy `proto.css` shell (not reskinned).

## Changed (sales only)

| Screen | Route |
|--------|--------|
| Сегодня | `#/sales/home` |
| Комната пустая / заполненная | `#/sales/room/prj_nv_soroka/room_sor_living` · `room_sor_bedroom` |
| Проблемомер / калькулятор + назад | `#/sales/tool/{pm\|calc}/{projectId}/{roomId}` |

Tokens copied from `apps/web/src/styles/tokens.css` → `assets/partner-tokens.css`; layout → `assets/partner-baseline.css` (260px sidebar, logos, hint cards, 44px targets). **apps not edited.**

## Evidence

Production reference: https://paulos99.github.io/multiframe-partner/?demo=1 (sales demo login).

| File | Description |
|------|-------------|
| `original-sales-home-{1440,390}.png` | Live cabinet |
| `prototype-sales-home-{1440,390}.png` | Gate C baseline |
| `prototype-room-{empty,filled}-{1440,390}.png` | Room states |
| `prototype-tool-calc-{1440,390}.png` | Calc entry + back bar |
| `compare-*` | Side-by-side original (left) → prototype (right) |

Regenerate: `node capture-visual-baseline.mjs` (also copies to agent store `media/visual-baseline/`).

## Approval gate

Owner signs off this baseline before reskinning other roles. Smoke green ≠ visual OK.
