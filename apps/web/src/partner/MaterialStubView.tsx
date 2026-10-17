import { useEffect, useState } from 'react';
import styles from './partner.module.css';

type Slide = { kicker: string; title: string; points: string[] };
type Frame = { time: string; title: string; text: string; hot: 'slab' | 'panel' | 'film' };

const DECKS: Record<string, { eyebrow: string; slides: Slide[] }> = {
  'deck-product': {
    eyebrow: 'Презентация о продукте',
    slides: [
      {
        kicker: 'STP MultiFrame',
        title: 'Звукоизоляционная панель под натяжной потолок',
        points: [
          'Бескаркасная система для квартир и коммерческих помещений.',
          'Ставится до полотна и работает вместе с ним, а не вместо ремонта.',
          'Один контур для замера, сметы и монтажа.',
        ],
      },
      {
        kicker: 'Из чего состоит',
        title: 'Панель, замок и крепёж',
        points: [
          'Модульная панель с контуром шип-паз и замком SmartLock.',
          'Крепление к перекрытию, без долгой стройки каркаса.',
          'Количество панелей и дюбелей считает калькулятор кабинета.',
        ],
      },
      {
        kicker: 'Что слышит клиент',
        title: 'Два эффекта в одной плоскости',
        points: [
          'Снижает ударный и воздушный шум сверху — ориентир до 17 дБ.',
          'Забирает гул и эхо внутри комнаты.',
          'Проблемомер показывает комфорт комнаты, это не лабораторный протокол.',
        ],
      },
      {
        kicker: 'Как продавать',
        title: 'От разговора к объекту',
        points: [
          'Проблемомер — аргумент на объекте за несколько минут.',
          'Калькулятор — панели, крепёж и смета по прайсу компании.',
          'Карточка объекта ведёт сделку до монтажа и закрытия.',
        ],
      },
      {
        kicker: 'Сеть',
        title: 'Один материал, разные роли',
        points: [
          'Владелец держит прайс и команду.',
          'Менеджер и замерщик ведут клиента.',
          'Монтажник видит объёмы без цен.',
        ],
      },
    ],
  },
  'deck-client': {
    eyebrow: 'Презентация для клиента',
    slides: [
      {
        kicker: 'Для дома',
        title: 'Тише сверху и спокойнее в комнате',
        points: [
          'MultiFrame ставят под натяжной потолок.',
          'Соседи сверху слышны слабее, комната меньше гудит.',
          'Это про комфорт жизни, не про «стройку на месяц».',
        ],
      },
      {
        kicker: 'Шум сверху',
        title: 'Шаги, голоса, бытовой шум',
        points: [
          'Панель закрывает перекрытие до полотна.',
          'Ориентир по системе — до 17 дБ. Точную комнату смотрим проблемомером.',
          'Цифра в презентации — не обещание сертификата на вашу квартиру.',
        ],
      },
      {
        kicker: 'Внутри комнаты',
        title: 'Меньше эха',
        points: [
          'Голые поверхности делают речь и музыку резкими.',
          'Панель забирает часть отражений.',
          'Разницу удобно услышать на замере, а не только на словах.',
        ],
      },
      {
        kicker: 'Монтаж',
        title: 'Без долгой стройки',
        points: [
          'Бескаркасная система, панели идут модулями.',
          'Дальше привычный натяжной потолок.',
          'Срок и комплектацию называет ваша бригада после замера.',
        ],
      },
      {
        kicker: 'Следующий шаг',
        title: 'Замер и понятная смета',
        points: [
          'Смотрим комнату и площадь.',
          'Считаем панели и крепёж.',
          'Вы получаете состав работ до договора.',
        ],
      },
    ],
  },
  'deck-designer': {
    eyebrow: 'Презентация для дизайнера',
    slides: [
      {
        kicker: 'В проект',
        title: 'Плоскость под натяжным полотном',
        points: [
          'MultiFrame закладывается в потолок, не в отдельный каркасный короб.',
          'Чистовая плоскость остаётся за полотном.',
          'Система бескаркасная: меньше высоты, чем у классического каркаса.',
        ],
      },
      {
        kicker: 'Поверхность',
        title: 'Flat и Wave',
        points: [
          'Две фактуры панели под разные задачи интерьера.',
          'Стык модулей собирается замком, контур читается как одна плоскость.',
          'Полотно выбирается отдельно — акустика не диктует цвет ткани.',
        ],
      },
      {
        kicker: 'Материал',
        title: 'Что важно указать в спецификации',
        points: [
          'Панели из экологичных, негорючих и гипоаллергенных материалов.',
          'Площадь, контур комнаты и запас крепежа — из калькулятора.',
          'Примыкания к стенам и светильникам согласуются до производства полотна.',
        ],
      },
      {
        kicker: 'Акустика в альбоме',
        title: 'Как объяснить заказчику',
        points: [
          'Шум сверху и гул комнаты — разные ощущения, система закрывает оба.',
          'Ориентир до 17 дБ не заменяет расчёт конкретного перекрытия.',
          'В альбом лучше класть схему «плита — панель — полотно», без лишней химии.',
        ],
      },
      {
        kicker: 'Координация',
        title: 'Дизайнер, замер, монтаж',
        points: [
          'Замер фиксирует площадь и узлы.',
          'Монтаж панелей идёт до натяжки.',
          'Монтажник получает объёмы, цены в спецификации клиента не обязательны.',
        ],
      },
    ],
  },
};

const FRAMES: Frame[] = [
  {
    time: '0:00',
    title: 'Основание',
    text: 'Перекрытие сухое. Размечаем плоскость, в которую встанет контур панелей.',
    hot: 'slab',
  },
  {
    time: '0:04',
    title: 'Крепёж',
    text: 'Точки крепления по схеме системы. Количество дюбелей уже есть в калькуляторе.',
    hot: 'slab',
  },
  {
    time: '0:08',
    title: 'Панели',
    text: 'Модули стыкуются шип-пазом и замком SmartLock, без щелей в контуре.',
    hot: 'panel',
  },
  {
    time: '0:12',
    title: 'Полотно',
    text: 'Дальше натяжной потолок. Примыкания проверяем до вызова бригады полотна.',
    hot: 'film',
  },
];

const MANUAL = [
  {
    title: 'Назначение',
    text: 'Инструкция для монтажника и замерщика: в каком порядке ставится STP MultiFrame под натяжной потолок. Это демонстрационный материал кабинета, перед объектом сверяйтесь с актуальной картой монтажа.',
  },
  {
    title: 'До начала',
    text: 'Сверьте комплектацию с калькулятором: панели и крепёж. Основание должно быть сухим, без активных протечек. Комнату и площадь фиксирует замерщик в карточке объекта.',
  },
  {
    title: 'Порядок',
    text: 'Разметьте плоскость. Закрепите панели по схеме системы. Соберите контур замком шип-паз / SmartLock без разрывов. Проверьте примыкания к стенам и закладные под свет до натяжки полотна.',
  },
  {
    title: 'После монтажа',
    text: 'В кабинете отметьте статус «Монтаж» или «Закрыто». Цены монтажнику не показываются — в задании только количества.',
  },
  {
    title: 'Чего не обещать',
    text: 'Проблемомер даёт ориентир комфорта, не лабораторный протокол. Ориентир системы до 17 дБ не заменяет замер конкретного перекрытия.',
  },
];

function SlideDeck({ stub }: { stub: string }) {
  const deck = DECKS[stub] ?? DECKS['deck-product']!;
  const [index, setIndex] = useState(0);
  const slide = deck.slides[index]!;
  return (
    <div className={styles.deck}>
      <p className={styles.deckEyebrow}>{deck.eyebrow}</p>
      <div className={styles.deckStage}>
        <p className={styles.deckKicker}>{slide.kicker}</p>
        <h3 className={styles.deckTitle}>{slide.title}</h3>
        <ul className={styles.deckPoints}>
          {slide.points.map((point) => (
            <li key={point}>{point}</li>
          ))}
        </ul>
      </div>
      <div className={styles.deckNav}>
        <button
          type="button"
          className={styles.ghost}
          onClick={() => setIndex((n) => Math.max(0, n - 1))}
          disabled={index === 0}
        >
          Назад
        </button>
        <span className={styles.deckCount}>
          {String(index + 1).padStart(2, '0')} / {String(deck.slides.length).padStart(2, '0')}
        </span>
        <button
          type="button"
          className={styles.primary}
          onClick={() => setIndex((n) => Math.min(deck.slides.length - 1, n + 1))}
          disabled={index === deck.slides.length - 1}
        >
          Дальше
        </button>
      </div>
    </div>
  );
}

function VideoStub() {
  const [frame, setFrame] = useState(0);
  const [playing, setPlaying] = useState(false);
  const current = FRAMES[frame]!;

  useEffect(() => {
    if (!playing) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const timer = window.setInterval(() => {
      setFrame((n) => (n + 1) % FRAMES.length);
    }, 4000);
    return () => window.clearInterval(timer);
  }, [playing]);

  return (
    <div className={styles.player}>
      <button
        type="button"
        className={styles.playerStage}
        onClick={() => setPlaying((v) => !v)}
        aria-pressed={playing}
      >
        <span className={styles.playerBrand}>STP MultiFrame</span>
        <span className={`${styles.ceiling} ${styles[`hot_${current.hot}`]}`}>
          <span>Плита</span>
          <span>Панель</span>
          <span>Полотно</span>
        </span>
        <span className={styles.playerPlay}>{playing ? 'Пауза' : 'Смотреть'}</span>
        <span className={styles.playerCaption}>
          <strong>{current.title}</strong>
          <span>{current.time}</span>
        </span>
      </button>
      <p className={styles.playerText}>{current.text}</p>
      <ol className={styles.chapters}>
        {FRAMES.map((item, index) => (
          <li key={item.time}>
            <button
              type="button"
              className={index === frame ? styles.chapterOn : styles.chapter}
              onClick={() => {
                setFrame(index);
                setPlaying(false);
              }}
            >
              <span>{item.time}</span>
              {item.title}
            </button>
          </li>
        ))}
      </ol>
      <p className={styles.stubNote}>Демонстрационный фрагмент для кабинета · 0:16</p>
    </div>
  );
}

function ManualStub() {
  return (
    <article className={styles.manual}>
      <p className={styles.deckEyebrow}>Инструкция по монтажу</p>
      <h3 className={styles.deckTitle}>STP MultiFrame под натяжной потолок</h3>
      <ol className={styles.manualList}>
        {MANUAL.map((section, index) => (
          <li key={section.title}>
            <span>{String(index + 1).padStart(2, '0')}</span>
            <div>
              <strong>{section.title}</strong>
              <p>{section.text}</p>
            </div>
          </li>
        ))}
      </ol>
      <p className={styles.stubNote}>Демонстрационный материал. Рабочая карта монтажа — у технолога STP.</p>
    </article>
  );
}

export function MaterialStubView({ stub }: { stub: string }) {
  if (stub === 'video-install') return <VideoStub />;
  if (stub === 'instruction-install') return <ManualStub />;
  return <SlideDeck stub={stub} />;
}
