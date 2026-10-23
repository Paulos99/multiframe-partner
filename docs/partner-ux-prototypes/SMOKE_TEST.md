# Gate C — smoke-test отчёт (агент)

**Это не user testing.** Ниже — технический прогон кликабельных путей агентом/скриптом для ловли поломок. Не выдавать за наблюдаемую usability с людьми (D11 §7 observed = отдельный прогон по `TEST_CHECKLIST.md`).

| Поле | Значение |
|------|----------|
| Дата | 2026-10-23 |
| Контур | `docs/partner-ux-prototypes/` · file/http static |
| Ветка | `cursor/partner-ux-spec-gate-b-chatgpt` |
| Вердикт smoke | **PASS with notes** (ready for human review) |
| Логический store smoke | **18/18 PASS** (node VM против `store.js`) |
| Визуальный прогон | screenshots `/opt/cursor/artifacts/screenshots/gate-c-0*.png` |

## Пройденные пути

| # | Путь | Результат | Notes |
|---|------|-----------|-------|
| 1 | Login → 5 ролей доступны | PASS | |
| 2 | sales: inquiry create → project | PASS | |
| 3 | sales: quick → PM → Calc → Bind → deal tab | PASS | `consultationSessionId` на offer |
| 4 | sales: quote copy ≠ confirm_sent | PASS | toasts разведены |
| 5 | sales: pause → resume same dealId + stageAtOutcome | PASS | |
| 6 | measurer: home → room → detailed save → room | PASS | |
| 7 | crew: inbox tech-ready only → checklist / blocker / close gate | PASS | deferred kitchen hidden |
| 8 | owner: inbox → assign save | PASS | |
| 9 | admin: signal → diagnose → intervention → verify | PASS | training route separate |
| 10 | academy Anna path to feedback | PASS | Path S/F reachable |
| 11 | offline toggle blocks bind/inquiry | PASS | |
| 12 | ADR-003: project uses tabs not stack | PASS | visual/code review |

## Residual / known gaps

- Objections / non-chat academy slots — placeholders.  
- Loading skeleton не вшит в каждый переход (есть helper).  
- Нет автоматизированного e2e в CI (намеренно: docs-only Gate C).  
- Шрифты Google Fonts — нужен сеть; fallback system есть частично через CSS stack.

## Запреты соблюдены

- [x] Нет правок `apps/*`, `packages/*`  
- [x] Нет merge / deploy / Gate D  
- [x] Прототип не объявлен production proof  
