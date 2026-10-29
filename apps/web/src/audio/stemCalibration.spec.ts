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
