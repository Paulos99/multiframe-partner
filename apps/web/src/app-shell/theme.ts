import { useEffect, useState } from 'react';

export const THEME_KEY = 'mf_theme';

export type ThemeChoice = 'light' | 'dark' | 'system';

const listeners = new Set<() => void>();

export function readThemeChoice(): ThemeChoice {
  try {
    const value = localStorage.getItem(THEME_KEY);
    if (value === 'dark' || value === 'light') return value;
  } catch {
    /* приватный режим */
  }
  return 'system';
}

function systemPrefersDark(): boolean {
  try {
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  } catch {
    return false;
  }
}

export function themeIsDark(choice: ThemeChoice = readThemeChoice()): boolean {
  if (choice === 'dark') return true;
  if (choice === 'light') return false;
  return systemPrefersDark();
}

/** Ставит класс на body. В localStorage пишет только явный переключатель. */
export function applyStoredTheme(): boolean {
  const dark = themeIsDark();
  if (typeof document !== 'undefined') {
    document.body.classList.toggle('theme-dark', dark);
  }
  return dark;
}

function publish(): void {
  applyStoredTheme();
  listeners.forEach((fn) => fn());
}

export function persistTheme(choice: 'light' | 'dark'): void {
  try {
    localStorage.setItem(THEME_KEY, choice);
  } catch {
    /* ignore */
  }
  publish();
}

export function useTheme() {
  const [choice, setChoice] = useState<ThemeChoice>(readThemeChoice);
  const [dark, setDark] = useState(() => themeIsDark(readThemeChoice()));

  useEffect(() => {
    const sync = () => {
      const next = readThemeChoice();
      setChoice(next);
      setDark(applyStoredTheme());
    };
    sync();
    listeners.add(sync);
    return () => {
      listeners.delete(sync);
    };
  }, []);

  useEffect(() => {
    if (choice !== 'system') return;
    let mq: MediaQueryList;
    try {
      mq = window.matchMedia('(prefers-color-scheme: dark)');
    } catch {
      return;
    }
    const onChange = () => setDark(applyStoredTheme());
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [choice]);

  function toggle() {
    persistTheme(themeIsDark() ? 'light' : 'dark');
  }

  return { choice, dark, toggle };
}
