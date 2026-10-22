# Gate B — саморевью (10 пунктов заказчика)

**Revision:** `rev-gate-b-draft-1`  
**Дата:** 2026-10-22  
**Проход:** 2 (после правок Gate A ADR-008 + сверки D4–D11)

---

## Чеклист

| # | Критерий | Вердикт | Комментарий / фикс |
|---|----------|---------|-------------------|
| 1 | Согласованность D0–D11 | **PASS** | Иерархия Project→Rooms→Deal[]→Quote; ссылки D6/D7↔D8; D11↔D2/D3 |
| 2 | Соответствие Gate A / §8 / ADR-008 | **PASS** | Новый dealId; Quote на Deal; Project≠Deal closed; §8.1–14 не ломались |
| 3 | 5 ролей (home/nav/RBAC) | **PASS** | D4 homes + D2a + D5 RBAC; crew без commercial total; sales без staff create |
| 4 | Переходы / no re-entry хаоса | **PASS** | Quick-entry порядок ADR-007; sequential = create; sent→N+1 не patch |
| 5 | Реализм потолочников (D6/D7) | **PASS** | Нет типа потолка в main; walls out; prelim≠detailed; next steps с контекстом |
| 6 | Empty / error / offline | **PASS** | В каждом D4 экране; anti-loss D7; outbox D5 |
| 7 | RBAC глубина | **PASS** | D4+D5+D11 RBAC-negative; gap canManageStaff зафиксирован |
| 8 | AC depth (не «экран есть») | **PASS** | D11: 35 AC с доказательством и не-доказательством |
| 9 | Готовность к Gate C без догадок сценариев | **PASS with notes** | Сценарии D6–D9 + D4 каркас достаточны для wireframes; pixel copy — Gate C |
| 10 | Нет изобретения SoT / ломки архитектуры | **PASS** | Новых ADR кроме 008 нет; 008 уточняет A, не ломает |

---

## Найденное и исправленное в ходе ревью

1. **Фундаментально (Gate A):** Project `Done` от `deal_closed` — исправлено в D3 + ADR-008 **до** Gate B.  
2. Quote N+1 без обязательного dealId — ADR-008 + D1/D5/D8.  
3. §8 таблица восстановлена в gate-a-review (полный список 1–14 + A1–A3).  
4. D5 явно фиксирует gaps shared/API (early_*, roomAssent, staff RBAC, quote versioning).

---

## Остаточные риски (не блокеры черновика B)

| Риск | Митигация |
|------|-----------|
| Пороги StP (Assumption) оттолкнут пилот | Вынести на OK заказчика в gate-b-review §5 |
| Atomic create project+room+deal | D5 Assumption; иначе orphan риск |
| Measurer POST /quotes в API vs продукт | D5 gap; D2: confirm_sent только sales/owner |
| D4 без pixel — агент Gate C может «украсить» | Следовать иерархии viewport + ADR-003 |

---

## Подтверждения

- Продуктовый код (`apps/*`, `packages/*`) **не изменялся**.  
- Gate C (HTML/wireframes реализации) **не начат**.  
- Качество: сценарии важнее списков компонентов — D6/D8/D9 построены как сценарии.
