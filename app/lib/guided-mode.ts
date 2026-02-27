export const GUIDED_MODE_STORAGE_KEY = 'mytitan_guided_mode';

export type GuidedMode = 'on' | 'off';

function getGuidedQueryValue(value: string | string[] | undefined): GuidedMode | null {
  const query = Array.isArray(value) ? value[0] : value;
  if (query === '1') return 'on';
  if (query === '0') return 'off';
  return null;
}

export function resolveGuidedMode(value: string | string[] | undefined): boolean {
  const fromQuery = getGuidedQueryValue(value);
  if (fromQuery) {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(GUIDED_MODE_STORAGE_KEY, fromQuery);
    }
    return fromQuery === 'on';
  }

  if (typeof window === 'undefined') {
    return false;
  }

  return window.localStorage.getItem(GUIDED_MODE_STORAGE_KEY) === 'on';
}

export function setGuidedMode(enabled: boolean) {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.setItem(GUIDED_MODE_STORAGE_KEY, enabled ? 'on' : 'off');
}
