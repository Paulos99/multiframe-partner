# Gate C — изолированные HTML-прототипы MultiFrame Партнёр

**Статус:** Gate C **in progress / ready for review** · Gate B **APPROVED** 2026-10-23  
**Периметр:** только этот каталог. **Не** `apps/*`, **не** `packages/*`, **не** API/БД, **не** merge/deploy, **не** Gate D.  
**Важно:** прототип ≠ production proof. Демо-фикстуры не доказывают работу боевого контура.

Спеки-канон: [`docs/partner-ux-spec/`](../partner-ux-spec/) · owner OK: [`gate-b-owner-approval-2026-10-23.md`](../partner-ux-spec/gate-b-owner-approval-2026-10-23.md) · PR [#78](https://github.com/Paulos99/multiframe-partner/pull/78).

---

## Как открыть

1. Без сборки: откройте [`index.html`](./index.html) в браузере (двойной клик или «Open with Live Server»).  
2. Либо из корня репо:  
   `python3 -m http.server 8765 --directory docs/partner-ux-prototypes`  
   → http://localhost:8765/  
3. Выберите роль на экране входа. Состояние — в `localStorage` (`mf_gate_c_proto_v1`). Сброс — пункт «Сбросить демо-данные» в nav.

Desktop и узкая ширина (mobile-friendly): nav становится горизонтальным скроллом.

---

## Демо-орг

**Неболайн** (СПб, натяжные потолки). Сеть для StP: Неболайн, ПотолокПлюс, ТихийПотолок.

| Роль | Персона | Золотой путь |
|------|---------|--------------|
| sales | Мария Ковалёва | Сегодня → быстрый расчёт / проект → PM/Calc → Save/Bind → КП (copy≠confirm) → пауза/resume или outcome |
| measurer | Павел Рыжов | Мои замеры → комната → detailed → save → та же комната |
| crew | Денис Орлов | Задания (только tech-ready) → чек-лист / blocker → close |
| owner | Игорь Неболин | Inbox → назначение / проект |
| StP admin | Елена Степанова | Сигналы → Partner card → diagnose → intervention → verify; Academy/training отдельно от sales analytics |

---

## Карта экранов (hash routes)

| Route | E-* / смысл |
|-------|-------------|
| `#/login` | E-login · выбор роли |
| `#/sales/home` | E-home-sales |
| `#/sales/inquiry` | E-inquiry |
| `#/sales/quick` → `pm-quick` → `calc-quick` → `bind` | E-pm / E-calc / E-calc-save / E-quick-bind |
| `#/sales/projects` · `#/sales/project/:id` | E-projects / E-project (вкладки: комнаты \| сделка \| итог) |
| `#/sales/project/:id?tab=deal` | E-quote-deal |
| `#/sales/room/...` · `#/sales/calc/...` | E-room / calc save |
| `#/sales/academy-hub` · `#/sales/academy` | E-academy · Anna path |
| `#/sales/analytics` | E-analytics (без training) |
| `#/measurer/home` · `room` · `calc` | E-home-measurer / room / detailed |
| `#/crew/home` · `install/...` | E-home-crew / E-install |
| `#/owner/home` · `assign/...` · `staff` | E-home-owner / assign / staff |
| `#/admin/home` · `partner/:id` | E-home-admin / E-partner-card contour |
| `#/admin/analytics` · `training` | E-analytics vs E-analytics-training |

**ADR-003:** на одном экране — одна работа (вкладки/сегменты), без вертикального стека ObjectsPanel + Commercial + EntryPoints.

---

## ChatGPT notes для Gate C (учтено)

1. **Resume paused** → тот же `dealId`, возврат на `stageAtOutcome` (исходный этап).  
2. **`multiframe_offered`** на unsaved quick-entry → событие с `consultationSessionId`, **без** требования `dealId`.

---

## Чеклист D11 §7 (трассировка AC-UX-*)

| AC-ID | Где пройти в прототипе |
|-------|------------------------|
| AC-UX-S01 | sales → «Новый проект» |
| AC-UX-S02 | sales → Быстрый расчёт / Calc в комнате → bind/save в нужную комнату |
| AC-UX-S03 | project → Сделка: Copy/PDF vs «Подтвердить отправку» |
| AC-UX-S04 | Сделка → Пауза → Возобновить (тот же dealId + этап) |
| AC-UX-M01 | measurer → Мои замеры (1 клик с home) |
| AC-UX-M02 | measurer → Detailed → save → комната с revision |
| AC-UX-C01 | crew home: только ordered+tech-ready (кухня deferred отсутствует) |
| AC-UX-C02 | install → чек-лист / вкладка Препятствие |
| AC-UX-O01 | owner Сегодня → inbox item |
| AC-UX-O02 | owner → Назначить → сохранить |
| AC-UX-A01 | admin Сигналы → partner card (stage на сигнале) |
| AC-UX-A02 | partner → diagnose → intervention → verify |

Подробный прогон: [`TEST_CHECKLIST.md`](./TEST_CHECKLIST.md).  
Честный smoke (не user testing): [`SMOKE_TEST.md`](./SMOKE_TEST.md).

---

## Состояния

- **Empty:** нет КП / нет заданий crew / пустой inbox measurer.  
- **Loading:** можно временно подставить `MFViews.loadingView` (демо-скелетон в коде).  
- **Error:** bind/create при офлайне; close install при blocker/incomplete checklist.  
- **Offline:** тумблер в chrome — блокирует inquiry/bind.

---

## Что residual / не в этом срезе

- Полный objections trainer и не-чат слоты Академии — заглушки слотов.  
- Two-device 409 calc concurrency — только концепт в спеках, не интерактив.  
- Pixel-perfect / a11y audit / реальный user testing — вне smoke.  
- A-05 waiver, A-07 confirm без канала, A-28 пороги StP — не owner-approved.

---

## Файлы

```
docs/partner-ux-prototypes/
  index.html
  README.md
  TEST_CHECKLIST.md
  SMOKE_TEST.md
  assets/proto.css
  assets/store.js
  assets/views.js
  assets/app.js
```
