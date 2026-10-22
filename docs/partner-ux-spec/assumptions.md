# Assumptions — сводный список (Gate B)

**Revision:** `rev-gate-b-draft-1`  
**Правило:** всё ниже — **Assumption** (не утверждено заказчиком). Утверждённые решения — §8 Gate A + ADR-008.

---

## Продукт / процесс

| ID | Assumption | Источник |
|----|------------|----------|
| A-01 | Inbox home показывает ≤8 next actions | D4 home |
| A-02 | Политика видимости проектов measurer: свои + assigned (не все org) | D4 projects |
| A-03 | Явный archive проекта (не авто из Deal closed) | D3/D5 |
| A-04 | Open blocker блокирует `room.closed` | D4 install / D11 |
| A-05 | Waive чек-листа — редко, только owner + reason | D5/D8 |
| A-06 | Sales явно закрывает Deal после монтажа ordered; не авто из last room.closed | D8 |
| A-07 | confirm_sent: warning (не hard-block), если способ передачи в sentComment | D8 |
| A-08 | Один справочник lossReason для early и post-quote | D8 |
| A-09 | Авто-advance Deal.stage при PM/calc save vs только ручной — единый выбор в реализации по D5; UI может показывать derived | D6/D7/D8 |
| A-10 | Snapshot-поля Quote: amounts, roomIds, calcType/room, doc refs (точный JSON — при реализации) | D5/D8 |

## Данные / sync

| ID | Assumption | Источник |
|----|------------|----------|
| A-11 | Atomic create Project+Room+Deal | D5 |
| A-12 | Offline: last-write-wins + warning | D5/D7 |
| A-13 | SessionDraft TTL 7 дней | D5 |
| A-14 | История calc ≥5 save / 30 дней хранится | D7 |
| A-15 | Quote version monotonic **per dealId** | D5 |
| A-16 | Admin repair closed Deal — не P0 | D5 |
| A-17 | draftId / Idempotency-Key на POST критичных операций | D5/D7 |

## PM / Calc

| ID | Assumption | Источник |
|----|------------|----------|
| A-18 | Пол сверху = unknown по умолчанию в кабинетном пресете | D6 |
| A-19 | Расширенный режим не-натяжного — вне main path | D6 |
| A-20 | ≥1 версия answers на комнате | D6 |
| A-21 | Start PM в кабинете можно схлопнуть | D6 |
| A-22 | Wall escape hatch не P0 | D7 |
| A-23 | Host calc UI может смениться; контракт Save стабилен | D7 |

## Академия / StP

| ID | Assumption | Источник |
|----|------------|----------|
| A-24 | Порог сдачи тренажёра ≥70; равные веса рубрики | D9 |
| A-25 | P0: один NPC за прохождение; objections = 3 секции | D9 |
| A-26 | LLM не обязателен в P0 (скриптовое дерево) | D9 |
| A-27 | Calc/install sandbox — отдельный storage | D9 |
| A-28 | Пороги сигналов StP: 28д / N≥5 / stall 40% / tool 0.3 / offer 0.5 | D10 |
| A-29 | Гипотеза «почему не MF» — вручную admin | D10 |
| A-30 | Окна verify 14+14 дней | D10 |
| A-31 | Диагностика admin без списка ФИО клиентов | D10 |
| A-32 | Proactive Intervention без SupportCase допустима | D10 |

## Приёмка

| ID | Assumption | Источник |
|----|------------|----------|
| A-33 | Пока нет pixel Gate C, AC ссылаются на E-* из D3/D4 | D11 |
| A-34 | RBAC-negative проверяются на API+UI | D11 |
| A-35 | Export аналитики — P1 | D4 analytics |
