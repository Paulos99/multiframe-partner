import { useEffect, useState } from 'react';
import { SoundPressureHelpButton } from '../../ui/SoundPressureHelp';
import { useSession } from '../../state/SessionContext';
import {
  CONSULTATION_URL,
  HOUSE_TYPE_OPTIONS,
  NOISE_KIND_OPTIONS,
  NOISY_NEIGHBORS_OPTIONS,
  PLANNED_CEILING_OPTIONS,
  roomTypeLabel,
  SLAB_THICKNESS_OPTIONS,
  SLAB_TYPE_OPTIONS,
  shouldAskNoiseKind,
} from '../../state/types';
import {
  FELT_STEP_LABELS,
  FELT_STEPS,
  NORMS,
  airFeltFromIndex,
  comfortClassFor,
  deriveSimulation,
  impactFeltFromIndex,
  officialComfortLabel,
  type FeltStep,
} from '../../state/simulation';
import { buildCalculatorUrl } from '../../state/session';
import {
  downloadAcousticProfilePdf,
  prefetchAcousticProfilePdf,
  shareAcousticProfile,
} from '../../state/reportPdf';
import {
  caseVerdictParts,
  MULTIFRAME_PANEL_IMG,
  productAbout,
} from '../../state/recommendations';
import { primaryWish } from '../../state/wish';
import { eventParamsFromSession, track } from '../../analytics';
import { trackPartnerAnalytics } from '../../partner/analytics';
import styles from './resultShared.module.css';

/** Official SP thresholds А/Б/В + explicit «ниже допустимого» band. */
export const NORM_ROWS: { key: string; label: string; rw: string; lnw: string; muted?: boolean }[] =
  [
    { key: 'A', label: 'Высокий комфорт (А)', rw: `≥ ${NORMS.A.Rw}`, lnw: `≤ ${NORMS.A.Lnw}` },
    { key: 'B', label: 'Комфорт (Б)', rw: `≥ ${NORMS.B.Rw}`, lnw: `≤ ${NORMS.B.Lnw}` },
    { key: 'V', label: 'Допустимый (В)', rw: `≥ ${NORMS.V.Rw}`, lnw: `≤ ${NORMS.V.Lnw}` },
    {
      key: 'below',
      label: 'Ниже допустимого',
      rw: `< ${NORMS.V.Rw}`,
      lnw: `> ${NORMS.V.Lnw}`,
      muted: true,
    },
  ];

/** StP site pillars — title + one line, no vs-comparison with plain stretch film. */
export const MULTIFRAME_PILLARS = [
  {
    title: 'Звукоизоляция и акустический комфорт',
    text: 'Снижает шум сверху и поглощает звук в комнате — меньше эха, спокойнее пространство.',
  },
  {
    title: 'Безопасность',
    text: 'Материалы безопасны для жилых помещений: спальня, детская, кухня и ванная.',
  },
  {
    title: 'Экологичность',
    text: 'Без минеральной ваты и строительной пыли на объекте.',
  },
  {
    title: 'Быстрый монтаж',
    text: 'Сначала панели, затем натяжное полотно — без каркаса и без долгой стройки.',
  },
  {
    title: 'Универсальность',
    text: 'Подходит к любому типу перекрытия на любой стадии ремонта.',
  },
] as const;

export function optionLabel<T extends string>(
  options: { id: T; label: string }[],
  id: T | undefined,
): string {
  if (!id) return 'не указано';
  return options.find((o) => o.id === id)?.label ?? 'не указано';
}

function feltIndex(step: FeltStep): number {
  return FELT_STEPS.indexOf(step);
}

export function FeltScale({
  title,
  now,
  after,
  quieterPct,
  quieterDeltaDb,
  mode,
  indexKind,
  nowIndex,
  afterIndex,
}: {
  title: string;
  now: FeltStep;
  after?: FeltStep;
  quieterPct?: number;
  quieterDeltaDb?: number;
  mode: 'nowOnly' | 'nowAndAfter';
  /** SP construction index shown on this axis (not room L2). */
  indexKind: 'Rw' | 'Lnw';
  nowIndex: number;
  afterIndex?: number;
}) {
  const nowIdx = feltIndex(now);
  const afterIdx = after ? feltIndex(after) : -1;
  const same = mode === 'nowAndAfter' && after && now === after;
  const nowVal = Math.round(nowIndex);
  const afterVal = afterIndex != null ? Math.round(afterIndex) : null;
  const direction =
    indexKind === 'Rw' ? 'чем больше децибел, тем лучше изоляция' : 'чем меньше децибел, тем тише шаги';
  const indexWord = indexKind === 'Rw' ? 'изоляция воздуха' : 'удар сверху';

  return (
    <div
      className={styles.feltScale}
      role="img"
      aria-label={
        mode === 'nowOnly'
          ? `${title}: сейчас ${FELT_STEP_LABELS[now]}, ${indexWord} ≈ ${nowVal} дБ`
          : `${title}: сейчас ${FELT_STEP_LABELS[now]}, ${indexWord} ≈ ${nowVal} дБ; с MultiFrame ${
              after ? FELT_STEP_LABELS[after] : ''
            }${afterVal != null ? `, ${indexWord} ≈ ${afterVal} дБ` : ''}${
              quieterPct != null ? `, в комнате примерно на ${quieterPct}% тише` : ''
            }`
      }
    >
      <div className={styles.feltHead}>
        <strong>{title}</strong>
        {mode === 'nowAndAfter' && quieterPct != null ? (
          <b className={styles.quieterLine}>
            в комнате примерно на {quieterPct}% тише
            <SoundPressureHelpButton
              highlightDb={quieterDeltaDb}
              label={`Таблица снижения звукового давления для ${indexKind}`}
            />
          </b>
        ) : null}
      </div>

      <p className={styles.feltDb}>
        {mode === 'nowOnly' || afterVal == null ? (
          <>
            Сейчас: <b>{indexWord} ≈ {nowVal} дБ</b>
            <span className={styles.indexHint}>{indexKind}</span>
            <span> · {direction}</span>
          </>
        ) : (
          <>
            <b>{indexWord}</b>{' '}
            <span className={styles.indexHint}>{indexKind}</span>:{' '}
            <b>≈ {nowVal} дБ</b>
            <span aria-hidden> → </span>
            <b>≈ {afterVal} дБ</b>
            <span> · {direction}</span>
          </>
        )}
      </p>

      <div className={styles.feltTrack} aria-hidden>
        <span className={styles.feltLine} />
        {FELT_STEPS.map((step, i) => {
          const isNow = i === nowIdx;
          const isAfter = mode === 'nowAndAfter' && i === afterIdx;
          const both = same && isNow;
          const edge = i === 0 ? 'start' : i === FELT_STEPS.length - 1 ? 'end' : 'mid';
          return (
            <span
              key={step}
              className={`${styles.feltStep} ${isNow || isAfter || both ? styles.feltStepActive : ''}`}
              data-edge={edge}
              style={{ left: `${(i / (FELT_STEPS.length - 1)) * 100}%` }}
            >
              {both ? (
                <span className={`${styles.feltMark} ${styles.feltMarkBoth}`}>Сейчас · После</span>
              ) : (
                <>
                  {isNow ? <span className={styles.feltMark}>Сейчас</span> : null}
                  {isAfter ? (
                    <span className={`${styles.feltMark} ${styles.feltMarkMf}`}>После</span>
                  ) : null}
                </>
              )}
              <span className={styles.feltDot} data-danger={step === 'danger' ? '' : undefined} />
              <span className={styles.feltLabel}>{FELT_STEP_LABELS[step]}</span>
            </span>
          );
        })}
      </div>
    </div>
  );
}

/** Shared derived data + actions for the Result dashboard. */
export function useResultProfile() {
  const { session, restart } = useSession();
  const room = session.answers.room;
  const sim = session.derived?.simulation ?? deriveSimulation(session.answers);
  const hybridBefore = comfortClassFor(sim.before.Rw, sim.before.Lnw);
  const hybridAfter = comfortClassFor(sim.after.Rw, sim.after.Lnw);
  const beforeOfficial = officialComfortLabel(hybridBefore);
  const afterOfficial = officialComfortLabel(hybridAfter);

  const airNowFelt = airFeltFromIndex(sim.before.Rw);
  const airAfterFelt = airFeltFromIndex(sim.after.Rw);
  const impactNowFelt = impactFeltFromIndex(sim.before.Lnw);
  const impactAfterFelt = impactFeltFromIndex(sim.after.Lnw);

  const roomLabel = room.roomType ? roomTypeLabel(room) : null;
  const slabTypeLabel = optionLabel(SLAB_TYPE_OPTIONS, room.slabType);
  const slabThickLabel =
    !room.slabThickness || room.slabThickness === 'unknown'
      ? 'типовая ~220 мм'
      : optionLabel(SLAB_THICKNESS_OPTIONS, room.slabThickness);
  const houseLabel = optionLabel(HOUSE_TYPE_OPTIONS, room.houseType);
  const wishLabel = 'Все эффекты материала';
  const ceilingLabel = optionLabel(PLANNED_CEILING_OPTIONS, room.plannedCeiling);
  const neighborsLabel = optionLabel(NOISY_NEIGHBORS_OPTIONS, room.noisyNeighbors);
  const noiseKindLabel =
    shouldAskNoiseKind(room.noisyNeighbors) && room.noiseKind !== 'unknown'
      ? optionLabel(NOISE_KIND_OPTIONS, room.noiseKind)
      : null;
  const wish = primaryWish(room.roomWishes);
  const noiseType = session.derived?.noiseType ?? 'mixed';
  const caseVerdictParagraphs = caseVerdictParts(room, noiseType, {
    perceivedAirPct: sim.perceivedAirPct,
    perceivedImpactPct: sim.perceivedImpactPct,
  });
  const about = productAbout(room, noiseType);
  const slabContext =
    room.slabThickness === 'unknown' || !room.slabThickness
      ? room.slabType === 'unknown'
        ? 'типовая ~220 мм'
        : `${slabTypeLabel}, типовая ~220 мм`
      : `${slabTypeLabel}, ${slabThickLabel}`;

  const calcUrl = buildCalculatorUrl(session.cta);

  const [shareState, setShareState] = useState<'idle' | 'shared' | 'copied' | 'failed'>('idle');
  const [pdfBusy, setPdfBusy] = useState(false);
  const [pdfError, setPdfError] = useState(false);

  const partnerObject = {
    roomType: room.roomType || null,
    roomTypeCustom: room.roomTypeCustom || null,
    areaM2: room.ceilingAreaM2 ?? null,
    houseType: room.houseType || null,
    objectStage: room.objectStage || null,
    classBefore: hybridBefore,
    classAfter: hybridAfter,
    label: roomLabel,
  };

  useEffect(() => {
    prefetchAcousticProfilePdf();
  }, []);

  useEffect(() => {
    trackPartnerAnalytics({
      tool: 'problemomer',
      action: 'result',
      object: partnerObject,
    });
  }, []);

  function openCalc() {
    track('pm_cta_calc', eventParamsFromSession(session));
    window.open(calcUrl, '_blank', 'noopener,noreferrer');
  }

  function openConsultation() {
    track('pm_cta_consult', eventParamsFromSession(session));
    window.open(CONSULTATION_URL, '_blank', 'noopener,noreferrer');
  }

  async function onDownloadProfile() {
    if (pdfBusy) return;
    track('pm_pdf', eventParamsFromSession(session));
    trackPartnerAnalytics({ tool: 'problemomer', action: 'pdf', object: partnerObject });
    setPdfBusy(true);
    setPdfError(false);
    try {
      await downloadAcousticProfilePdf(session);
    } catch (err) {
      console.error('[pdf]', err);
      setPdfError(true);
    } finally {
      setPdfBusy(false);
    }
  }

  async function onShare() {
    track('pm_share', eventParamsFromSession(session));
    trackPartnerAnalytics({ tool: 'problemomer', action: 'share', object: partnerObject });
    const result = await shareAcousticProfile(session);
    setShareState(result === 'failed' ? 'failed' : result);
    window.setTimeout(() => setShareState('idle'), 2500);
  }

  const shareLabel =
    shareState === 'shared'
      ? 'Отправлено'
      : shareState === 'copied'
        ? 'Ссылка скопирована'
        : shareState === 'failed'
          ? 'Не удалось поделиться'
          : 'Поделиться';

  return {
    session,
    restart,
    room,
    sim,
    hybridBefore,
    hybridAfter,
    beforeOfficial,
    afterOfficial,
    airNowFelt,
    airAfterFelt,
    impactNowFelt,
    impactAfterFelt,
    roomLabel,
    houseLabel,
    wishLabel,
    ceilingLabel,
    neighborsLabel,
    noiseKindLabel,
    wish,
    noiseType,
    caseVerdictParagraphs,
    productClaim: about.claim,
    productParagraphs: about.paragraphs,
    productImageSrc: MULTIFRAME_PANEL_IMG,
    slabContext,
    pdfBusy,
    pdfError,
    shareLabel,
    openCalc,
    openConsultation,
    onDownloadProfile,
    onShare,
  };
}
