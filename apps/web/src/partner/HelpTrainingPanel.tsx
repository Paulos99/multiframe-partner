import { useMemo, useState } from 'react';
import { ROLE_LABELS, type UserRole } from '../../../../packages/shared/partner';
import { MaterialsPanel } from './MaterialsPanel';
import { OfflineGearSlot } from './offlineGearSlot';
import styles from './HelpTrainingPanel.module.css';

type HelpSection = {
  id: string;
  title: string;
  lead: string;
  steps: string[];
  cannot: string[];
};

const COMMON: HelpSection = {
  id: 'common',
  title: 'С чего начать',
  lead: 'Вход, инструменты и общий планшет.',
  steps: [
    'Войдите под своим логином. После входа откроется кабинет вашей роли.',
    '«Проблемомер» и «Калькулятор» открываются с экрана «Сегодня» и из комнаты.',
    'Проблемомер — аргумент для клиента (комфорт комнаты). Калькулятор — количество панелей и крепежа.',
    'На общем планшете после работы нажмите «Выйти» — следующий сотрудник не увидит вашу сессию.',
    'Без сети можно сохранить замер: значок ↻ показывает очередь. При появлении интернета нажмите «Синхронизировать» или дождитесь автоотправки.',
    'Установите кабинет на телефон: Chrome — «Установить приложение», iPhone — «Поделиться → На экран Домой».',
  ],
  cannot: [
    'Не оставляйте чужой логин открытым на планшете в шоуруме или на объекте.',
    'Не ждите, что чужой телефон сам «подтянет» ваши локальные черновики — нужен общий облачный вход.',
  ],
};

const BY_ROLE: Record<UserRole, HelpSection> = {
  admin: {
    id: 'admin',
    title: 'Ваша работа · Админ StP',
    lead: 'Компании сети и обзор регионов.',
    steps: [
      '«Партнёры» → «Добавить» — логин владельца, пароль, компания и город из справочника, например «Шуя — Ивановская область».',
      'Произвольный текст вроде «ГГ» не сохранится. Старый город не из справочника виден в списке и подсвечен, пока не выберете замену.',
      'Во вкладке «Партнёры» смотрите список, меняйте город, сбрасывайте пароль или удаляйте организацию целиком.',
      '«Аналитика» — воронка сети, города и активность партнёров.',
      '«Обучение» — методички. Папки и файлы меняет только админ.',
    ],
    cannot: [
      'Не меняйте корпоративный прайс партнёра из админ-кабинета — это делает владелец компании.',
      'Не раздавайте пароль admin сотрудникам партнёров.',
    ],
  },
  owner: {
    id: 'owner',
    title: 'Ваша работа · Владелец',
    lead: 'Прайс, команда и проекты компании.',
    steps: [
      '«Сегодня» показывает ближайшие комнаты и одну кнопку следующего шага.',
      'Вкладка «Компания» — название, город, РРЦ панели и м², монтаж, дюбели.',
      '«Сотрудники» — создайте менеджера, замерщика и монтажников. Карточка сотрудника открывается своей страницей. У каждого монтажника свой логин.',
      '«Проекты» — список и канбан. Комната открывается со страницы проекта.',
      'Назначьте комнату замерщику или бригаде в поле «Исполнитель».',
    ],
    cannot: [
      'Не выдавайте всем одну роль «замерщик» — монтажнику нужна своя роль, чтобы видеть только свои задания.',
      'Не держите один пароль на всю фирму: при увольнении смените доступ точечно.',
    ],
  },
  sales: {
    id: 'sales',
    title: 'Ваша работа · Менеджер',
    lead: 'Проекты, комнаты и КП.',
    steps: [
      '«Сегодня» — ближайшие комнаты. «Собрать КП» открывает комнату в статусе «Замер».',
      '«Проекты» — список и канбан. Новая комната остаётся черновиком, пока статус не сменят на её странице.',
      'В карточке комнаты меняйте статус и назначайте исполнителя.',
      'Калькулятор считает только потолок MultiFrame по РРЦ компании.',
    ],
    cannot: [
      'Прайс компании и список сотрудников меняет только владелец.',
      'Не оставляйте черновик без адреса — бригада и владелец не найдут комнату на месте.',
    ],
  },
  measurer: {
    id: 'measurer',
    title: 'Ваша работа · Замерщик',
    lead: 'Замер назначенной комнаты.',
    steps: [
      'На «Сегодня» откройте назначенную комнату.',
      '«Проблемомер» — вопросы для рекомендации по потолку. «Калькулятор» — панели и крепёж.',
      '«Сохранить» в Проблемомере записывает профиль в уже созданную комнату.',
      'Новый проект создаёт менеджер или владелец.',
    ],
    cannot: [
      'Аналитику чужих сделок и настройки прайса вы не открываете — это нормально.',
      'Не обещайте клиенту «лабораторный» замер — проблемомер даёт ориентир комфорта, не сертификат.',
    ],
  },
  crew: {
    id: 'crew',
    title: 'Ваша работа · Монтажник',
    lead: 'Только назначенные комнаты.',
    steps: [
      'На «Сегодня» — ближайшие комнаты. В «Проектах» список без канбана: адрес, комната, площадь, панели и статус. Комната открывается своей страницей.',
      'Откройте «Смету»: панели, крепёж и схема раскладки. «Профиль» — акустика комнаты.',
      'Статус меняет менеджер или владелец.',
      'После смены нажмите «Выйти», если планшет общий.',
    ],
    cannot: [
      'Аналитику компании вы не видите. Сумму КП в карточке тоже скрываем.',
      'Новый проект и удаление комнаты — у менеджера и владельца.',
    ],
  },
};

function SectionBlock({ section, highlight }: { section: HelpSection; highlight?: boolean }) {
  return (
    <details open={highlight}
      className={highlight ? `${styles.section} ${styles.mine}` : styles.section}
      aria-labelledby={`help-title-${section.id}`}
    >
      <summary className={styles.sectionHead}>
        <h3 id={`help-title-${section.id}`}>{section.title}</h3>
        {highlight ? <span className={styles.badge}>Ваша роль</span> : null}
      </summary>
      <p className={styles.lead}>{section.lead}</p>
      <ol className={styles.steps}>
        {section.steps.map((step) => (
          <li key={step}>{step}</li>
        ))}
      </ol>
      {section.cannot.length ? (
        <div className={styles.note}>
          <strong>Важно</strong>
          <ul>
            {section.cannot.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </details>
  );
}

/** Обучение: кабинет своей роли и методические материалы продукта. */
export function HelpTrainingPanel({ role }: { role: UserRole }) {
  const personal = useMemo(() => BY_ROLE[role], [role]);
  const [section, setSection] = useState<'materials' | 'cabinet'>('materials');
  const [gearSlot, setGearSlot] = useState<HTMLElement | null>(null);

  return (
    <OfflineGearSlot.Provider value={gearSlot}>
    <div className={styles.panel}>
      <div className={styles.head}>
        <h2>Обучение</h2>
        <div ref={setGearSlot} className={styles.gearSlot} />
      </div>
      <div className={styles.tabs} role="tablist" aria-label="Разделы обучения">
        <button
          type="button"
          role="tab"
          id="help-tab-materials"
          aria-selected={section === 'materials'}
          aria-controls="help-panel-materials"
          className={section === 'materials' ? styles.tabOn : styles.tab}
          onClick={() => setSection('materials')}
        >
          Материалы
        </button>
        <button
          type="button"
          role="tab"
          id="help-tab-cabinet"
          aria-selected={section === 'cabinet'}
          aria-controls="help-panel-cabinet"
          className={section === 'cabinet' ? styles.tabOn : styles.tab}
          onClick={() => setSection('cabinet')}
        >
          Кабинет
        </button>
      </div>
      {section === 'materials' ? (
        <div id="help-panel-materials" role="tabpanel" aria-labelledby="help-tab-materials">
          <MaterialsPanel canManage={role === 'admin'} />
        </div>
      ) : (
        <div id="help-panel-cabinet" role="tabpanel" aria-labelledby="help-tab-cabinet">
          <p className={styles.lead}>Для роли «{ROLE_LABELS[role]}».</p>
          <SectionBlock section={COMMON} />
          <SectionBlock section={personal} highlight />
        </div>
      )}
    </div>
    </OfflineGearSlot.Provider>
  );
}
