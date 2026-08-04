import type { UserSettings } from './types';

const SETTINGS_KEY = 'prd2spec.settings';

const DEFAULT_SETTINGS: UserSettings = {
  anthropicApiKey: '',
  qwenApiKey: '',
  mastergoToken: '',
  model: 'claude-sonnet-4-6',
};

export async function loadSettings(): Promise<UserSettings> {
  const stored = await chrome.storage.local.get(SETTINGS_KEY);
  const raw = stored[SETTINGS_KEY];
  if (!raw) return { ...DEFAULT_SETTINGS };
  return { ...DEFAULT_SETTINGS, ...raw };
}

export async function saveSettings(settings: Partial<UserSettings>): Promise<void> {
  const current = await loadSettings();
  const next = { ...current, ...settings };
  await chrome.storage.local.set({ [SETTINGS_KEY]: next });
}
