import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { preloadDemoAudio, useDemoPlayer } from '../audio/useDemoPlayer';
import { ECHO_CLAP_PAIR } from '../audio/demoAudio';
import { buildRoomAudioShapeForPair } from '../audio/roomAudioShape';
import type { DerivedSimulation } from '../state/types';
import styles from './EchoComfort.module.css';

type Props = {
  sim: DerivedSimulation;
  /** Wide dashboard: chip play controls; gauges optional. */
  variant?: 'default' | 'dashboard';
  /** Ring gauges (dashboard). Set false when rings live in KPI row. */
  showGauges?: boolean;
  /** Hide local header when parent column already titles the block. */
  hideHead?: boolean;
};

function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

export function EchoComfortRings({
  before,
  after,
  compact,
  hoverPlay,
}: {
  /** Echo % before (higher = worse). Rings show comfort = 100 − echo. */
  before: number;
  after: number;
  compact?: boolean;
  /** Parent bumps this (e.g. KPI card hover) to replay both rings. */
  hoverPlay?: number;
}) {
  const comfortBefore = Math.max(0, Math.min(100, 100 - before));
  const comfortAfter = Math.max(0, Math.min(100, 100 - after));
  const echoDrop = before - after;
  const [localHover, setLocalHover] = useState(0);
  const ownedByParent = hoverPlay != null;
  const play = ownedByParent ? hoverPlay : localHover;

  return (
    <div
      className={`${styles.rings} ${compact ? styles.ringsCompact : ''}`}
      role="img"
      aria-label={`Акустический комфорт: сейчас ${comfortBefore}%, с MultiFrame ${comfortAfter}%. Больше — лучше. Эхо снизилось на ${Math.max(0, echoDrop)}%.`}
      onMouseEnter={() => {
        if (!ownedByParent) setLocalHover((n) => n + 1);
      }}
    >
      <EchoRing
        pct={comfortBefore}
        label="Сейчас"
        compact={compact}
        delayMs={0}
        hoverPlay={play}
      />
      <EchoRing
        pct={comfortAfter}
        label="После"
        accent
        compact={compact}
        delayMs={120}
        hoverPlay={play}
      />
      {echoDrop > 0 ? (
        <p className={`${styles.scaleDelta} ${styles.scaleDeltaPill}`}>
          ≈ на {echoDrop}% меньше эха
        </p>
      ) : null}
    </div>
  );
}

function PlayIcon({ playing }: { playing: boolean }) {
  if (playing) {
    return (
      <span className={styles.pauseGlyph} aria-hidden>
        <i />
        <i />
      </span>
    );
  }
  return <span className={styles.playGlyph} aria-hidden />;
}

function EchoRing({
  pct,
  label,
  accent,
  compact,
  delayMs = 0,
  hoverPlay = 0,
}: {
  pct: number;
  label: string;
  accent?: boolean;
  compact?: boolean;
  delayMs?: number;
  /** Parent bumps this to replay both rings together. */
  hoverPlay?: number;
}) {
  const r = compact ? 26 : 34;
  const vb = compact ? 64 : 80;
  const mid = vb / 2;
  const c = 2 * Math.PI * r;
  const clamped = Math.max(0, Math.min(100, pct));
  const targetOffset = c * (1 - clamped / 100);

  const rootRef = useRef<HTMLDivElement>(null);
  const cancelRef = useRef<() => void>(() => {});
  const [playId, setPlayId] = useState(0);
  const [displayPct, setDisplayPct] = useState(0);
  const [fillMs, setFillMs] = useState(900);
  const [animDelay, setAnimDelay] = useState(delayMs);

  const runFill = (fromHover: boolean) => {
    cancelRef.current();
    if (prefersReducedMotion()) {
      setDisplayPct(clamped);
      setAnimDelay(0);
      setPlayId((n) => n + 1);
      return;
    }
    const dur = fromHover ? 700 : 900;
    const startDelay = fromHover ? 0 : delayMs;
    setFillMs(dur);
    setAnimDelay(startDelay);
    setDisplayPct(0);
    setPlayId((n) => n + 1);

    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, Math.max(0, (now - start - startDelay) / dur));
      const eased = 1 - (1 - t) ** 3;
      setDisplayPct(Math.round(clamped * eased));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    cancelRef.current = () => cancelAnimationFrame(raf);
  };

  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const parentReveal = el.closest('[data-reveal]');
    const start = () => runFill(false);

    if (!parentReveal || parentReveal.classList.contains('is-revealed')) {
      const t = window.setTimeout(start, 40);
      return () => {
        window.clearTimeout(t);
        cancelRef.current();
      };
    }

    const mo = new MutationObserver(() => {
      if (parentReveal.classList.contains('is-revealed')) {
        start();
        mo.disconnect();
      }
    });
    mo.observe(parentReveal, { attributes: true, attributeFilter: ['class'] });
    return () => {
      mo.disconnect();
      cancelRef.current();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- replay only on pct / mount
  }, [clamped, delayMs]);

  useEffect(() => {
    if (hoverPlay > 0) runFill(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional hover replay
  }, [hoverPlay]);

  return (
    <div
      ref={rootRef}
      className={`${styles.ring} ${accent ? styles.ringAccent : ''} ${compact ? styles.ringCompact : ''}`}
    >
      <svg viewBox={`0 0 ${vb} ${vb}`} className={styles.ringSvg} aria-hidden>
        <circle className={styles.ringTrack} cx={mid} cy={mid} r={r} />
        <circle
          key={playId}
          className={styles.ringValue}
          cx={mid}
          cy={mid}
          r={r}
          style={
            {
              strokeDasharray: c,
              strokeDashoffset: c,
              ['--ring-target']: String(targetOffset),
              animationDuration: `${fillMs}ms`,
              animationDelay: `${animDelay}ms`,
            } as CSSProperties
          }
          transform={`rotate(-90 ${mid} ${mid})`}
        />
      </svg>
      <div className={styles.ringCenter}>
        <b key={playId} className={styles.ringPct}>
          {displayPct}%
        </b>
        <span>{label}</span>
      </div>
    </div>
  );
}

export function EchoComfort({
  sim,
  variant = 'default',
  showGauges = true,
  hideHead = false,
}: Props) {
  const { activeId, progress, play, stop } = useDemoPlayer();
  const rev = sim.reverb;
  const pair = ECHO_CLAP_PAIR;
  const shape = buildRoomAudioShapeForPair(sim, pair);
  const beforeId = `${pair.id}:before`;
  const afterId = `${pair.id}:after`;
  const beforeOn = activeId === beforeId;
  const afterOn = activeId === afterId;
  const echoDrop = rev.echoInRoomBefore - rev.echoInRoomAfter;
  const dashboard = variant === 'dashboard';

  useEffect(() => {
    void preloadDemoAudio([pair.beforeSrc]);
  }, [pair.beforeSrc]);

  return (
    <section
      className={`${styles.wrap} ${dashboard ? styles.wrapDash : ''}`}
      aria-label="Эхо в комнате (акустический комфорт)"
    >
      {!hideHead ? (
        <header className={styles.head}>
          <h3>Эхо в комнате (акустический комфорт)</h3>
          <p>
            MultiFrame — не только изоляция сверху. Перфорация гасит эхо в самой комнате.
          </p>
        </header>
      ) : null}

      {dashboard && showGauges ? (
        <EchoComfortRings before={rev.echoInRoomBefore} after={rev.echoInRoomAfter} />
      ) : null}

      {!dashboard ? (
        <div
          className={styles.scale}
          role="img"
          aria-label={`Эхо в помещении: сейчас ${rev.echoInRoomBefore}%, с MultiFrame ${rev.echoInRoomAfter}%. Меньше — лучше.`}
        >
          <p className={styles.scaleCaption}>
            Порхающее эхо в комнате · чем меньше процент, тем суше звук
          </p>
          <div className={styles.scaleRow}>
            <span className={styles.scaleLabel}>Сейчас</span>
            <div className={styles.track}>
              <span className={styles.fillBefore} style={{ width: `${rev.echoInRoomBefore}%` }} />
            </div>
            <b className={styles.pct}>{rev.echoInRoomBefore}%</b>
          </div>
          <div className={styles.scaleRow}>
            <span className={styles.scaleLabel}>С MultiFrame</span>
            <div className={styles.track}>
              <span className={styles.fillAfter} style={{ width: `${rev.echoInRoomAfter}%` }} />
            </div>
            <b className={styles.pctMf}>{rev.echoInRoomAfter}%</b>
          </div>
          {echoDrop > 0 ? (
            <p className={styles.scaleDelta}>≈ на {echoDrop}% меньше эха в помещении</p>
          ) : null}
        </div>
      ) : null}

      <div className={`${styles.player} ${dashboard ? styles.playerDash : ''}`}>
        <strong className={styles.playerTitle}>{pair.label}</strong>
        <div className={styles.controls}>
          <button
            type="button"
            className={`${styles.btn} ${styles.before} ${beforeOn ? styles.playing : ''} ${dashboard ? styles.btnInline : ''}`}
            aria-pressed={beforeOn}
            aria-label={beforeOn ? `Пауза: До, ${pair.label}` : `Слушать До: ${pair.label}`}
            onClick={() => {
              if (beforeOn) stop();
              else
                void play(beforeId, pair.beforeSrc, {
                  side: 'before',
                  group: 'echo',
                  shape,
                });
            }}
          >
            {dashboard ? (
              <span className={styles.btnCore}>
                <span className={styles.icon}>
                  <PlayIcon playing={beforeOn} />
                </span>
                <strong>До</strong>
              </span>
            ) : (
              <>
                <span className={styles.icon}>
                  <PlayIcon playing={beforeOn} />
                </span>
                <span className={styles.meta}>
                  <strong>До</strong>
                  <small>с эхом</small>
                </span>
              </>
            )}
            {beforeOn ? (
              <span className={styles.bar} aria-hidden>
                <span style={{ width: `${Math.round(progress * 100)}%` }} />
              </span>
            ) : null}
          </button>
          <button
            type="button"
            className={`${styles.btn} ${styles.after} ${afterOn ? styles.playing : ''} ${dashboard ? styles.btnInline : ''}`}
            aria-pressed={afterOn}
            aria-label={afterOn ? `Пауза: После, ${pair.label}` : `Слушать После: ${pair.label}`}
            onClick={() => {
              if (afterOn) stop();
              else
                void play(afterId, pair.afterSrc, {
                  side: 'after',
                  group: 'echo',
                  shape,
                });
            }}
          >
            {dashboard ? (
              <span className={styles.btnCore}>
                <span className={styles.icon}>
                  <PlayIcon playing={afterOn} />
                </span>
                <strong>После</strong>
              </span>
            ) : (
              <>
                <span className={styles.icon}>
                  <PlayIcon playing={afterOn} />
                </span>
                <span className={styles.meta}>
                  <strong>После</strong>
                  <small>меньше эха</small>
                </span>
              </>
            )}
            {afterOn ? (
              <span className={styles.bar} aria-hidden>
                <span style={{ width: `${Math.round(progress * 100)}%` }} />
              </span>
            ) : null}
          </button>
        </div>
      </div>
    </section>
  );
}
