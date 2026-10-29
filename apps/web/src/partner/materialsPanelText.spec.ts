import { describe, expect, it } from 'vitest';
import { noTrailingDot } from './MaterialsPanel';
import { MATERIALS_SESSION_EXPIRED } from './materialsClient';

describe('noTrailingDot', () => {
  it('убирает конечную точку, чтобы после неё не получалось «..»', () => {
    expect(noTrailingDot(MATERIALS_SESSION_EXPIRED)).toBe('Сессия истекла. Войдите заново');
    expect(`${noTrailingDot(MATERIALS_SESSION_EXPIRED)}.`).not.toContain('..');
  });
  it('не трогает текст без точки и убирает пробелы в конце', () => {
    expect(noTrailingDot('Нет сети')).toBe('Нет сети');
    expect(noTrailingDot('Нет связи.  ')).toBe('Нет связи');
    expect(noTrailingDot('Ошибка...')).toBe('Ошибка');
  });
});
