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
  const { user } = usePartner();
  if (!user) return null;
  return <ObjectsPanel compact={compact} onCreate={onCreate} />;
}
