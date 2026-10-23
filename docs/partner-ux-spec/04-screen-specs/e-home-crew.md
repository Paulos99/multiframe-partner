# E-home-crew — Home бригады

**Revision:** `rev-gate-b-draft-2` · **Gate B APPROVED 2026-10-23** · aliases: часть `E-home`

## Кто / зачем
Crew: найти своё задание (ordered + tech-ready), схему/чек-лист, зафиксировать blocker.

## Первый viewport
1. «Мои задания»  
2. Inbox: только rooms с assignment=me AND roomAssent=ordered AND tech-ready  
3. Primary CTA: **Открыть монтаж** (первое задание)

## Приоритет
1. Open / in-progress install  
2. Blocked (свои)  
3. Новые assignments

## CTA → destination
| CTA | Destination |
|-----|-------------|
| Открыть монтаж | [E-room-install](./e-install.md) (`E-install`) |
| Blocker | E-room-install → blocker sheet |

## Скрыто
PM/Calc persist; quote amounts; Deal outcome; deferred / unknown / needs_review rooms; preliminary-only rooms; staff; analytics.

## Состояния
empty: «Нет заданий» (не «создайте проект»); offline: checklist local + sync later.

## Mobile
Mobile-first checklist.

## AC
- AC-HC-01: deferred/unknown/needs_review **не** в inbox  
- AC-HC-02: нет сумм КП  
- AC-HC-03: blocker path ≤2 taps from home  
