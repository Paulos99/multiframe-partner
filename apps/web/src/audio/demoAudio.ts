import type { AudioPair } from '../state/types';

const base = import.meta.env?.BASE_URL ?? '/';

/** Dry household stems — До/После share one file; processing is runtime. */
export const DEMO_AUDIO_PAIRS: AudioPair[] = [
  {
    id: 'air_music',
    label: 'Громкая музыка',
    group: 'air',
    beforeLabel: 'До',
    afterLabel: 'После',
    beforeSrc: `${base}audio/music.mp3`,
    afterSrc: `${base}audio/music.mp3`,
  },
  {
    id: 'impact_stomp',
    label: 'Топот и шаги',
    group: 'impact',
    beforeLabel: 'До',
    afterLabel: 'После',
    beforeSrc: `${base}audio/stomp.mp3`,
    afterSrc: `${base}audio/stomp.mp3`,
  },
  {
    id: 'mixed_vacuum',
    label: 'Пылесос',
    group: 'mixed',
    beforeLabel: 'До',
    afterLabel: 'После',
    beforeSrc: `${base}audio/vacuum.mp3`,
    afterSrc: `${base}audio/vacuum.mp3`,
  },
];

/** Four dry claps — room reverb (До/После) applied at playback from object stage. */
export const ECHO_CLAP_PAIR: AudioPair = {
  id: 'echo_clap',
  label: 'Хлопки в комнате',
  group: 'echo',
  beforeLabel: 'До',
  afterLabel: 'После',
  beforeSrc: `${base}audio/clap.mp3`,
  afterSrc: `${base}audio/clap.mp3`,
};

/** Unique stem URLs for prefetch / decode. */
export const DEMO_STEM_URLS: readonly string[] = [
  ...new Set([
    ...DEMO_AUDIO_PAIRS.flatMap((p) => [p.beforeSrc, p.afterSrc]),
    ECHO_CLAP_PAIR.beforeSrc,
  ]),
];

export type StubKind = 'before' | 'after';
export type StubScene = 'steps' | 'talk';

/** Legacy stub URLs — kept so old sessions / tests still parse. */
export function parseStubSrc(src: string): { kind: StubKind; scene: StubScene } | null {
  if (!src.startsWith('stub:')) return null;
  const parts = src.split(':');
  const kind = parts[1] as StubKind;
  const scene = (parts[2] ?? 'steps') as StubScene;
  if (kind !== 'before' && kind !== 'after') return null;
  return { kind, scene };
}

export const AUDIO_GROUP_LABELS = {
  air: { title: 'Воздушный шум', help: 'Музыка и голоса — через плиту.' },
  impact: { title: 'Ударный шум', help: 'Бег, мебель, когти — удар по плите.' },
  mixed: { title: 'Смешанный шум', help: 'И воздух, и удар сразу, как пылесос.' },
  echo: {
    title: 'Эхо в комнате (акустический комфорт)',
    help: 'Четыре хлопка показывают эхо в помещении до и после MultiFrame.',
  },
} as const;
