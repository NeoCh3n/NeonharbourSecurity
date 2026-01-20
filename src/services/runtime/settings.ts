import { getBrowserEnv, isBrowser } from '../../utils/browser-env';
import type { RuntimeConnectionMode } from './types';

export interface RuntimeConnectionSettings {
  endpoint: string;
  authToken: string;
  autoConnect: boolean;
  mode: RuntimeConnectionMode;
  orgId: string;
  environment: string;
  runtimeId: string;
}

const STORAGE_KEY = 'neoharbor.runtime.settings';

const normalizeMode = (value: string): RuntimeConnectionMode => {
  return value === 'direct' ? 'direct' : 'gateway';
};

const defaultSettings: RuntimeConnectionSettings = {
  endpoint: getBrowserEnv('REACT_APP_RUNTIME_ENDPOINT', ''),
  authToken: getBrowserEnv('REACT_APP_RUNTIME_TOKEN', ''),
  autoConnect: getBrowserEnv('REACT_APP_RUNTIME_AUTOCONNECT', 'false') === 'true',
  mode: normalizeMode(getBrowserEnv('REACT_APP_RUNTIME_MODE', 'gateway')),
  orgId: getBrowserEnv('REACT_APP_RUNTIME_ORG_ID', ''),
  environment: getBrowserEnv('REACT_APP_RUNTIME_ENVIRONMENT', ''),
  runtimeId: getBrowserEnv('REACT_APP_RUNTIME_ID', ''),
};

export const loadRuntimeSettings = (): RuntimeConnectionSettings => {
  if (!isBrowser()) return { ...defaultSettings };

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...defaultSettings };
    const parsed = JSON.parse(raw) as Partial<RuntimeConnectionSettings>;
    return {
      endpoint: parsed.endpoint ?? defaultSettings.endpoint,
      authToken: parsed.authToken ?? defaultSettings.authToken,
      autoConnect: parsed.autoConnect ?? defaultSettings.autoConnect,
      mode: parsed.mode ? normalizeMode(String(parsed.mode)) : defaultSettings.mode,
      orgId: parsed.orgId ?? defaultSettings.orgId,
      environment: parsed.environment ?? defaultSettings.environment,
      runtimeId: parsed.runtimeId ?? defaultSettings.runtimeId,
    };
  } catch (error) {
    console.warn('Failed to load runtime settings, using defaults.', error);
    return { ...defaultSettings };
  }
};

export const saveRuntimeSettings = (settings: RuntimeConnectionSettings): void => {
  if (!isBrowser()) return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch (error) {
    console.warn('Failed to save runtime settings.', error);
  }
};
