import { describe, expect, it } from 'vitest';
import { MASTER_PLAYBACK_GAIN, stemIdFromSrc, stemSideGain } from './stemCalibration';
import { DEMO_AUDIO_PAIRS } from './demoAudio';

describe('громкость пылесоса «До» и «После»', () => {
  it('пылесос: «До» ×0.8, «После» ×0.95', () => {
    expect(stemSideGain('vacuum', 'before')).toBe(0.8);
    expect(stemSideGain('vacuum', 'after')).toBe(0.95);
  });

  it('остальные звуки не меняются', () => {
    for (const id of ['music', 'stomp', 'clap', 'talk'] as const) {
      expect(stemSideGain(id, 'before')).toBe(1);
      expect(stemSideGain(id, 'after')).toBe(1);
    }
  });

  it('пара «Пылесос» в демо читается как пылесос', () => {
    const pair = DEMO_AUDIO_PAIRS.find((p) => p.label === 'Пылесос');
    expect(pair).toBeTruthy();
    expect(stemIdFromSrc(pair!.beforeSrc)).toBe('vacuum');
    expect(MASTER_PLAYBACK_GAIN * stemSideGain('vacuum', 'before')).toBeCloseTo(0.496, 3);
  });
});

describe('общая громкость «До» и «После»', () => {
  it('×0,5 одним множителем для всех звуков', async () => {
    const { PLAYBACK_LEVEL } = await import('./stemCalibration');
    expect(PLAYBACK_LEVEL).toBe(0.5);
    expect(MASTER_PLAYBACK_GAIN).toBe(0.62);
  });
});

describe('громкость по типу шума', () => {
  it('ударный и смешанный ×1/3, воздушный «До» ×0,35 и «После» ×0,7, эхо ×0,7', async () => {
    const { groupLevel } = await import('./stemCalibration');
    for (const side of ['before', 'after'] as const) {
      expect(groupLevel('impact', side)).toBeCloseTo(1 / 3, 6);
      expect(groupLevel('mixed', side)).toBeCloseTo(1 / 3, 6);
      expect(groupLevel('echo', side)).toBe(0.7);
    }
    expect(groupLevel('air', 'after')).toBe(0.7);
    expect(groupLevel('air', 'before')).toBe(0.35);
  });
});
