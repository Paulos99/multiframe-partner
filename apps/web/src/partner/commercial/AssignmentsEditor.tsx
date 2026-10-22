import type { ObjectAssignments } from '../../../../../packages/shared/deal';
import styles from '../partner.module.css';

export type StaffOption = { id: string; label: string; role: string };

export function AssignmentsEditor({
  value,
  staff,
  onChange,
  disabled = false,
}: {
  value: ObjectAssignments;
  staff: StaffOption[];
  onChange: (next: ObjectAssignments) => void;
  disabled?: boolean;
}) {
  const byRole = (role: string) => staff.filter((s) => s.role === role || role === 'any');

  function select(
    key: keyof ObjectAssignments,
    options: StaffOption[],
    current: string | null,
  ) {
    return (
      <label className={styles.field} style={{ display: 'grid', gap: 4 }}>
        <span>
          {key === 'salesUserId'
            ? 'Менеджер'
            : key === 'measurerUserId'
              ? 'Замерщик'
              : 'Монтажник'}
        </span>
        <select
          disabled={disabled}
          value={current || ''}
          onChange={(e) =>
            onChange({ ...value, [key]: e.target.value ? e.target.value : null })
          }
        >
          <option value="">— не назначен —</option>
          {options.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </select>
      </label>
    );
  }

  return (
    <div className={styles.hintCard}>
      <h2>Ответственные по этапам</h2>
      <p className={styles.lead}>Менеджер, замерщик и монтажник назначаются независимо.</p>
      <div style={{ display: 'grid', gap: 10 }}>
        {select('salesUserId', byRole('sales').concat(byRole('owner')), value.salesUserId)}
        {select('measurerUserId', byRole('measurer'), value.measurerUserId)}
        {select('crewUserId', byRole('crew'), value.crewUserId)}
      </div>
    </div>
  );
}
