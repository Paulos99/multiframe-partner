# E-room-docs — Документы и версии комнаты

**Revision:** `rev-gate-b-draft-2` · **Gate B APPROVED 2026-10-23**  
**Alias:** часть документов с E-room; канон ID = `E-room-docs`

## Кто
sales, owner, measurer (read); crew — схема/смета tech **без** коммерческих итогов КП.

## Зачем
Одна работа: просмотр/скачивание версий сметы, профиля PM, истории CalculationRevision (не редактор calc).

## Вход
E-room → «Документы» / «История расчётов».

## Иерархия
1. Заголовок комнаты + project crumb  
2. Список документов: estimate / profile / scheme PDF — с типом calc и revision  
3. Деталь выбранной revision (preview / download)  
4. При conflict history: обе ветки помечены

## CTA
Открыть PDF · Скачать · «Сравнить с текущим» · «Новый расчёт» → E-calc (не inline edit sent quote).

## Данные
Room documents append-only; CalculationRevision[]; acousticProfile versions; **не** QuoteRevision body (КП — на E-project-deal).

## Состояния
empty: «Ещё нет сохранений — сделайте расчёт»; offline: local copies; error: retry.

## Mobile
List → detail sheet.

## RBAC
Crew: redact quote commercial amounts; scheme/tech estimate ok per D2.

## AC
- AC-RD-01: после второго save видна предыдущая revision  
- AC-RD-02: sent Quote не editable отсюда  
- AC-RD-03: crew не видит quote amount  
