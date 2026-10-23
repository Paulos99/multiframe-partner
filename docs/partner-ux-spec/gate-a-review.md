# Gate A — пакет согласован условно

**Revision:** `rev-gate-a-approved-20261022`  
**Дата:** 2026-10-22  
**SHA аудита `main`:** `953be7ed7ddc1bddd1a2c0834ccee6cdeec47fbf`  
**Снимок:** [revisions/rev-gate-a-approved-20261022/](./revisions/rev-gate-a-approved-20261022/)  
**Changelog candidate→approved:** [gate-a-changelog-final-candidate-to-approved.md](./gate-a-changelog-final-candidate-to-approved.md)  
**Changelog draft-2→candidate:** [gate-a-changelog-draft-2-to-final-candidate.md](./gate-a-changelog-draft-2-to-final-candidate.md)

> **Gate A согласован условно** с тремя корректировками идентичности (Deal / QuoteRevision / Project).  
> Gate B разрешён. Продуктовый код и Gate C — по-прежнему запрещены до явного OK на Gate B.

Оглавление: [README.md](./README.md).

---

## 1. Резюме архитектуры

MultiFrame Партнёр для **потолочных компаний** — одна платформа с общей IA:

- **Проект** → **Комнаты** (замер, PM, preliminary/detailed calc, монтаж с чек-листом).  
- **Одна активная Deal**; после closed — **новый `dealId`** (sequential); закрытая Deal неизменна; **закрытие Deal ≠ завершение Project** при deferred / следующих заказах.  
- **SoT:** outcome и stage на Deal; QuoteRevision **на Deal**; sent = immutable; N+1 = новый экземпляр; room = исполнение; конверсия = `outcome=accepted` (+ отдельно сумма).  
- **Quick-entry:** tool → result → Save → pick/create room → persist.  
- **Tech-ready** перед install.  
- Роли, StP-контур, Академия — без изменений vs final-candidate (см. §8).

Ключевые решения: [adr/](./adr/) (001–008). Три правки: [ADR-008](./adr/008-deal-quote-project-identity.md).

---

## 2. Карта экранов (сжато)

| Кластер | Экраны |
|---------|--------|
| Вход / home | Login, Home (inbox + новый проект / quick-entry) |
| Операции | Проекты → Проект → Комната / Сделка / Монтаж |
| Инструменты | PM, Calc; E-quick-bind при Save без контекста |
| Орг / сеть | Компания, Staff, Партнёры, PartnerCard, Analytics (+ training отдельно) |
| Обучение | Материалы, Справка, Академия-хаб |

Полная карта: [03-information-architecture.md](./03-information-architecture.md).

---

## 3. Маршруты пяти ролей

Без изменений vs final-candidate (см. таблицу в candidate). Golden path: лид/quick → calc → confirm_sent → outcome → tech-ready → монтаж → closed rooms + closed deal; deferred → **новая Deal (новый dealId)** (S-x-07).

Детали: [02-role-scenarios.md](./02-role-scenarios.md), [02a-responsibility-matrix.md](./02a-responsibility-matrix.md).

---

## 4. Зафиксированные решения заказчика (§8)

Архитектурно и продуктово **утверждено**. Уточнения реализации — residual / Gate B.

| # | Тема | Утверждённое решение |
|---|------|----------------------|
| 1 | Минимум полей до confirm_sent | До confirm_sent **не** требовать телефон/адрес всегда; достаточно **способа передачи** КП. |
| 2 | Передача в монтаж | Монтаж **после** `outcome=accepted` (+ ordered + tech-ready). |
| 3 | Measurer создаёт проект | Measurer **может** создавать проект с поля. |
| 4 | Ярлык `quote_sent` на комнате | Убрать из **нового UI**; совместимость данных сохранить. |
| 5 | Crew и цены | Crew видит **техсмету с ценами**; это **не** клиентское КП. |
| 6 | Admin drill-down / delete | Admin: **агрегаты + ограниченная диагностика**; **без delete** чужих проектов. |
| 7 | Кабинетный vs публичный PM | **Единое ядро**, отдельные UX кабинет vs public. |
| 8 | Академия P0 | **Хаб + тренажёры продаж** сначала; не-чат механики — далее. |
| 9 | Чек-лист | **Обязателен**; N/A **с причиной**; исключения waive — Gate B. |
| 10 | Итог проекта и crew | Crew **не** видит общий коммерческий итог проекта. |
| 11 | Sales и HR | **Staff создаёт owner**; sales — **назначения**. |
| 12 | Detailed у sales | Sales может detailed **при разрешении**. |
| 13 | Повторные заказы | **Последовательные** повторные заказы (sequential Deal) — **в первой версии**; без параллельного multi-order UI. |
| 14 | Конверсия | Конверсия = `outcome=accepted`; **отдельно** — сумма принятого заказа. |

**Дополнительно (approved-правки A1–A3, ADR-008):**

| # | Тема | Решение |
|---|------|---------|
| A1 | Deal identity | После closed — **новый `dealId`**; предыдущая неизменна |
| A2 | QuoteRevision | Sent immutable; N+1 = новый экземпляр на **конкретной Deal** |
| A3 | Project vs Deal | Закрытие Deal ≠ завершение Project при deferred / следующих заказах |

---

## 5. Саморевью согласованности (approved)

| Проверка | Результат |
|----------|-----------|
| D1 иерархия Deal[] → QuoteRevision[] | OK |
| D3 Project: нет Done только от deal_closed | OK (Active при deferred) |
| D3 Deal: closed не reopen; новый dealId | OK |
| D2 S-x-07 / D2a handoff | OK |
| ADR-004 + ADR-008 | Согласованы |
| Фундаментальных новых противоречий | Не найдено |

---

## 6. Residual → Gate B

Snapshot-поля Quote, waive чек-листа, пороги StP, миграция `quote_sent` / nullable `dealId`, screen specs — Gate B (D4–D11).

---

## 7. Состав пакета Gate A

| Doc | Path |
|-----|------|
| README | [README.md](./README.md) |
| Changelog → approved | [gate-a-changelog-final-candidate-to-approved.md](./gate-a-changelog-final-candidate-to-approved.md) |
| D0–D3, D2a | см. README |
| ADR 001–008 | [adr/](./adr/) |
| Снимок | [revisions/rev-gate-a-approved-20261022/](./revisions/rev-gate-a-approved-20261022/) |
