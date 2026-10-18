import { useMemo, useState } from 'react';
import { ROLE_LABELS, type UserRole } from '../../../../packages/shared/partner';
import { MaterialsPanel } from './MaterialsPanel';
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
    'Кнопки «Проблемомер» и «Калькулятор» всегда вверху.',
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
    lead: 'Прайс, команда и все объекты.',
    steps: [
      'Вкладка «Компания» — название, город, РРЦ панели и м², монтаж, дюбели. Сохраните перед замерами команды.',
      '«Сотрудники» — создайте менеджера, замерщика и монтажников. У каждого монтажника свой логин.',
      '«Объекты» — все сделки компании: статус, исполнитель, смета.',
      '«Аналитика» — как команда пользуется проблемомером и калькулятором.',
      'Назначьте объект конкретному монтажнику через поле «Исполнитель» в карточке объекта.',
    ],
    cannot: [
      'Не выдавайте всем одну роль «замерщик» — у монтажника должны быть скрыты цены.',
      'Не держите один пароль на всю фирму: при увольнении смените доступ точечно.',
    ],
  },
  sales: {
    id: 'sales',
    title: 'Ваша работа · Менеджер',
    lead: 'Сделки, КП и отправка клиенту.',
    steps: [
      'Вкладка «Сделки» — ваши и переданные объекты.',
      'Откройте «Проблемомер», пройдите комнату с клиентом, на итоге заполните клиента и адрес.',
      '«Сохранить объект» — замер в кабинете. «Отправить КП» — сводка в мессенджер или буфер и статус «КП отправлено».',
      'В карточке объекта меняйте статус и назначайте исполнителя.',
      'Калькулятор считает материалы по РРЦ компании — уточните комплектацию перед КП.',
    ],
    cannot: [
      'Прайс компании (РРЦ, монтаж) меняет только владелец.',
      'Не оставляйте черновик без адреса и телефона — монтажник и владелец не найдут объект на месте.',
    ],
  },
  measurer: {
    id: 'measurer',
    title: 'Ваша работа · Замерщик',
    lead: 'Замер на объекте за несколько минут.',
    steps: [
      'Нажмите «Проблемомер» → заполните комнату (тип и площадь обязательны) → дождитесь итога.',
      'На экране результата: «Сохранить объект» — имя, телефон, адрес, город.',
      'При слабой сети объект останется на телефоне (↻) и уйдёт менеджеру, когда появится интернет.',
      '«Калькулятор» — количество панелей и крепежа по ценам компании.',
      'Свои черновики смотрите в списке объектов в кабинете.',
    ],
    cannot: [
      'Аналитику чужих сделок и настройки прайса вы не открываете — это нормально.',
      'Не обещайте клиенту «лабораторный» замер — проблемомер даёт ориентир комфорта, не сертификат.',
    ],
  },
  crew: {
    id: 'crew',
    title: 'Ваша работа · Монтажник',
    lead: 'Только ваши задания, без цен.',
    steps: [
      'В кабинете откройте задания на монтаж — видны только объекты, назначенные вам.',
      'Откройте PDF: панели, крепёж и схема раскладки. Суммы КП и РРЦ скрыты.',
      'Отметьте статус «Монтаж» или «Закрыто», когда работа на объекте завершена.',
      '«Калькулятор» показывает только количество, без денежных итогов.',
      'После смены нажмите «Выйти», если планшет общий.',
    ],
    cannot: [
      'Цены, маржу и аналитику вы не видите — даже если открыть калькулятор.',
      'Не создавайте новые объекты — замер и КП делают менеджер или замерщик.',
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

  return (
    <div className={styles.panel}>
      <h2>Обучение</h2>
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
  );
}
