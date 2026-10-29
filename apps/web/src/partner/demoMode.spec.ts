import { afterEach, describe, expect, it, vi } from 'vitest';
import { isDemoModeEnabled } from './demoMode';

describe('isDemoModeEnabled', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('включается флагом сборки', () => {
    vi.stubEnv('VITE_DEMO_MODE', 'true');
    expect(isDemoModeEnabled()).toBe(true);
  });

  it.each(['1', 'true'])('VITE_DISABLE_DEMO=%s выключает демо даже при флаге сборки', (value) => {
    vi.stubEnv('VITE_DEMO_MODE', 'true');
    vi.stubEnv('VITE_DISABLE_DEMO', value);
    expect(isDemoModeEnabled()).toBe(false);
  });
});
