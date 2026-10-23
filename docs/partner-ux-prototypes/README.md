# Gate C — изолированные HTML-прототипы MultiFrame Партнёр

**Revision:** `rev-gate-c-draft-9`  
**Статус:** Gate C **in review** (GC6-P0-03 remainder + GC8-P1-01) · Gate B **APPROVED / frozen**  
**Периметр:** только этот каталог. **Не** `apps/*` (кроме readonly calc snapshot), **не** merge/deploy, **не** Gate D.  
**Прототип ≠ production proof.**

Changelog: [`CHANGELOG-draft-9.md`](./CHANGELOG-draft-9.md) · Reference: [`REFERENCE_TOOLS.md`](./REFERENCE_TOOLS.md) · Access: [`ACCESS_TOOLS.md`](./ACCESS_TOOLS.md).

**Инструменты:** `#/tools/pm` / `#/tools/calc` — full-bleed iframe hosts of agreed shells (outside dark cabinet). Owner ref: https://paulos99.github.io/multiframe-partner/

---

## Как открыть

```bash
python3 -m http.server 8765 --directory docs/partner-ux-prototypes
# http://localhost:8765/
```

Или откройте [`index.html`](./index.html). Состояние: `localStorage` key **`mf_gate_c_proto_v7`** (сброс в nav).

---

## Фикстуры для P0

| Фикстура | Зачем |
|----------|--------|
| Persona cards на `#/sales/quick` | quiet vs noise PM |
| `prj_nv_volkova` / `deal_nv_055` | 3-room partial assent + sent quote |
| `room_vas_bath` → Сергей | чужой assignee (скрыт у Дениса) |
| `room_vas_corridor` | checklist missing |
| Academy paths S/P/F | scores 88/71/11 |

---

## Карта ролей (кликабельно)

| Роль | Золотой путь draft-2 |
|------|----------------------|
| sales | quick personas → PM survey → Result chain → bind PM-only/pick\|create → Волкова assent sheet → copy/PDF preview ≠ confirm → Academy |
| measurer | room → detailed geometry/BOM/scheme save → reopen |
| crew | inbox (свой assignee) → checklist/blocker; close blocked if checklist missing |
| owner | inbox · staff create/reset one-time password |
| admin | signal → diagnose → intervention → verify before/after (≠ conversion) · training отдельно |

Mobile ≤820px: **bottom tabs** (GC-P1-01).

---

## Документы

- [`TEST_CHECKLIST.md`](./TEST_CHECKLIST.md) — D11 §7 steps + honest observation status  
- [`SMOKE_TEST.md`](./SMOKE_TEST.md) — agent smoke (**не** user testing)  
- [`media/`](./media/) — inspectable screenshots in PR  

Residual: full human unassisted UX panel still required for final Gate C approval (GC-P1-05).
