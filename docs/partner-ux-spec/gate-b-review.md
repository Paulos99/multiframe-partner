# Gate B — резюме для заказчика

**Revision:** `rev-gate-b-draft-1`  
**Дата:** 2026-10-22  
**После:** Gate A `rev-gate-a-approved-20261022` (условно, ADR-008)  
**Статус:** черновик Gate B на ваше ревью. **Gate C и код не начаты.**

---

## 1. Что сделано

Полный комплект D4–D11 + assumptions + ADR-008 + снимок Gate A.

| Блок | Суть |
|------|------|
| **D4** | Screen specs: 5 homes, nav, projects, project, room, inquiry, tools, calc-save, PM, quote/deal, install, academy, support, analytics |
| **D5** | Целевая модель; инварианты Deal/Quote/Project; gaps vs `packages/shared` + API; миграции |
| **D6** | PM потолочники: без вопроса типа потолка; next steps с контекстом; ядро не ломаем |
| **D7** | Calc: walls вне UI; prelim+detailed; Save/bind; anti-loss; связь с КП |
| **D8** | Коммерческий путь целиком: early loss → КП → partial → sequential new dealId |
| **D9** | Академия: чат-продажи + слоты не-чат; training ≠ KPI |
| **D10** | StP контур 5 шагов; learning vs sales |
| **D11** | 35 измеримых AC; запрет Done по «экран есть / CI green» |

---

## 2. Неизменные решения Gate A (кратко)

- Project→Rooms; одна активная Deal; после closed — **новый dealId**.  
- Quote sent immutable; N+1 на **конкретной Deal**.  
- Закрытие Deal ≠ завершение Project при deferred.  
- §8 (1–14) сохранены.

---

## 3. Главные gaps к коду (не чинить сейчас)

- `dealId` на Quote nullable; version per project.  
- Нет `roomAssent` / early_* / checklist в shared.  
- `canManageStaff(sales)=true` vs §8.11.  
- UI homes = стеки (целевой UX в D4).

---

## 4. Assumptions

Сводный список: [assumptions.md](./assumptions.md). Всё, что не §8/ADR — помечено Assumption.

---

## 5. Просьба к заказчику

1. Подтвердить Gate B (или точечные замечания по D4–D11).  
2. Особенно: пороги StP (A-28), waive чек-листа (A-05), политика закрытия Deal после partial (A-06).  
3. После OK — Gate C (wireframes + HTML prototypes). **Не** начинать код до вашего «можно в код».

Ссылки: [README](./README.md) · [handoff](./gate-b-handoff-report.md) · [self-review](./gate-b-self-review.md)
