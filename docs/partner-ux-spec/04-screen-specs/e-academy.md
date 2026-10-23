# E-academy-hub — Академия (хаб)

**Revision:** `rev-gate-b-draft-2` · **Gate B APPROVED 2026-10-23** · alias: `E-academy`  
**Зависит от:** [D3](../03-information-architecture.md), [D9](../09-academy.md)

## Кто
Все роли; P0 тренажёры продаж — sales/owner.

## Зачем
Обучение навыкам; training ∉ KPI продаж.

## Вход
Nav Обучение.

## Иерархия viewport (одна работа)
1. Хаб навыков (продажи · монтаж · расчёт) с **типом** механики  
2. Список тренажёров P0 (чат-продажи)  
3. Прогресс обучения (отдельный контур)  
**Не** смешивать с боевыми Deal.

## CTA (primary → secondary)
Primary: Продолжить тренажёр. Secondary: Материалы · Справка.

## Данные
TrainingProgress; scenario version; context=training events.

## Переходы
→ chat trainer / visual trainer (D9); назад без записи в Deal funnel.

## Состояния
empty: CTA начать первый; offline: скачанный сценарий если есть.

## Mobile
Desktop+mobile chat UI.

## RBAC
Все читают хаб; admin видит training analytics отдельно ([E-analytics-training](./e-analytics-training.md)).

## §materials (merged E-materials)
Библиотека STP PDF/видео рядом с хабом; open ∉ sales KPI; не подменяет тренажёр.

## §help (merged E-help-cabinet)
Краткая справка «как работать в IA»; ссылки на D3 паттерны next step; не Academy attempt.

## Acceptance Criteria
- AC-A-01: training events не в Deal conversion  
- AC-A-02: хаб не выглядит как список только чатов без слотов не-чат  
- AC-A-03: скрипт D9 §4.2.1 проходим с тремя траекториями  
Детали — D9.

