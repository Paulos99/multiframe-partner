import { describe, expect, it } from 'vitest';
import { allowDeviceLogin } from './loginFallback';
import { noTrailingDot, offlineBannerText } from './MaterialsPanel';

describe('вход без сервера', () => {
  it('боевая сборка: никогда, даже при обрыве связи и для демо-роли', () => {
    for (const demoAccount of [false, true]) {
      for (const transientError of [false, true]) {
        expect(allowDeviceLogin({ demoEnabled: false, demoAccount, transientError })).toBe(false);
      }
    }
  });
  it('демо: неверный пароль обычного входа (401) не впускает по демо-паролю', () => {
    expect(allowDeviceLogin({ demoEnabled: true, demoAccount: false, transientError: false })).toBe(false);
  });
  it('демо: выбранная демо-роль и обрыв связи — впускает', () => {
    expect(allowDeviceLogin({ demoEnabled: true, demoAccount: true, transientError: false })).toBe(true);
    expect(allowDeviceLogin({ demoEnabled: true, demoAccount: false, transientError: true })).toBe(true);
  });
});

describe('плашка «сохранённые копии»', () => {
  it('одно короткое предложение без «выйдите и войдите» и без дат', () => {
    for (const relogin of [false, true]) {
      for (const noNetwork of [false, true]) {
        const text = offlineBannerText(relogin, noNetwork);
        expect(text.length).toBeLessThanOrEqual(60);
        expect(text.match(/[.!?]/g)).toHaveLength(1);
        expect(text.endsWith('.')).toBe(true);
        expect(text).not.toMatch(/выйд|офлайн|октябр|проверьте/i);
      }
    }
    expect(noTrailingDot('x.')).toBe('x');
  });
});
