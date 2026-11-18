# Gate C — `rev-gate-c-visual-baseline-1`

**Trigger:** Owner visual rejection on PR #78 (parallel UI ≠ production cabinet).  
**Scope:** Visual only in `docs/partner-ux-prototypes/` — **no** `apps/*`, **no** Gate D.

## Delivered

- `assets/cabinet-tokens.css` — `--cab-*` mirror from `apps/web/src/styles/tokens.css`
- `proto.css` — production-like frame (260px sidebar, logos, topbar, XL cards, 44px buttons, mobile bottom nav)
- `views.js` — cabinet shell; removed ①②③ mobile icons
- `VISUAL_BASELINE.md` — inventory + approval process
- `capture-visual-baseline.mjs` + `media/visual-baseline-1-*.png` (1440 / 390)
- `media/visual-baseline-1-ref-production-login-desktop.png` — live site reference frame

**Status:** VISUAL NOT APPROVED — awaiting owner pick of baseline direction.
