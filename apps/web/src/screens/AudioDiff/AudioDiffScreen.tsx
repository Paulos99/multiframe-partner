import { useEffect } from 'react';
import { Screen } from '../../ui/Screen';
import { useSession } from '../../state/SessionContext';
import { preloadDemoAudio, useDemoPlayer } from '../../audio/useDemoPlayer';
import { AUDIO_GROUP_LABELS } from '../../audio/demoAudio';
import { buildRoomAudioShapeForPair } from '../../audio/roomAudioShape';
import { LOG_DB_FOOTNOTE } from '../../state/types';
import { deriveSimulation } from '../../state/simulation';
import type { AudioPair, DerivedSimulation } from '../../state/types';
import styles from './AudioDiffScreen.module.css';

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

function NowPlaying({ progress }: { progress: number }) {
  return (
    <>
      <span className={styles.nowPlaying} aria-live="polite">
        <span className={styles.eq} aria-hidden>
          <i />
          <i />
          <i />
        </span>
        <span className={styles.nowPlayingText}>
          <strong>Играет</strong>
          <span>нажмите — пауза</span>
        </span>
      </span>
      <span className={styles.bar} aria-hidden>
        <span style={{ width: `${Math.round(progress * 100)}%` }} />
      </span>
    </>
  );
}

type SideProps = {
  playing: boolean;
  progress: number;
  side: 'before' | 'after';
  title: string;
  subtitle: string;
  ariaLabel: string;
  onToggle: () => void;
};

function SideButton({
  playing,
  progress,
  side,
  title,
  subtitle,
  ariaLabel,
  onToggle,
}: SideProps) {
  return (
    <button
      type="button"
      className={`${styles.play} ${styles[side]} ${playing ? styles.playing : ''}`}
      aria-pressed={playing}
      aria-label={ariaLabel}
      onClick={onToggle}
    >
      <span className={`${styles.icon} ${playing ? styles.iconPlaying : ''}`}>
        <PlayIcon playing={playing} />
      </span>
      <span className={styles.meta}>
        <strong className={side === 'before' ? styles.loudLabel : styles.quietLabel}>
          {title}
        </strong>
        <small>{subtitle}</small>
        {playing ? <NowPlaying progress={progress} /> : null}
      </span>
    </button>
  );
}

function reductionLine(group: AudioPair['group'], sim: DerivedSimulation): string {
  const airPct = sim.perceivedAirPct;
  const impactPct = sim.perceivedImpactPct;
  const airDb = Math.abs(sim.delta.Rw);
  const impactDb = Math.abs(sim.delta.Lnw);

  if (group === 'air') {
    return `≈ −${airPct}% · −${airDb} дБ`;
  }
  if (group === 'impact') {
    return `≈ −${impactPct}% · −${impactDb} дБ`;
  }
  const pct = Math.round((airPct + impactPct) / 2);
  const db = Math.round((airDb + impactDb) / 2);
  return `≈ −${pct}% · −${db} дБ`;
}

const GROUPS: Array<AudioPair['group']> = ['air', 'impact', 'mixed'];

export function AudioDiffScreen() {
  const { session } = useSession();
  const { activeId, progress, play, stop } = useDemoPlayer();
  const sim = session.derived?.simulation ?? deriveSimulation(session.answers);

  useEffect(() => {
    const urls = [
      ...new Set(session.audio.pairs.flatMap((p) => [p.beforeSrc, p.afterSrc])),
    ];
    void preloadDemoAudio(urls);
  }, [session.audio.pairs]);

  return (
    <Screen
      title="Услышать разницу"
      subtitle="Сравните звук обычного потолка и потолка с MultiFrame"
    >
      {GROUPS.map((group) => {
        const pairs = session.audio.pairs.filter((p) => p.group === group);
        if (!pairs.length) return null;
        const meta = AUDIO_GROUP_LABELS[group];
        return (
          <section key={group} className={styles.group}>
            <header className={styles.groupHead}>
              <div>
                <h2>{meta.title}</h2>
                <p>{meta.help}</p>
              </div>
              <p className={styles.reduction}>{reductionLine(group, sim)}</p>
            </header>

            {group === 'impact' || group === 'mixed' ? (
              <p className={styles.honesty}>
                Потолок смягчает шаги сверху.
              </p>
            ) : null}

            {pairs.map((pair) => {
              const beforeId = `${pair.id}:before`;
              const afterId = `${pair.id}:after`;
              const beforeOn = activeId === beforeId;
              const afterOn = activeId === afterId;
              const shape = buildRoomAudioShapeForPair(sim, pair);
              return (
                <article key={pair.id} className={styles.pair}>
                  <header className={styles.pairHead}>
                    <h3>{pair.label}</h3>
                  </header>
                  <div className={styles.controls}>
                    <SideButton
                      side="before"
                      playing={beforeOn}
                      progress={progress}
                      title="До"
                      subtitle={pair.beforeLabel}
                      ariaLabel={
                        beforeOn
                          ? `Пауза: До, ${pair.label}`
                          : `Слушать До: ${pair.label}`
                      }
                      onToggle={() => {
                        if (beforeOn) stop();
                        else
                          void play(beforeId, pair.beforeSrc, {
                            side: 'before',
                            group: pair.group,
                            shape,
                            deltaRw: sim.delta.Rw,
                            deltaLnw: Math.abs(sim.delta.Lnw),
                          });
                      }}
                    />
                    <SideButton
                      side="after"
                      playing={afterOn}
                      progress={progress}
                      title="После"
                      subtitle={pair.afterLabel}
                      ariaLabel={
                        afterOn
                          ? `Пауза: После, ${pair.label}`
                          : `Слушать После: ${pair.label}`
                      }
                      onToggle={() => {
                        if (afterOn) stop();
                        else
                          void play(afterId, pair.afterSrc, {
                            side: 'after',
                            group: pair.group,
                            shape,
                            deltaRw: sim.delta.Rw,
                            deltaLnw: Math.abs(sim.delta.Lnw),
                          });
                      }}
                    />
                  </div>
                </article>
              );
            })}
          </section>
        );
      })}

      <p className={styles.footnote}>{LOG_DB_FOOTNOTE}</p>
    </Screen>
  );
}
