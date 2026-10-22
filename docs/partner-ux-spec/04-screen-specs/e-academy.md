# E-academy — Академия (хаб)

**Revision:** `rev-gate-b-draft-1` · **Gate B** · зависит от [D3](../03-information-architecture.md)

## Кто
Все роли; P0 тренажёры продаж — sales/owner.

## Зачем
Обучение навыкам; training ∉ KPI продаж.

## Вход
Nav Обучение.

## Иерархия viewport (одна работа)
1. Хаб навыков (продажи · монтаж · расчёт)  
2. Список тренажёров P0 (чат-продажи)  
3. Прогресс обучения (отдельный контур)  
**Не** смешивать с боевыми Deal.

## CTA (primary → secondary)
Primary: Продолжить тренажёр. Secondary: Материалы.

## Данные
TrainingProgress; scenario version; context=training events.

## Переходы
→ chat trainer / visual trainer (D9); назад без записи в Deal funnel.

## Состояния
empty: CTA начать первый; offline: скачанный сценарий если есть.

## Mobile
Desktop+mobile chat UI.

## RBAC
Все читают хаб; admin видит training analytics отдельно.

## Acceptance Criteria
- AC-A-01: training events не в Deal conversion  
- AC-A-02: хаб не выглядит как список только чатов без слотов не-чат  
Детали — D9.

