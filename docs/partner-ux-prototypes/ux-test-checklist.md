# Gate C UX test checklist (D11 §7)

**Prototype:** [index.html](./index.html)  
**Rule:** observed results here ≠ production Done. Record first-click, confusion, re-entry, next-step clarity, device, comments.

| AC-ID | Role | Task | Where in prototype | Pass notes |
|-------|------|------|--------------------|------------|
| AC-UX-S01 | sales | Новый inquiry | Сегодня → Новый проект | |
| AC-UX-S02 | sales | Preliminary → правильная комната | Инструменты / Быстрый расчёт → Save → bind | |
| AC-UX-S03 | sales | КП share/confirm_sent | Сделка → Copy vs Подтвердить отправку | |
| AC-UX-S04 | sales | Пауза и resume same dealId | Сделка → Пауза → Возобновить | |
| AC-UX-M01 | measurer | Найти назначенную комнату | Мои замеры → Продолжить | |
| AC-UX-M02 | measurer | Detailed save → назад в комнату | Расчёт → тип detailed → Сохранить | |
| AC-UX-C01 | crew | Своё задание only ordered+tech-ready | Задания (скрыта deferred/prelim) | |
| AC-UX-C02 | crew | Схема + blocker | Монтаж → препятствие | |
| AC-UX-O01 | owner | Что требует вмешательства | Сегодня owner inbox | |
| AC-UX-O02 | owner | Назначить ответственность | Inbox → Сделка | |
| AC-UX-A01 | admin | Stalled stage партнёра | Сигналы → PartnerCard | |
| AC-UX-A02 | admin | Intervention | PartnerCard → Создать intervention | |

## Extra prototype checks

- [ ] Offline toggle: текст «Сохранено локально» vs «на сервере»
- [ ] Calc conflict 409 path (keep remote / keep local as new rev)
- [ ] Academy Path S score 88; Path F score 11; no Deal written
- [ ] consultationSessionId stable across repeated tool opens
- [ ] Mobile viewport: nav scrolls, CTA usable
