export type ThemeMode = 'light' | 'dark';

export const THEME_MODE_KEY = 'mytitan_theme_mode';

export function getThemeMode(): ThemeMode {
  if (typeof window === 'undefined') return 'light';
  const value = window.localStorage.getItem(THEME_MODE_KEY);
  return value === 'dark' ? 'dark' : 'light';
}

export function applyThemeMode(mode: ThemeMode) {
  if (typeof document === 'undefined') return;
  if (mode === 'dark') {
    document.documentElement.classList.add('dark');
    return;
  }
  document.documentElement.classList.remove('dark');
}

export function setThemeMode(mode: ThemeMode) {
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(THEME_MODE_KEY, mode);
  }
  applyThemeMode(mode);
}
