import type { ClassLabel, DerivedSimSide, DerivedSimulation } from '../state/types';
import {
  DISCLAIMER_SIMULATION,
  HYBRID_CLASS_LABELS,
  NORM_FOOTNOTE,
  SIMULATION_BADGE,
} from '../state/types';
import { airChip, classCyr, impactChip } from '../state/simulation';
import styles from './SimCompare.module.css';

interface Props {
  sim: DerivedSimulation;
  emphasize?: 'before' | 'after' | 'both';
  /** Quieter digits when dual cards are on screen. */
  tone?: 'primary' | 'secondary';
}

const SCALE: ClassLabel[] = ['A', 'B', 'V', 'below'];

function scaleIndex(label: ClassLabel): number {
  return SCALE.indexOf(label);
}

function ClassPill({ side }: { side: DerivedSimSide }) {
  if (side.classStatus === 'partial') {
    return <span className={styles.statusPartial}>частично</span>;
  }
  if (side.classStatus === 'below' || side.classLabel === 'below') {
    return <span className={styles.statusBelow}>ниже нормы</span>;
  }
  return <span className={styles.classPill}>класс {classCyr(side.classLabel)}</span>;
}

function MetricTertiary({
  label,
  value,
  delta,
}: {
  label: string;
  value: number;
  delta?: number;
}) {
  return (
    <p className={styles.metricTertiary}>
      <span className={styles.key}>{label}</span>
      <span className={styles.metricNums}>
        <strong>{value}</strong>
        <span className={styles.unit}>дБ</span>
        {delta != null ? (
          <span className={styles.delta}>
            {delta > 0 ? '+' : ''}
            {delta}
          </span>
        ) : null}
      </span>
    </p>
  );
}

function Column({
  title,
  side,
  delta,
}: {
  title: string;
  side: DerivedSimSide;
  delta?: { Rw: number; Lnw: number };
}) {
  const impact = impactChip(side);
  const showNote =
    side.classStatus === 'partial' || side.classStatus === 'below' ? side.label : null;

  return (
    <div className={styles.col}>
      <div className={styles.colHead}>
        <h3>{title}</h3>
        <ClassPill side={side} />
      </div>

      <p className={styles.hybridLabel}>{HYBRID_CLASS_LABELS[side.classLabel]}</p>
      <p className={styles.normHint}>{NORM_FOOTNOTE}</p>

      <div className={styles.effects}>
        <div className={styles.effectBlock}>
          <span className={styles.channel}>Воздух</span>
          <MetricTertiary label="воздух" value={side.Rw} delta={delta?.Rw} />
        </div>
        <div className={styles.effectBlock}>
          <span className={styles.channel}>Удар</span>
          <MetricTertiary label="удар" value={side.Lnw} delta={delta?.Lnw} />
        </div>
      </div>

      <div className={styles.chips}>
        <span className={styles.chip}>Воздух: {airChip(side)}</span>
        <span className={`${styles.chip} ${impact === 'вне нормы' ? styles.chipWarn : ''}`}>
          Удар: {impact}
        </span>
      </div>
      {showNote ? <p className={styles.partialNote}>{showNote}</p> : null}
    </div>
  );
}

function ClassScale({ before, after }: { before: ClassLabel; after: ClassLabel }) {
  const from = scaleIndex(before);
  const to = scaleIndex(after);
  return (
    <div className={styles.scaleBlock} aria-label="Шкала комфортности А → Б → В">
      <p className={styles.chartTitle}>Класс комфорта</p>
      <div className={styles.scaleTrack}>
        {SCALE.map((cls, i) => {
          const label = cls === 'below' ? 'ниже' : classCyr(cls);
          const isBefore = i === from;
          const isAfter = i === to;
          return (
            <div
              key={cls}
              className={`${styles.scaleStep} ${isBefore ? styles.scaleBefore : ''} ${isAfter ? styles.scaleAfter : ''}`}
            >
              <span className={styles.scaleDot} />
              <span className={styles.scaleName}>{label || '—'}</span>
            </div>
          );
        })}
      </div>
      <p className={styles.scaleMove}>
        {HYBRID_CLASS_LABELS[before]} → {HYBRID_CLASS_LABELS[after]}
      </p>
    </div>
  );
}

function Bars({ sim }: { sim: DerivedSimulation }) {
  const maxRw = Math.max(sim.before.Rw, sim.after.Rw, 60);
  const maxLnw = Math.max(sim.before.Lnw, sim.after.Lnw, 80);
  return (
    <div className={styles.barsBlock}>
      <p className={styles.chartTitle}>Ориентиры ΔRw / ΔLnw</p>
      <div className={styles.barRow}>
        <span className={styles.barLabel}>Воздух (Rw)</span>
        <div className={styles.barPair}>
          <div className={styles.barTrack}>
            <span
              className={`${styles.barFill} ${styles.barBefore}`}
              style={{ width: `${(sim.before.Rw / maxRw) * 100}%` }}
            />
          </div>
          <span className={styles.barVal}>{sim.before.Rw}</span>
        </div>
        <div className={styles.barPair}>
          <div className={styles.barTrack}>
            <span
              className={`${styles.barFill} ${styles.barAfter}`}
              style={{ width: `${(sim.after.Rw / maxRw) * 100}%` }}
            />
          </div>
          <span className={styles.barVal}>
            {sim.after.Rw}
            <em>
              {sim.delta.Rw > 0 ? '+' : ''}
              {sim.delta.Rw}
            </em>
          </span>
        </div>
      </div>
      <div className={styles.barRow}>
        <span className={styles.barLabel}>Удар (Lnw)</span>
        <div className={styles.barPair}>
          <div className={styles.barTrack}>
            <span
              className={`${styles.barFill} ${styles.barBefore}`}
              style={{ width: `${(sim.before.Lnw / maxLnw) * 100}%` }}
            />
          </div>
          <span className={styles.barVal}>{sim.before.Lnw}</span>
        </div>
        <div className={styles.barPair}>
          <div className={styles.barTrack}>
            <span
              className={`${styles.barFill} ${styles.barAfter}`}
              style={{ width: `${(sim.after.Lnw / maxLnw) * 100}%` }}
            />
          </div>
          <span className={styles.barVal}>
            {sim.after.Lnw}
            <em>{sim.delta.Lnw}</em>
          </span>
        </div>
      </div>
      <p className={styles.barCaption}>Сейчас · С MultiFrame · Δ</p>
    </div>
  );
}

export function SimCompare({ sim, emphasize = 'both', tone = 'primary' }: Props) {
  const [rwLo, rwHi] = sim.deltaRange.Rw;
  const [lnwLo, lnwHi] = sim.deltaRange.Lnw;
  const showAfter = emphasize !== 'before';
  const showBefore = emphasize !== 'after';

  return (
    <section
      className={`${styles.card} ${tone === 'secondary' ? styles.secondary : ''}`}
      aria-label={sim.uiLabel || SIMULATION_BADGE}
    >
      <header className={styles.head}>
        <span className={styles.badge}>{sim.uiLabel || SIMULATION_BADGE}</span>
      </header>

      <ClassScale before={sim.before.classLabel} after={sim.after.classLabel} />
      <Bars sim={sim} />

      <div className={styles.grid}>
        {showBefore ? <Column title="Сейчас" side={sim.before} /> : null}
        {showAfter ? (
          <Column title="С MultiFrame" side={sim.after} delta={sim.delta} />
        ) : null}
      </div>

      <p className={styles.range}>
        Δ воздух +{rwLo}…+{rwHi} · удар −{lnwLo}…−{lnwHi}
      </p>

      <ul className={styles.lines}>
        {sim.honestLines.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>

      {DISCLAIMER_SIMULATION ? (
        <aside className={styles.ibox} role="note">
          <span className={styles.imark} aria-hidden>
            i
          </span>
          <p>{DISCLAIMER_SIMULATION}</p>
        </aside>
      ) : null}
    </section>
  );
}
