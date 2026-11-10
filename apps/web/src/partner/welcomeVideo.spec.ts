import { describe, expect, it } from 'vitest';
import { shouldShowWelcomeVideo, welcomeVideoLength } from './WelcomeVideo';

describe('welcome video on first visit', () => {
  it('shows only for partner roles with a pending server flag', () => {
    for (const role of ['owner', 'sales', 'measurer', 'crew'] as const) {
      expect(shouldShowWelcomeVideo({ role, welcomeVideoPending: true })).toBe(true);
      expect(shouldShowWelcomeVideo({ role, welcomeVideoPending: false })).toBe(false);
      expect(shouldShowWelcomeVideo({ role })).toBe(false);
    }
    expect(shouldShowWelcomeVideo({ role: 'admin', welcomeVideoPending: true })).toBe(false);
    expect(shouldShowWelcomeVideo({ role: 'stp_manager', welcomeVideoPending: true })).toBe(false);
    expect(shouldShowWelcomeVideo(null)).toBe(false);
  });

  it('describes the length in plain words', () => {
    expect(welcomeVideoLength('2:36')).toBe('2,5 минуты');
    expect(welcomeVideoLength('2:17')).toBe('2,5 минуты');
    expect(welcomeVideoLength('1:39')).toBe('1,5 минуты');
    expect(welcomeVideoLength('2:00')).toBe('2 минуты');
    expect(welcomeVideoLength('5:10')).toBe('5 минут');
    expect(welcomeVideoLength('0:40')).toBe('пару минут');
    expect(welcomeVideoLength('')).toBe('пару минут');
  });
});
