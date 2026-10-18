import type { ReactNode } from 'react';
import { EASE, m, motionPresets, usePrefersReducedMotion } from './motionBits';
import { markReturnToTools } from './toolsReturn';
import styles from './ToolsPanel.module.css';

export type ToolCopy = {
  id: 'problemomer' | 'calculator';
  title: string;
  tagline: string;
  when: string[];
  why: string[];
  action: string;
};

/** Тексты карточек. Для ролей без цен калькулятор описан без сметы. */
export function toolCards(seePrices: boolean): ToolCopy[] {
  return [
    {
      id: 'problemomer',
      title: 'Проблемомер',
      tagline: 'Диагностика шума в комнате',
      when: ['Первый контакт с клиентом', 'Замер на объекте', 'Клиент жалуется на соседей'],
      why: ['Показать проблему в цифрах и классах комфорта', 'Обосновать звукоизоляцию MultiFrame', 'Отдать клиенту PDF-сводку'],
      action: 'Открыть Проблемомер',
    },
    {
      id: 'calculator',
      title: 'Калькулятор',
      tagline: seePrices ? 'Материалы и стоимость потолка' : 'Материалы для монтажа потолка',
      when: seePrices
        ? ['После замера, когда известна площадь', 'Перед отправкой КП клиенту']
        : ['Перед выездом на монтаж', 'Когда известна площадь потолка'],
      why: seePrices
        ? ['Посчитать панели, крепёж и сумму по прайсу', 'Получить смету и спецификацию в PDF для КП']
        : ['Посчитать панели и крепёж', 'Получить спецификацию и схему раскладки в PDF'],
      action: 'Открыть Калькулятор',
    },
  ];
}

function ProblemomerIcon() {
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true">
      <circle cx="24" cy="24" r="20" fill="currentColor" opacity=".12" />
      <path d="M12 28a12 12 0 0 1 24 0" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
      <path d="M24 28l7-9" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
      <circle cx="24" cy="28" r="3" fill="currentColor" />
      <path d="M15 34h18" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" opacity=".5" />
    </svg>
  );
}

function CalculatorIcon() {
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true">
      <rect x="6" y="6" width="36" height="36" rx="10" fill="currentColor" opacity=".12" />
      <rect x="14" y="12" width="20" height="24" rx="4" fill="none" stroke="currentColor" strokeWidth="3" />
      <path d="M18 18h12" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
      <path d="M19 25h.01M24 25h.01M29 25h.01M19 30h.01M24 30h.01M29 30h.01" stroke="currentColor" strokeWidth="3.4" strokeLinecap="round" />
    </svg>
  );
}

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

/** Вкладка «Инструменты»: две большие карточки вместо кнопок в шапке. */
export function ToolsPanel({
  seePrices,
  onProblemomer,
  onCalculator,
}: {
  seePrices: boolean;
  onProblemomer: () => void;
  onCalculator: () => void;
}) {
  const reduce = usePrefersReducedMotion();
  const open = (id: ToolCopy['id']) => {
    markReturnToTools();
    if (id === 'problemomer') onProblemomer();
    else onCalculator();
  };
  const icons: Record<ToolCopy['id'], ReactNode> = {
    problemomer: <ProblemomerIcon />,
    calculator: <CalculatorIcon />,
  };

  return (
    <section className={styles.panel} aria-labelledby="tools-title">
      <header className={styles.head}>
        <h2 id="tools-title">Инструменты</h2>
        <p>Диагностика на объекте и расчёт для коммерческого предложения.</p>
      </header>
      <div className={styles.grid}>
        {toolCards(seePrices).map((tool, index) => (
          <m.article
            key={tool.id}
            className={styles.card}
            data-tool={tool.id}
            initial={reduce ? false : motionPresets.page.initial}
            animate={motionPresets.page.animate}
            transition={reduce ? { duration: 0 } : { ...motionPresets.transition, delay: index * 0.06 }}
            whileHover={reduce ? undefined : { y: -4, transition: { duration: 0.22, ease: EASE } }}
            whileTap={reduce ? undefined : { scale: 0.985, transition: { duration: 0.12, ease: EASE } }}
            onClick={(event) => {
              // Клик по любой части карточки; сама кнопка обрабатывается ниже.
              if ((event.target as HTMLElement).closest('button')) return;
              open(tool.id);
            }}
          >
            <div className={styles.top}>
              <span className={styles.icon}>{icons[tool.id]}</span>
              <div className={styles.titles}>
                <h3>{tool.title}</h3>
                <p>{tool.tagline}</p>
              </div>
            </div>
            <div className={styles.groups}>
              <Bullets title="Когда применять:" items={tool.when} />
              <Bullets title="Зачем:" items={tool.why} />
            </div>
            <button
              type="button"
              className={styles.open}
              onClick={() => open(tool.id)}
            >
              {tool.action}
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M5 12h13m0 0-5-5m5 5-5 5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          </m.article>
        ))}
      </div>
    </section>
  );
}
