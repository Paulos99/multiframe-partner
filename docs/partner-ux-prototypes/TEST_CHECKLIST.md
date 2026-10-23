# Gate C — TEST_CHECKLIST (D11 §7 по ролям)

**Назначение:** прогон usability-задач [D11 §7](../partner-ux-spec/11-acceptance-matrix.md) на изолированном HTML-прототипе.  
**Не является** формальным user testing с респондентами — фиксируйте наблюдения вручную при прогоне.  
**Прототип ≠ production proof.**

Протокол (§7.1): first-click Y/N · blocking confusion · re-entry of data · clarity 1–5 · recovery · device · comments.

| Поле | Значение |
|------|----------|
| Дата прогона | |
| Кто | |
| Device | desktop / mobile |
| SHA / ветка | `cursor/partner-ux-spec-gate-b-chatgpt` |

---

## Sales

### AC-UX-S01 — Новый inquiry / проект
- [ ] С home найти «Новый проект» без подсказки  
- [ ] После submit есть project + room + ощущение «сделка начата»  
- First-click: __ · Confusion: __ · Clarity: __/5 · Notes: __

### AC-UX-S02 — Preliminary → правильная комната
- [ ] Путь: Быстрый расчёт **или** комната → Calc → Save/Bind  
- [ ] Результат виден на нужной комнате / проекте (нет «безымянного» объекта)  
- [ ] Нет повторного ввода площади после успешного save  
- First-click: __ · Re-entry: Y/N · Clarity: __/5 · Notes: __

### AC-UX-S03 — КП: share / confirm_sent (copy ≠ sent)
- [ ] Copy или PDF → тост **не** «КП отправлено»  
- [ ] «Подтвердить отправку» → lifecycle `sent_confirmed` / этап сделки обновлён  
- First-click: __ · Confusion copy vs confirm: Y/N · Clarity: __/5 · Notes: __

### AC-UX-S04 — Пауза и возобновление
- [ ] Пауза требует причину; сделка **не** выглядит закрытой навсегда  
- [ ] Resume: **тот же** dealId; этап = исходный `stageAtOutcome`  
- First-click: __ · Clarity: __/5 · Notes: __

### Доп. sales (канон C)
- [ ] `multiframe_offered` на unsaved quick-entry показывает `consultationSessionId`, не требует dealId  
- [ ] Офлайн блокирует create/bind с понятным сообщением  

---

## Measurer

### AC-UX-M01 — Найти назначенную комнату
- [ ] С home ≤2 осмысленных перехода до комнаты  
- First-click: __ · Transitions: __ · Clarity: __/5 · Notes: __

### AC-UX-M02 — Detailed → save → та же комната
- [ ] Detailed сохранён; возврат в ту же комнату; revision/сумма на месте  
- [ ] Нет повторного ввода геометрии  
- Re-entry: Y/N · Clarity: __/5 · Notes: __

---

## Crew

### AC-UX-C01 — Найти своё задание
- [ ] В inbox только ordered + tech-ready  
- [ ] Комната с `deferred` / без tech-ready **не** видна  
- First-click: __ · Clarity: __/5 · Notes: __

### AC-UX-C02 — Чек-лист / blocker
- [ ] Чек-лист: done или N/A+причина  
- [ ] Blocker с типом создаётся; close при open blocker — блок  
- [ ] Коммерческая сумма КП **не** показана  
- Next step ясен: Y/N · Clarity: __/5 · Notes: __

---

## Owner

### AC-UX-O01 — Что требует вмешательства
- [ ] Inbox item ведёт к правильной сущности (assign / проект / пауза)  
- First-click: __ · Clarity: __/5 · Notes: __

### AC-UX-O02 — Назначить ответственность
- [ ] Назначение measurer/crew сохраняется и отражается  
- Clarity: __/5 · Notes: __

---

## StP admin

### AC-UX-A01 — Stalled stage партнёра
- [ ] Сигнал → Partner card показывает **фактический этап** stall  
- First-click: __ · Clarity: __/5 · Notes: __

### AC-UX-A02 — Support / intervention
- [ ] Diagnose → создать Intervention → Verify (adoption ≠ conversion widget)  
- [ ] Training / «Обучение» отделено от «Сеть · продажи»  
- Clarity: __/5 · Notes: __

---

## Academy (изоляция)

- [ ] Anna path (`sell_multiframe`) проходим end-to-end  
- [ ] Score/feedback; `context: training` не смешивается с sales analytics  
- Path chosen: S / P / F / other · Score shown: __ · Notes: __

---

## ADR-003 / anti-patterns

- [ ] Нет вертикального стека ObjectsPanel + Commercial + EntryPoints на одном scroll  
- [ ] Homes не перегружены вторичным маркетингом / статистикой вместо inbox  

---

## Итог прогона

| Блок | Pass / Fail / Blocked | Комментарий |
|------|----------------------|-------------|
| Sales S01–S04 | | |
| Measurer M01–M02 | | |
| Crew C01–C02 | | |
| Owner O01–O02 | | |
| Admin A01–A02 | | |
| Academy isolation | | |
| ADR-003 | | |

**Вердикт для ревью Gate C:** ready for review / needs fixes · (не Gate D)
