# Gate C — TEST_CHECKLIST (D11 §7) · `rev-gate-c-draft-7`

**Честно:** ячейки «Observed» ниже — **agent walkthrough / store smoke**, **не** human usability lab.  
GC-P1-05: финальный Gate C OK требует незаполненный человеком прогон без подсказок. Не ставить UX PASS по зелёному smoke.

| Поле | Значение |
|------|----------|
| Revision | `rev-gate-c-draft-7` |
| Device agent | desktop Chromium + store VM |
| Human observed | **NOT observed** |
| Agent smoke | **36/36 PASS** (`node smoke.mjs`) |

Протокол §7.1: first-click · confusion · re-entry · clarity 1–5 · recovery · device · comments.

---

## Sales

### AC-UX-S01 — Новый inquiry
- Steps: login sales → Новый проект → submit  
- Fixture: default form  
- Agent: path exists · Human: NOT observed  

### AC-UX-S02 — Preliminary / PM save в правильную комнату
- Steps: Быстрый расчёт → persona → PM Result → `#/sales/bind` → pick existing **или** create; допускается **PM-only**  
- Fixture: quiet/noise; `prj_nv_soroka`  
- Agent: PASS (PM-only pick) · Human: NOT observed  

### AC-UX-S03 — КП copy ≠ confirm_sent
- Steps: Deal → Копировать/PDF (preview+clipboard/download) → отдельно «Подтвердить отправку»  
- Agent: PASS (preview, lifecycle unchanged until confirm) · Human: NOT observed  

### AC-UX-S04 — Пауза / resume
- Steps: Парк Хаус deal → Возобновить на stageAtOutcome  
- Agent: PASS (prior) · Human: NOT observed  

### GC-P0-03 partial assent (extra)
- Steps: `#/sales/project/prj_nv_volkova?tab=deal` → Принято → sheet ordered/deferred/out_of_scope → close → sequential Deal  
- Agent: PASS · Human: NOT observed  

### GC2-P0-01 — Calc area from PM answers
- Steps: PM area **21** → calc-quick → estimate uses 21 м²  
- Agent: PASS (store) · Human: NOT observed  

### GC2-P0-02 — A-06 close blocked
- Steps: Accept bedroom only → «Закрыть Deal» blocked until room status=closed  
- Agent: PASS (store) · Human: NOT observed  

### GC2-P0-03 — Assent no dangerous defaults
- Steps: sheet defaults «Не выбрано»; confirm with blanks → no state change; then bedroom ordered only  
- Agent: PASS (store) · Human: NOT observed  

### GC2-P0-04 — PM+Calc bind keeps profile
- Steps: PM → Calc → Bind preliminary/both → room has acousticProfile + preliminary  
- Agent: PASS (store) · Human: NOT observed  

### GC3-P0-01 — Area/amount identity after bind+reopen
- Steps: PM 21 → calc 71400 → bind existing with adopt → room 21/71400 → reopen Preliminary stays  
- Agent: PASS (`node smoke.mjs`) · Human: NOT observed  

### GC3-P0-02 — Assent = Quote.rooms only
- Steps: restrict sent Quote to bedroom; scopedRoomsForDeal excludes other calculated rooms  
- Agent: PASS · Human: NOT observed  

### GC3-P1-01 — Profile visible on room
- Steps: PM-only bind → room card shows profile + Result details  
- Agent: PASS (store+view) · Human: NOT observed  

### GC3-P1-02 — 409 compare / restore
- Steps: detailed 409 → compare → apply incoming or keep; dismiss keeps pending  
- Agent: PASS · Human: NOT observed  

### GC3-P1-02 remainder — retry prefill
- Steps: 409 → «Повторить с актуальной revision» → L/W/BOM = incoming → save without 409  
- Agent: PASS (`smoke.mjs`) · Human: NOT observed  

### Owner shared tools — all roles
- Steps: login owner/crew/admin/measurer/sales → desktop Проблемомер + Калькулятор OR mobile Инстр. hub → open each without the other  
- Agent: routes wired · Human: NOT observed  

### Bind preview follows select
- Steps: PM+Calc bind → change saveType to profile-only → banner text updates  
- Agent: wired (`bind-savetype-change`) · Human: NOT observed  

### GC6-P0-01 — crew/admin cannot write projects
- Steps: crew calc → bind → personal only; Сорокина area/prelim unchanged; admin create forbidden  
- Agent: PASS (`smoke.mjs`) · Human: NOT observed  

### GC6-P0-02 — saveType keeps room selection
- Steps: pick Гостиная → switch both↔profile → Save → living profile; bedroom untouched  
- Agent: PASS · Human: NOT observed  

---

## Measurer

### AC-UX-M01 — Найти комнату ≤2 перехода
- Steps: home → Открыть  
- Agent: path OK · Human: NOT observed  

### AC-UX-M02 — Detailed → save → same room
- Steps: Detailed → L/W/cutouts/BOM → Сохранить → комната со схемой  
- Agent: PASS · Human: NOT observed  

---

## Crew

### AC-UX-C01 — Своё задание
- Steps: home; чужой `room_vas_bath` скрыт; deferred кухня скрыта  
- Agent: PASS · Human: NOT observed  

### AC-UX-C02 — Checklist / blocker
- Steps: Зал checklist; Коридор без checklist → close forbidden → Init checklist  
- Agent: PASS · Human: NOT observed  

---

## Owner

### AC-UX-O01 / O02
- Steps: inbox → assign; staff create/reset one-time password  
- Agent: path OK · Human: NOT observed  

---

## StP admin

### AC-UX-A01 / A02
- Steps: Сигналы → partner → diagnose → intervention → verify before/after  
- Training: `#/admin/training` отдельно от `#/admin/analytics`  
- Agent: path OK · Human: NOT observed  

---

## Academy

- Paths S/P/F → scores **88 / 71 / 11**; no answer-key subtitle; funnel unchanged  
- Agent: PASS · Human: NOT observed  

---

## ADR-003

- Tabs / one work panel; no ObjectsPanel+Commercial stack  
- Agent: code/visual review · Human: NOT observed  

---

## Итог

| Блок | Agent smoke | Human UX |
|------|-------------|----------|
| P0-01…06 | PASS | NOT observed |
| D11 §7 tasks | paths wired | NOT observed — **blocking for final Gate C OK** |
| Verdict now | **ready for re-review of P0 clickability** | final approval pending human evidence |
