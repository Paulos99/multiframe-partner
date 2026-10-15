# Анонимная аналитика Проблемомера

Собираем **только метрики**: воронка, каналы, CTA, сегменты спроса.  
**Не собираем** лиды, телефоны, имена, CRM.

**Для внешней команды маркетинга** (хостинг, секреты, подключение Метрики и таблицы без кода): см. [ИНСТРУКЦИЯ_ДЛЯ_МАРКЕТИНГА.md](ИНСТРУКЦИЯ_ДЛЯ_МАРКЕТИНГА.md).

## Переменные окружения

| Переменная | Назначение |
| ---------- | ---------- |
| `VITE_YM_ID` | ID счётчика Яндекс.Метрики. Без неё баннер cookies не показывается. |
| `VITE_ANALYTICS_INGEST_URL` | HTTPS URL для `POST` JSON при достижении Result. Без неё в `dev` пишется в console. |

Для GitHub Pages задайте repository secrets с теми же именами — workflow прокидывает их в `npm run build`.

## События Метрики (цели)

Создайте цели типа «JavaScript-событие» с именами:

| Goal | Когда |
| ---- | ----- |
| `pm_start` | Переход Start → Room |
| `pm_room_step` | Смена вопроса Room |
| `pm_result_view` | Показан Result |
| `pm_cta_calc` | Клик «Рассчитать…» |
| `pm_cta_consult` | Клик «Запросить консультацию…» |
| `pm_share` | Поделиться |
| `pm_pdf` | Скачать PDF |
| `pm_audio_play` | Play До/После |

Параметры: `channel`, `houseType`, `objectStage`, `roomType`, `classBefore`, `classAfter`, …

## Каналы (шаблон ссылок)

База (Pages): `https://paulos99.github.io/multiframe-problemomer/`

| Канал | Пример |
| ----- | ------ |
| Реклама Яндекс | `?utm_source=yandex&utm_medium=cpc&utm_campaign=multiframe_comfort` |
| Сайт StP | `?utm_source=stp&utm_medium=site&utm_campaign=problemomer` |
| Партнёр | `?ref=partner_acme` или `?ref=partner_acme&utm_source=partner&utm_medium=referral` |
| Менеджер / QR | `?mgr=ivan` |
| Офлайн раздатка | `?utm_source=print&utm_medium=offline&utm_campaign=expo2026` |

Метка first-touch сохраняется в `sessionStorage` на вкладку и уходит во все события и в ingest.

## Payload ingest (`buildAnalyticsPayload`)

```json
{
  "source": "problemomer",
  "sessionId": "uuid",
  "channel": { "utm_source": "…", "ref": "…", "mgr": "…" },
  "channelLabel": "ref:partner_acme",
  "timestamp": "2026-10-09T21:00:00.000Z",
  "room": { "houseType": "panel", "ceilingAreaM2": 18, "…": "…" },
  "sim": {
    "before": { "Rw": 46, "Lnw": 72, "air": "V", "impact": "below", "hybrid": "below" },
    "after": { "Rw": 52, "Lnw": 66, "air": "B", "impact": "V", "hybrid": "V" },
    "delta": { "Rw": 6, "Lnw": -6 },
    "perceivedAirPct": 35,
    "perceivedImpactPct": 28
  }
}
```

Контактных полей нет.

## Пример приёмника: Google Apps Script → Sheet

1. Создайте таблицу с заголовками в строке 1:  
   `timestamp | sessionId | channelLabel | houseType | roomType | area | objectStage | classBefore | classAfter | deltaRw | deltaLnw | json`
2. Расширения → Apps Script → вставьте код из [`analytics-ingest.gs`](analytics-ingest.gs).
3. Разверните как веб-приложение: **Выполнять от имени меня**, доступ **всем**.
4. URL деплоя → `VITE_ANALYTICS_INGEST_URL`.

## Политика

Краткая страница: [`/privacy.html`](../public/privacy.html) (на Pages: `…/multiframe-problemomer/privacy.html`).
