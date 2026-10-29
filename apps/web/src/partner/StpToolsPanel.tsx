import type { ReactNode } from 'react';
import { ArrowRightIcon, CalculatorIcon, GaugeIcon } from '../icons';
import { EASE, m, motionPresets, usePrefersReducedMotion } from './motionBits';
import { stpToolUrl, type StpToolId } from './stpToolLinks';
import styles from './ToolsPanel.module.css';
import ownStyles from './StpToolsPanel.module.css';

export const STP_TOOLS_PENDING_LABEL = 'Ссылка появится позже';

type StpToolCopy = {
  id: StpToolId;
  title: string;
  tagline: string;
  when: string[];
  why: string[];
  action: string;
};

/** Тексты карточек для менеджера StP: клиентские версии, без партнёрских цен и проектов. */
export const STP_TOOL_CARDS: StpToolCopy[] = [
  {
    id: 'problemomer',
    title: 'Диагностика шума',
    tagline: 'Клиентский Проблемомер',
    when: ['Первый разговор с клиентом', 'Клиент жалуется на шум от соседей', 'Нужно показать проблему наглядно'],
    why: ['Разобрать шум в комнате клиента по вопросам', 'Показать результат в цифрах и классах комфорта', 'Объяснить, чем поможет звукоизоляция MultiFrame'],
    action: 'Открыть диагностику',
  },
  {
    id: 'calculator',
    title: 'Калькулятор',
    tagline: 'Клиентский расчёт потолка',
    when: ['Известна площадь потолка', 'Клиент просит ориентир по материалам', 'Нужно быстро прикинуть комплект'],
    why: ['Посчитать панели и крепёж', 'Показать клиенту расчёт на месте', 'Не искать цифры в таблицах'],
    action: 'Открыть калькулятор',
  },
];

function Bullets({ title, items }: { title: string; items: string[] }) {
  return (
    <div className={styles.group}>
      <p className={styles.groupTitle}>{title}</p>
      <ul className={styles.list}>
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </div>
  );
}

const ICONS: Record<StpToolId, ReactNode> = {
  problemomer: <GaugeIcon />,
  calculator: <CalculatorIcon />,
};

/**
 * Раздел «Инструменты» менеджера StP. Каждая карточка открывает клиентскую версию по внешней ссылке
 * из stpToolLinks.ts. Пока ссылки нет, кнопка неактивна и подписана «Ссылка появится позже».
 */
export function StpToolsPanel({ links }: { links?: Partial<Record<StpToolId, string | null>> }) {
  const reduce = usePrefersReducedMotion();
  return (
    <section className={styles.panel} aria-labelledby="stp-tools-title">
      <header className={styles.head}>
        <h2 id="stp-tools-title">Инструменты</h2>
        <p>Клиентские версии для работы: открываются отдельной страницей в новой вкладке.</p>
      </header>
      <div className={styles.grid}>
        {STP_TOOL_CARDS.map((tool, index) => {
          const url = links && tool.id in links ? links[tool.id] ?? null : stpToolUrl(tool.id);
          return (
            <m.article
              key={tool.id}
              className={`${styles.card} ${ownStyles.card} ${url ? '' : ownStyles.cardOff}`}
              data-tool={tool.id}
              data-state={url ? 'ready' : 'pending'}
              initial={reduce ? false : motionPresets.page.initial}
              animate={motionPresets.page.animate}
              transition={reduce ? { duration: 0 } : { ...motionPresets.transition, delay: index * 0.06 }}
              whileHover={reduce || !url ? undefined : { y: -4, transition: { duration: 0.22, ease: EASE } }}
            >
              <div className={styles.top}>
                <span className={styles.icon}>{ICONS[tool.id]}</span>
                <div className={styles.titles}>
                  <h3>{tool.title}</h3>
                  <p>{tool.tagline}</p>
                </div>
              </div>
              <div className={styles.groups}>
                <Bullets title="Когда применять:" items={tool.when} />
                <Bullets title="Зачем:" items={tool.why} />
              </div>
              {url ? (
                <a className={styles.open} href={url} target="_blank" rel="noopener noreferrer">
                  {tool.action}
                  <ArrowRightIcon />
                </a>
              ) : (
                <button type="button" className={styles.open} disabled aria-disabled="true">
                  {STP_TOOLS_PENDING_LABEL}
                </button>
              )}
            </m.article>
          );
        })}
      </div>
    </section>
  );
}
