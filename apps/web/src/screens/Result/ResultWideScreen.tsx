import { useEffect, useRef } from 'react';
import { canCreateObjects } from '../../../../../packages/shared/partner';
import { CompactAudio } from '../../ui/CompactAudio';
import { EchoComfort, EchoComfortRings } from '../../ui/EchoComfort';
import { SpectrumChart } from '../../ui/SpectrumChart';
import type { ClassLabel } from '../../state/types';
import {
  FeltScale,
  MULTIFRAME_PILLARS,
  NORM_ROWS,
  useResultProfile,
} from './resultShared';
import { PartnerEstimateCard } from '../../partner/PartnerEstimateCard';
import { SaveObjectCard } from '../../partner/SaveObjectCard';
import { usePartner } from '../../partner/PartnerContext';
import styles from './ResultWideScreen.module.css';

/** Flip to true to restore frequency charts if clients ask. */
export const SHOW_FREQUENCY_CHARTS = false;

function KpiRow({
  deltaRw,
  deltaLnw,
  quieterAir,
  quieterImpact,
  echoBefore,
  echoAfter,
  rwBefore,
  rwAfter,
  lnwBefore,
  lnwAfter,
}: {
  deltaRw: number;
  deltaLnw: number;
  quieterAir: number;
  quieterImpact: number;
  echoBefore: number;
  echoAfter: number;
  rwBefore: number;
  rwAfter: number;
  lnwBefore: number;
  lnwAfter: number;
}) {
  const airNow = Math.round(rwBefore);
  const airAfter = Math.round(rwAfter);
  const impactNow = Math.round(lnwBefore);
  const impactAfter = Math.round(lnwAfter);
  return (
    <section
      className={`${styles.kpiRow} ${styles.driftSoft}`}
      data-reveal
      aria-label="Ключевые показатели"
    >
      <article className={styles.kpiCard}>
        <span className={styles.kpiLabel}>Воздушный шум</span>
        <div className={styles.kpiMain}>
          <strong className={styles.kpiValue}>
            {airNow} → {airAfter}
            <em>дБ</em>
          </strong>
          <DeltaBars before={rwBefore} after={rwAfter} />
        </div>
        <span className={styles.kpiDbHint}>
          изоляция лучше на {deltaRw} дБ · примерно на {quieterAir}% тише
          <em>чем больше децибел, тем лучше изоляция · Rw</em>
        </span>
      </article>
      <article className={styles.kpiCard}>
        <span className={styles.kpiLabel}>Ударный шум</span>
        <div className={styles.kpiMain}>
          <strong className={styles.kpiValue}>
            {impactNow} → {impactAfter}
            <em>дБ</em>
          </strong>
          <DeltaBars before={lnwBefore} after={lnwAfter} invert />
        </div>
        <span className={styles.kpiDbHint}>
          удар сверху тише на {deltaLnw} дБ · примерно на {quieterImpact}% тише
          <em>чем меньше децибел, тем тише шаги · Lnw</em>
        </span>
      </article>
      <article className={styles.kpiCard}>
        <span className={styles.kpiLabel}>Акустический комфорт</span>
        <EchoComfortRings before={echoBefore} after={echoAfter} compact />
      </article>
    </section>
  );
}

function DeltaBars({ before, after, invert }: { before: number; after: number; invert?: boolean }) {
  const max = Math.max(before, after, 1);
  const bH = Math.round((before / max) * 100);
  const aH = Math.round((after / max) * 100);
  const better = invert ? after < before : after > before;
  const beforeDb = Math.round(before);
  const afterDb = Math.round(after);
  return (
    <div className={styles.kpiBars} aria-hidden>
      <span className={styles.kpiBarWrap}>
        <span
          className={styles.kpiBar}
          style={{ ['--bar-h' as string]: `${Math.max(18, bH)}%` }}
        />
        <span className={styles.kpiBarTip}>Сейчас · {beforeDb} дБ</span>
      </span>
      <span className={styles.kpiBarWrap}>
        <span
          className={`${styles.kpiBar} ${styles.kpiBarAfter} ${better ? styles.kpiBarBetter : ''}`}
          style={{ ['--bar-h' as string]: `${Math.max(18, aH)}%` }}
        />
        <span className={styles.kpiBarTip}>MultiFrame · {afterDb} дБ</span>
      </span>
    </div>
  );
}

/** Soft depth drift while scrolling — desktop only (skip touch / narrow). */
function useScrollDrift() {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    if (window.matchMedia('(max-width: 900px)').matches) return;
    if (window.matchMedia('(hover: none)').matches) return;
    const root = rootRef.current;
    if (!root) return;

    let raf = 0;
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const y = window.scrollY || 0;
        root.style.setProperty('--drift', `${Math.min(28, y * 0.035)}px`);
        root.style.setProperty('--drift-soft', `${Math.min(14, y * 0.018)}px`);
      });
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      cancelAnimationFrame(raf);
    };
  }, []);

  return rootRef;
}

export function ResultWideScreen() {
  const { diagnosisRequest, user } = usePartner();
  const linkedRoom = Boolean(diagnosisRequest?.objectId);
  const canSaveHere = Boolean(user && (canCreateObjects(user.role) || linkedRoom));
  const p = useResultProfile();
  const rootRef = useScrollDrift();

  const deltaRw = Math.abs(Math.round(p.sim.delta.Rw));
  const deltaLnw = Math.abs(Math.round(p.sim.delta.Lnw));
  const quieterAir = p.sim.perceivedAirPct;
  const quieterImpact = p.sim.perceivedImpactPct;
  const classNow = p.hybridBefore as ClassLabel;
  const classMf = p.hybridAfter as ClassLabel;

  const objectCells: { label: string; value: string }[] = [
    { label: 'Перекрытие', value: p.slabContext },
    { label: 'Тип дома', value: p.houseLabel },
  ];
  if (p.roomLabel) objectCells.push({ label: 'Комната', value: p.roomLabel });
  if (p.room.ceilingAreaM2) {
    objectCells.push({ label: 'Площадь', value: `${p.room.ceilingAreaM2} м²` });
  }
  if (p.room.noisyNeighbors !== 'unknown') {
    objectCells.push({ label: 'Шум сверху', value: p.neighborsLabel });
  }
  if (p.noiseKindLabel) {
    objectCells.push({ label: 'Тип шума', value: p.noiseKindLabel });
  }

  return (
    <div className={styles.root} ref={rootRef}>
      <header className={styles.titleBar} data-reveal>
        <h1>Акустический профиль помещения</h1>
      </header>

      <section className={`${styles.objectSpec} ${styles.driftSlow}`} data-reveal aria-label="Параметры комнаты">
        <div className={styles.objectSpecLabel}>
          <strong>Параметры комнаты</strong>
        </div>
        <dl className={styles.objectSpecGrid}>
          {objectCells.map((cell) => (
            <div key={cell.label}>
              <dt>{cell.label}</dt>
              <dd>{cell.value}</dd>
            </div>
          ))}
        </dl>
      </section>

      <KpiRow
        deltaRw={deltaRw}
        deltaLnw={deltaLnw}
        quieterAir={quieterAir}
        quieterImpact={quieterImpact}
        echoBefore={p.sim.reverb.echoInRoomBefore}
        echoAfter={p.sim.reverb.echoInRoomAfter}
        rwBefore={p.sim.before.Rw}
        rwAfter={p.sim.after.Rw}
        lnwBefore={p.sim.before.Lnw}
        lnwAfter={p.sim.after.Lnw}
      />

      <section
        className={`${styles.recProductRow} ${styles.driftSoft}`}
        data-reveal
        aria-label="Рекомендации и продукт"
      >
        <aside className={styles.recommendations} aria-label="Рекомендации">
          <h2>Рекомендации:</h2>
          <div className={styles.recommendationCopy}>
            {p.caseVerdictParagraphs.map((paragraph) => (
              <p key={paragraph}>{paragraph}</p>
            ))}
          </div>
        </aside>
        <aside className={styles.productAbout} aria-label="Что такое MultiFrame">
          <h2>Что такое MultiFrame</h2>
          <div className={styles.productAboutBody}>
            <img
              className={styles.productPhoto}
              src={p.productImageSrc}
              alt="Панель MultiFrame"
              width={480}
              height={360}
              loading="lazy"
              decoding="async"
            />
            <div className={styles.productCopy}>
              {p.productClaim ? <strong>{p.productClaim}</strong> : null}
              {p.productParagraphs.map((paragraph) => (
                <p key={paragraph}>{paragraph}</p>
              ))}
            </div>
          </div>
        </aside>
      </section>

      <section className={`${styles.panel} ${styles.driftSoft}`} data-reveal aria-label="Нормы комфорта для жилья">
        <div className={styles.normsHead}>
          <h2>
            Нормы комфорта жилья{' '}
            <span className={styles.normsSp}>по СП 51.13330.2011</span>
          </h2>
          <p className={styles.normDefs}>
            <b>Изоляция воздуха</b> <small className={styles.indexHint}>Rw</small> · больше лучше
            &nbsp;·&nbsp; <b>Удар сверху</b> <small className={styles.indexHint}>Lnw</small> · меньше лучше
          </p>
        </div>
        <div className={styles.tableWrap}>
          <table className={styles.normTable}>
            <thead>
              <tr>
                <th>Уровень</th>
                <th>
                  Изоляция <small className={styles.indexHint}>Rw</small>
                </th>
                <th>
                  Удар <small className={styles.indexHint}>Lnw</small>
                </th>
              </tr>
            </thead>
            <tbody>
              {NORM_ROWS.map((r) => {
                const isNow = r.key === classNow;
                const isMf = r.key === classMf;
                return (
                  <tr
                    key={r.key}
                    className={`${r.muted ? styles.normBelow : ''} ${isNow || isMf ? styles.normRowMarked : ''}`}
                  >
                    <td>
                      <span className={styles.normLevel}>
                        <span className={styles.normDots} aria-hidden>
                          {isNow ? <span className={`${styles.normDot} ${styles.normDotNow}`} /> : null}
                          {isMf ? <span className={`${styles.normDot} ${styles.normDotMf}`} /> : null}
                          {!isNow && !isMf ? (
                            <span className={`${styles.normDot} ${styles.normDotIdle}`} />
                          ) : null}
                        </span>
                        <span className={styles.normLevelLabel}>{r.label}</span>
                        {isNow ? <span className={styles.normPillNow}>Сейчас</span> : null}
                        {isMf ? <span className={styles.normPillMf}>MultiFrame</span> : null}
                      </span>
                    </td>
                    <td>
                      {r.rw} <em>дБ</em>
                    </td>
                    <td>
                      {r.lnw} <em>дБ</em>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className={`${styles.effectListen} ${styles.driftSlow}`} data-reveal aria-label="Эффективность и сравнение на слух">
        <div className={styles.effectCol}>
          <header className={styles.effectTop}>
            <h2>Эффективность MultiFrame</h2>
          </header>

          <div className={styles.feltStack}>
            <FeltScale
              title="Воздушный шум (голоса и музыка)"
              now={p.airNowFelt}
              after={p.airAfterFelt}
              indexKind="Rw"
              nowIndex={p.sim.before.Rw}
              afterIndex={p.sim.after.Rw}
              quieterPct={p.sim.perceivedAirPct}
              quieterDeltaDb={Math.abs(p.sim.delta.Rw)}
              mode="nowAndAfter"
            />
            <FeltScale
              title="Ударный шум (шаги и падения)"
              now={p.impactNowFelt}
              after={p.impactAfterFelt}
              indexKind="Lnw"
              nowIndex={p.sim.before.Lnw}
              afterIndex={p.sim.after.Lnw}
              quieterPct={p.sim.perceivedImpactPct}
              quieterDeltaDb={Math.abs(p.sim.delta.Lnw)}
              mode="nowAndAfter"
            />
          </div>
        </div>

        <div className={styles.listenSide} aria-label="Сравнить на слух">
          <header className={styles.listenSideHead}>
            <h2>Сравнить на слух</h2>
            <p className={styles.panelLead}>Эхо в комнате и звук сверху — до и после.</p>
          </header>
          <div className={styles.listenSideBody}>
            <div className={styles.listenCol}>
              <header className={styles.listenColHead}>
                <h3>
                  Эхо в комнате <span>(акустический комфорт)</span>
                </h3>
              </header>
              <EchoComfort sim={p.sim} variant="dashboard" showGauges={false} hideHead />
            </div>
            <div className={styles.listenCol}>
              <header className={styles.listenColHead}>
                <h3>
                  Звукоизоляция <span>(голоса и шаги сверху)</span>
                </h3>
              </header>
              <CompactAudio
                pairs={p.session.audio.pairs}
                sim={p.sim}
                wish={p.wish}
                hideHead
                stacked
              />
            </div>
          </div>
        </div>
      </section>

      {SHOW_FREQUENCY_CHARTS ? (
        <section className={`${styles.charts} ${styles.driftSoft}`} data-reveal aria-label="Изоляция по частотам">
          <header className={styles.chartsHead}>
            <div>
              <h2>Изоляция по частотам</h2>
              <p className={styles.panelLead}>
                Чем выше линия, тем лучше перекрытие изолирует шум на этой частоте.
              </p>
            </div>
            <div className={styles.chartsLegend} aria-hidden>
              <span>
                <i className={styles.legNow} /> Сейчас
              </span>
              <span>
                <i className={styles.legAfter} /> MultiFrame
              </span>
            </div>
          </header>
          <div className={styles.chartsGrid}>
            <SpectrumChart
              tall
              title="Воздушный шум (голоса и музыка)"
              subtitle="изоляция от голосов и музыки сверху"
              series={p.sim.airSpectrum}
              yLabel="дБ"
              indexBadge={{ kind: 'Rw', before: p.sim.before.Rw, after: p.sim.after.Rw }}
              reductionDb={Math.abs(p.sim.delta.Rw)}
              reductionPct={p.sim.perceivedAirPct}
            />
            <SpectrumChart
              tall
              title="Ударный шум (шаги и падения)"
              subtitle="изоляция от шагов и падений"
              series={p.sim.impactSpectrum}
              yLabel="дБ"
              indexBadge={{ kind: 'Lnw', before: p.sim.before.Lnw, after: p.sim.after.Lnw }}
              reductionDb={Math.abs(p.sim.delta.Lnw)}
              reductionPct={p.sim.perceivedImpactPct}
            />
          </div>
        </section>
      ) : null}

      <PartnerEstimateCard areaM2={p.room.ceilingAreaM2} />

      <div className={`${styles.closeRow} ${canSaveHere ? '' : styles.closeRowSingle}`}>
        <section className={styles.panel} data-reveal aria-label="Уникальность системы MultiFrame">
          <h2>Уникальность MultiFrame</h2>
          <ul className={styles.uniqGrid}>
            {MULTIFRAME_PILLARS.map((item) => (
              <li key={item.title} className={styles.uniqPillar}>
                <span className={styles.uniqPillarMark} aria-hidden />
                <div className={styles.uniqPillarBody}>
                  <strong>{item.title}</strong>
                  <p>{item.text}</p>
                </div>
              </li>
            ))}
          </ul>
        </section>

        {canSaveHere ? (
          <section
            className={`${styles.panel} ${styles.nextPanel}`}
            data-reveal
            aria-label="Следующий шаг"
          >
            <h2>Следующий шаг</h2>
            <p className={styles.panelLead}>
              {linkedRoom ? 'Результат запишется в эту комнату.' : 'Запись останется в комнате проекта.'}
            </p>
            <SaveObjectCard />
          </section>
        ) : null}
      </div>
    </div>
  );
}
