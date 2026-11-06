# Gate C changelog — `rev-gate-c-draft-13`

**Base:** `rev-gate-c-draft-12` @ `dbaaa369` · ChatGPT/owner UX rejection ([6366415544](https://github.com/Paulos99/multiframe-partner/pull/78#issuecomment-6366415544))  
**Revision:** `rev-gate-c-draft-13` · storage `mf_gate_c_proto_v10`  
**Gate B frozen · D11 §7 NOT observed**

| ID | Change |
|----|--------|
| **GC11-UX-01** | Cabinet `proto.css`: light gray-white shell, green `#01644f`, sans-serif, StP badge — aligned with live partner site; tool iframes unchanged |
| **GC11-UX-02** | Russian labels: Предварительный расчёт, Расчёт по замеру, Решение клиента, Готовность к монтажу, Профиль Проблемомера (bind + room + lists) |
| **GC11-UX-03** | Empty room: one primary CTA «Начать предварительный расчёт» + plain empty-state copy (no twin dash blocks) |

**Tests:** `node smoke.mjs` · `node e2e-gc9.mjs` (math/GC10–GC11 unchanged)

**Media:** `media/gate-c-draft13-cabinet-desktop.png`, `media/gate-c-draft13-empty-room-desktop.png`

### GC13-UX-01 (дополнение к `rev-gate-c-draft-13`)

| ID | Change |
|----|--------|
| **GC13-UX-01** | Пользовательские подписи в `assets/views.js` + тосты/листы в `app.js`: Bind/Save/Result/Deal/assent sheet → русский; lifecycle КП, исходы сделки, crew/owner/admin copy; **MultiFrame** / **PDF** / id (`dealId`, `ordered` values) без перевода |
