import { useState } from 'react';
import type { JobObjectStatus } from '../../../../packages/shared/partner';
import { usePartner } from './PartnerContext';
import { ObjectsPanel } from './ObjectsPanel';
import styles from './RoleOverview.module.css';

export function NetworkOverview({ count, onPartners, onAdd, onLearning }: {
  count: number; onPartners: () => void; onAdd: () => void; onLearning: () => void;
}) {
  return <section className={styles.overview} aria-label="Управление партнёрской сетью">
    <div className={styles.intro}><div><p className={styles.eyebrow}>STP MultiFrame</p><h2>Партнёры и поддержка команды</h2></div></div>
    <div className={styles.cards}>
      <button className={styles.card} onClick={onPartners}><span className={styles.label}>Компании в сети</span><strong>{count}</strong><span className={styles.hint}>Открыть список партнёров →</span></button>
      <button className={styles.card} onClick={onAdd}><span className={styles.label}>Новый партнёр</span><strong aria-hidden="true">+</strong><span className={styles.hint}>Создать компанию и доступ владельца →</span></button>
      <button className={styles.card} onClick={onLearning}><span className={styles.label}>Обучение и материалы</span><span className={styles.hint}>Поддержать продажи и монтаж →</span></button>
    </div>
  </section>;
}

export function RoleWorkspace({ compact, onCreate }: { compact?: boolean; onCreate?: () => void }) {
  const { user, objects } = usePartner();
  const [filterRequest, setFilterRequest] = useState<{ status: JobObjectStatus | 'all'; nonce: number }>();
  if (!user) return null;
  const role = user.role;
  const cards: { status: JobObjectStatus; label: string; hint: string }[] = role === 'crew'
    ? [{ status: 'install', label: 'Задания на монтаж', hint: 'Открыть назначенные работы' },
       { status: 'closed', label: 'Закрытые задания', hint: 'Посмотреть завершённые карточки' }]
    : role === 'measurer'
      ? [{ status: 'draft', label: 'Нужно уточнить', hint: 'Продолжить заполнение' },
         { status: 'measured', label: 'На этапе замера', hint: 'Проверить размеры и расчёт' }]
      : [{ status: 'draft', label: 'Новые обращения', hint: 'Уточнить задачу клиента' },
         { status: 'quote_sent', label: 'Предложения отправлены', hint: 'Обсудить решение с клиентом' },
         { status: 'install', label: 'Монтаж', hint: 'Проверить ход работ' }];
  return <>
    <section className={styles.overview} aria-label="Рабочая сводка">
      <div className={styles.intro}>
        <div><p className={styles.eyebrow}>{role === 'owner' ? 'Работа компании' : 'Ваш рабочий день'}</p>
          <h2>{role === 'crew' ? 'Схема, материалы и задания — под рукой' : role === 'measurer' ? 'От жалобы клиента к точному замеру' : 'Продолжите работу с клиентами'}</h2>
        </div>
        <button className={styles.all} onClick={() => setFilterRequest({ status: 'all', nonce: Date.now() })}>
          Все доступные объекты · {objects.length}
        </button>
      </div>
      <div className={styles.cards}>
        {cards.map(card => <button key={card.status} className={styles.card}
          onClick={() => setFilterRequest({ status: card.status, nonce: Date.now() })}>
          <span className={styles.label}>{card.label}</span>
          <strong>{objects.filter(object => object.status === card.status).length}</strong>
          <span className={styles.hint}>{card.hint} <span aria-hidden="true">→</span></span>
        </button>)}
      </div>
    </section>
    <ObjectsPanel compact={compact} onCreate={onCreate} filterRequest={filterRequest} />
  </>;
}
