import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { PasswordInput } from './PasswordInput';

describe('PasswordInput', () => {
  it('по умолчанию скрывает пароль и ставит глазок с русской подписью', () => {
    const html = renderToStaticMarkup(
      createElement(PasswordInput, {
        name: 'password',
        autoComplete: 'current-password',
        required: true,
      }),
    );
    expect(html).toContain('type="password"');
    expect(html).toContain('name="password"');
    expect(html).toContain('autoComplete="current-password"');
    expect(html).toContain('required');
    expect(html).toContain('type="button"');
    expect(html).toContain('Показать пароль');
    expect(html).toContain('aria-pressed="false"');
    expect(html).not.toContain('type="submit"');
  });

  it('передаёт autocomplete и может сразу показывать пароль', () => {
    const html = renderToStaticMarkup(
      createElement(PasswordInput, {
        autoComplete: 'new-password',
        defaultRevealed: true,
      }),
    );
    expect(html).toContain('type="text"');
    expect(html).toContain('autoComplete="new-password"');
    expect(html).toContain('Скрыть пароль');
    expect(html).toContain('aria-pressed="true"');
  });
});
