/**
 * 豆包适配器（薄封装，复用通用 A11y adapter）
 */
import { getExternalAppRuntimeConfig } from '../mac-computer-use-client.js';
import { createA11yElectronAdapter } from './a11y-electron-adapter.js';
import type { AppAdapter } from '../../../shared/types.js';

export function createDoubaoAdapter(): AppAdapter {
  const cfg = getExternalAppRuntimeConfig();
  return createA11yElectronAdapter({
    appId: 'doubao',
    appDisplayName: '豆包',
    bundleId: cfg.doubaoBundleId
  });
}
