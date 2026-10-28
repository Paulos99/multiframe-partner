import type { ReactNode } from 'react';
import { EASE, m, motionPresets, usePrefersReducedMotion } from './motionBits';
import { markReturnToTools } from './toolsReturn';
import styles from './ToolsPanel.module.css';
import { canCreateObjects, type UserRole } from '../../../../packages/shared/partner';
import { usePartner } from './PartnerContext';
import { ArrowRightIcon, CalculatorIcon as CalculatorGlyph, GaugeIcon } from '../icons';

export type ToolCopy = {
  id: 'problemomer' | 'calculator';
  title: string;
  tagline: string;
  when: string[];
  why: string[];
  action: string;
};

/**
 * Тексты карточек. Монтажник цен не видит: про сумму и смету ему не пишем.
 * Сохранить результат в комнату можно только там, где роль создаёт комнаты.
 */
export function toolCards(role: UserRole = 'owner'): ToolCopy[] {
  const prices = role !== 'crew';
  const saves = canCreateObjects(role);
  return [
    {
      id: 'problemomer',
      title: 'Проблемомер',
      tagline: 'Диагностика шума в комнате',
      when: ['Первый контакт с клиентом', 'Замер на объекте', 'Клиент жалуется на соседей'],
      why: [
        'Показать проблему в цифрах и классах комфорта',
        'Обосновать звукоизоляцию MultiFrame',
        ...(saves ? ['Сохранить акустический профиль комнаты в проект: PDF ляжет в карточку комнаты'] : []),
      ],
      action: 'Открыть Проблемомер',
    },
    {
      id: 'calculator',
      title: 'Калькулятор',
      tagline: prices ? 'Материалы и стоимость потолка' : 'Материалы для потолка',
      when: ['После замера, когда известна площадь', prices ? 'Перед отправкой КП клиенту' : 'Перед сборкой комплекта', 'Перед выездом на монтаж'],
      why: prices
        ? ['Посчитать панели, крепёж и сумму по прайсу', 'Получить «Смету» в PDF: цены, количество и схема раскладки']
        : ['Посчитать панели и крепёж', 'Получить схему раскладки и количество материалов'],
      action: 'Открыть Калькулятор',
    },
  ];
}

function ProblemomerIcon() {
  return <GaugeIcon />;
}

function CalculatorIcon() {
  return <CalculatorGlyph />;
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

/** Раздел «Инструменты»: Проблемомер и Калькулятор без проекта, страницей в основной части. */
export function ToolsPanel({
  onProblemomer,
  onCalculator,
}: {
  onProblemomer: () => void;
  onCalculator: () => void;
}) {
  const reduce = usePrefersReducedMotion();
  const role = usePartner().user?.role;
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
        <p>
          Работают сами по себе: проект создавать не нужно.
          {role === 'crew' ? ' Диагностика на объекте и расчёт материалов.' : ' Диагностика на объекте и расчёт для коммерческого предложения.'}
        </p>
      </header>
      <div className={styles.grid}>
        {toolCards(role).map((tool, index) => (
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
              <ArrowRightIcon />
            </button>
          </m.article>
        ))}
      </div>
    </section>
  );
}
