import { canSeePrices } from '../../../../packages/shared/partner';
import { usePartner } from './PartnerContext';
import { buildPartnerEstimate, formatRub } from './estimate';
import styles from './partner.module.css';

export function PartnerEstimateCard({ areaM2 }: { areaM2: number | null }) {
  const { partner, user } = usePartner();
  if (!partner || areaM2 == null || areaM2 <= 0) return null;
  const seePrices = user ? canSeePrices(user.role) : true;
  const est = buildPartnerEstimate(areaM2, partner);
  if (!est) return null;

  return (
    <section className={styles.card} style={{ width: '100%', marginTop: 8 }} aria-label="Смета партнёра">
      <h2>{seePrices ? 'Смета для КП' : 'Количество для монтажа'}</h2>
      {partner.companyName ? <p className={styles.lead}>Подготовлено: {partner.companyName}</p> : null}
      <div className={styles.grid2}>
        <div className={styles.field}>
          Панели
          <strong>
            {est.panels} шт.
            {seePrices ? ` · ${formatRub(est.panelsCost)}` : ''}
          </strong>
        </div>
        <div className={styles.field}>
          Дюбели (с запасом 15%)
          <strong>
            {est.dowels} шт.
            {seePrices && est.dowelsCost != null ? ` · ${formatRub(est.dowelsCost)}` : ''}
          </strong>
        </div>
        {seePrices && est.installCost != null ? (
          <div className={styles.field}>
            Монтаж
            <strong>{formatRub(est.installCost)}</strong>
          </div>
        ) : null}
      </div>
      {seePrices ? (
        <>
          <div className={styles.estimateTotal}>
            <span>Итого</span>
            <strong>{formatRub(est.totalCost)}</strong>
          </div>
          <p className={styles.hint}>
            Общая сумма по проекту: панели (РРЦ) + монтаж + крепёж. Детальный расклад — в калькуляторе.
          </p>
        </>
      ) : (
        <p className={styles.hint}>Цены скрыты для бригады. Детальная раскладка — в калькуляторе.</p>
      )}
    </section>
  );
}
