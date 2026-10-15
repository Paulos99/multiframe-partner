import { useEffect } from 'react';
import { useDemoPlayer, preloadDemoAudio } from '../audio/useDemoPlayer';
import { buildRoomAudioShapeForPair } from '../audio/roomAudioShape';
import type { AudioPair, DerivedSimulation, RoomWishOption } from '../state/types';
import { wishAudioLead, wishAudioOrder, wishPrimaryGroup } from '../state/wish';
import { track } from '../analytics';
import styles from './CompactAudio.module.css';

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

const GROUP_TITLES: Record<AudioPair['group'], string> = {
  air: 'Воздушный шум',
  impact: 'Ударный шум',
  mixed: 'Смешанный шум',
  echo: 'Эхо в комнате (акустический комфорт)',
};

type Props = {
  pairs: AudioPair[];
  sim: DerivedSimulation;
  wish?: RoomWishOption;
  /** Hide built-in header when parent column provides the title. */
  hideHead?: boolean;
  /** Stack noise groups vertically (narrow side column). */
  stacked?: boolean;
};

export function CompactAudio({
  pairs,
  sim,
  wish = 'general',
  hideHead = false,
  stacked = false,
}: Props) {
  const { activeId, progress, play, stop } = useDemoPlayer();
  const groups = wishAudioOrder(wish);
  const primary = wishPrimaryGroup(wish);

  useEffect(() => {
    const urls = [...new Set(pairs.flatMap((p) => [p.beforeSrc, p.afterSrc]))];
    void preloadDemoAudio(urls);
  }, [pairs]);

  return (
    <section
      className={`${styles.wrap} ${hideHead ? styles.wrapEmbedded : ''}`}
      aria-label="Сравнить звук до и после"
    >
      {!hideHead ? (
        <header className={styles.head}>
          <h3>Послушайте «До» и «После»</h3>
          <p>{wishAudioLead(wish)}</p>
        </header>
      ) : null}

      <div className={`${styles.groups} ${stacked ? styles.groupsStack : ''}`}>
        {groups.map((group) => {
          const groupPairs = pairs.filter((p) => p.group === group);
          if (!groupPairs.length) return null;
          const featured =
            group === primary &&
            (wish === 'from_above' || wish === 'privacy_out' || wish === 'music_recording');
          return (
            <div
              key={group}
              className={`${styles.group} ${featured ? styles.groupFeatured : ''}`}
            >
              <strong className={styles.groupTitle}>
                {GROUP_TITLES[group]}
                {featured ? (
                  <>
                    {' '}
                    <span className={styles.groupBadge}>важно для вас</span>
                  </>
                ) : null}
              </strong>

              <div className={styles.examples}>
                {groupPairs.map((pair) => {
                  const beforeId = `${pair.id}:before`;
                  const afterId = `${pair.id}:after`;
                  const beforeOn = activeId === beforeId;
                  const afterOn = activeId === afterId;
                  const shape = buildRoomAudioShapeForPair(sim, pair);
                  return (
                    <div key={pair.id} className={styles.example}>
                      <span className={styles.exampleLabel}>{pair.label}</span>
                      <div className={styles.controls}>
                        <button
                          type="button"
                          className={`${styles.btn} ${styles.before} ${
                            beforeOn ? styles.playing : ''
                          }`}
                          aria-pressed={beforeOn}
                          aria-label={
                            beforeOn ? `Пауза: До, ${pair.label}` : `Слушать До: ${pair.label}`
                          }
                          onClick={() => {
                            if (beforeOn) stop();
                            else {
                              track('pm_audio_play', {
                                group: pair.group,
                                side: 'before',
                                stem: pair.id,
                              });
                              void play(beforeId, pair.beforeSrc, {
                                side: 'before',
                                group: pair.group,
                                shape,
                                deltaRw: sim.delta.Rw,
                                deltaLnw: Math.abs(sim.delta.Lnw),
                              });
                            }
                          }}
                        >
                          <PlayIcon playing={beforeOn} />
                          <span>До</span>
                          {beforeOn ? (
                            <span className={styles.bar} aria-hidden>
                              <span style={{ width: `${Math.round(progress * 100)}%` }} />
                            </span>
                          ) : null}
                        </button>
                        <button
                          type="button"
                          className={`${styles.btn} ${styles.after} ${
                            afterOn ? styles.playing : ''
                          }`}
                          aria-pressed={afterOn}
                          aria-label={
                            afterOn
                              ? `Пауза: После, ${pair.label}`
                              : `Слушать После: ${pair.label}`
                          }
                          onClick={() => {
                            if (afterOn) stop();
                            else {
                              track('pm_audio_play', {
                                group: pair.group,
                                side: 'after',
                                stem: pair.id,
                              });
                              void play(afterId, pair.afterSrc, {
                                side: 'after',
                                group: pair.group,
                                shape,
                                deltaRw: sim.delta.Rw,
                                deltaLnw: Math.abs(sim.delta.Lnw),
                              });
                            }
                          }}
                        >
                          <PlayIcon playing={afterOn} />
                          <span>После</span>
                          {afterOn ? (
                            <span className={styles.bar} aria-hidden>
                              <span style={{ width: `${Math.round(progress * 100)}%` }} />
                            </span>
                          ) : null}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
