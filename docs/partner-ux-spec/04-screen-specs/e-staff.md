# E-staff — Сотрудники организации

**Revision:** `rev-gate-b-draft-2` · **Gate B · NOT approved**

## Кто
owner: create / reset credentials / roles.  
sales: **assign only** (выбор assignee на Deal/Room) — не create staff (§8.11 / D5 RBAC).

## Зачем
Управление пользователями org; one-time password показ один раз.

## Вход
Nav «Сотрудники» (owner); assign pickers на E-project-deal (sales — read list).

## Иерархия
1. Список сотрудников (роль, статус)  
2. Create / reset sheet (owner)  
3. One-time credentials banner (copy once)

## CTA
Добавить · Сбросить пароль · Деактивировать (owner).

## Данные
SessionUser; orgId isolation; password hash never re-shown.

## Состояния
empty first employee; error; offline read-only list.

## RBAC
sales: canManageStaff=false (gap в shared сегодня — D5).  
admin StP: не manage чужой staff как CRM.

## AC
- AC-ST-01: sales POST create staff → 403  
- AC-ST-02: plaintext password не в повторном view  
- AC-ST-03: нельзя назначить user чужой org  
