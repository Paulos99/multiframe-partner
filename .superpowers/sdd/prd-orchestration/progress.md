# SDD ledger — plan: оркестрация агентов PRD MultiFrame Партнёр

BASE: cursor/prd-orchestration-55a4 off main

## Rulings
- Deal отдельная сущность, привязана к projectId. JobObject статусы сохранены; quote_sent/closed не равны отправке/продаже.
- КП: quote_created → quote_shared → quote_sent_confirmed → quote_accepted|quote_declined|quote_postponed. Копирование не меняет статус.
- ObjectAssignments: salesUserId, measurerUserId, crewUserId; assignedTo — derived.
- Тренажёры без LLM; training-контекст исключён из KPI.
- События без ПД; дедуп по eventId; воронка по dealId.
- Малая выборка → «недостаточно наблюдений».

## Progress

- [x] Wave 0 — shared Deal/Quote/Events/Learning/Support (`9e49437`)
- [x] Wave 1 — API routes + platformMigrate (`5f61bff`)
- [x] Wave 2 — CabinetScreen → role homes (`e3f17f9`)
- [x] Wave 3 — commercial process / WorkToday / KP / outcomes (`a6a5839`)
- [x] Wave 4a — signals / PartnerCard / StP support (`bfde839`)
- [x] Wave 4b — academy trainers (`48c8965`)
- [x] Final-review hardening — PII scrub, auth (`b6f8438`)
- [x] Demo localDeals + parallel role smoke (`0623c6d`)
- [x] Kanban e2e layout/menu fix (`b54ea88`)
- [ ] Merge to `main` (blocked on green UI package CI at report time)
- Full report for ChatGPT plan author: `report-for-chatgpt.md`
