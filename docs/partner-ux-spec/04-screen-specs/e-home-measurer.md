# E-home-measurer — Home замерщика

**Revision:** `rev-gate-b-draft-2` · **Gate B · APPROVED 2026-10-23** · aliases: часть `E-home`

## Кто / зачем
Measurer: найти назначенную комнату, сделать detailed, сохранить и вернуться.

## Первый viewport
1. «Мои замеры»  
2. Inbox: rooms assigned / draft / measured без detailed / detailed pending sync  
3. Primary CTA: **Продолжить комнату** (первая в inbox) · Secondary: **Новый с поля** (quick calc → bind)

## Приоритет
1. pendingSync / conflict 409  
2. assigned без detailed  
3. measured → tech-ready gap (материалы — для sales/owner, но флаг виден)  
4. drafts

## CTA → destination
| CTA | Destination |
|-----|-------------|
| Продолжить комнату | E-room → E-calc detailed |
| Save | [E-calc-save](./e-calc-save.md) → back E-room |
| Новый с поля | E-calc quick → bind |

## Скрыто
Deal outcome editing; quote amounts as primary; staff; network admin; create staff.

## Состояния
empty: «Нет назначенных замеров» + связь с owner/sales; offline: local drafts; first-time: tip «откройте комнату из списка».

## Mobile
Mobile-first: inbox → room → calc → back.

## AC
- AC-HM-01: primary путь = assigned room → detailed save → room  
- AC-HM-02: conflict 409 показан в inbox  
- AC-HM-03: нет коммерческого стека на home  
