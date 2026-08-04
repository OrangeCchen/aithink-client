import { ipcMain } from 'electron';
import { loadConfig, saveConfig } from '../service/config-service.js';
import type { AppConfig } from '../../shared/types.js';

export function registerConfigHandlers() {
  ipcMain.handle('config:get', async () => {
    return await loadConfig();
  });

  ipcMain.handle('config:set', async (_event, config: AppConfig) => {
    await saveConfig(config);
    return { success: true };
  });
}
