# Changelog: `rev-gate-a-final-candidate` → `rev-gate-a-approved-20261022`

**Дата:** 2026-10-22  
**SHA `main`:** `953be7ed7ddc1bddd1a2c0834ccee6cdeec47fbf`

Три обязательные корректировки заказчика после final-candidate. Архитектура §8 не ломалась — уточнена **идентичность** сущностей.

| # | Было (риск двусмысленности) | Стало | Почему |
|---|----------------------------|-------|--------|
| 1 | «Следующая sequential Deal» без явного нового id; UX `closed→contact` читался как reopen | После `closed` — **новый `dealId`**; закрытая Deal **неизменна** в истории проекта | История outcome / сумма / StP-аудит |
| 2 | N+1 QuoteRevision без жёсткой привязки к Deal | Sent immutable; N+1 = **новый экземпляр**, `dealId` обязателен (на **конкретной** Deal) | Не смешивать КП разных нитей; не patch sent |
| 3 | Project UX `Done` после `deal_closed` | Закрытие одной Deal **≠** завершение Project при deferred / следующих заказах | Адрес клиента живёт дольше одной коммерческой нити |

**Документы обновлены:** D0, D1, D2, D2a, D3, ADR-004, ADR-008 (новый), gate-a-review, README, adr/README.  
**Снимок:** `docs/revisions/rev-gate-a-approved-20261022/`.  
**Статус:** Gate A согласован **условно** с этими тремя правками → разрешён переход к Gate B.
