import { app } from 'electron';
import { join } from 'path';
import { promises as fs } from 'fs';
import { DEFAULT_CONFIG } from '../../shared/types.js';
import type { AppConfig } from '../../shared/types.js';

let configPath: string | null = null;
let cached: AppConfig | null = null;

function getPath(): string {
  if (!configPath) {
    configPath = join(app.getPath('userData'), 'config.json');
  }
  return configPath;
}

export async function loadConfig(): Promise<AppConfig> {
  if (cached) return cached;

  try {
    const content = await fs.readFile(getPath(), 'utf-8');
    const parsed = JSON.parse(content) as Partial<AppConfig>;
    cached = {
      claude: { ...DEFAULT_CONFIG.claude, ...(parsed.claude || {}) },
      qwen: { ...DEFAULT_CONFIG.qwen, ...(parsed.qwen || {}) },
      dashscopeAsr: { ...DEFAULT_CONFIG.dashscopeAsr, ...(parsed.dashscopeAsr || {}) },
      defaultModel: parsed.defaultModel || DEFAULT_CONFIG.defaultModel
    };
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      // 首次启动，自动保存默认配置
      cached = { ...DEFAULT_CONFIG };
      await saveConfig(cached);
    } else {
      console.error('Failed to load config:', error);
      cached = { ...DEFAULT_CONFIG };
    }
  }
  return cached;
}

export async function saveConfig(config: AppConfig): Promise<void> {
  cached = config;
  await fs.writeFile(getPath(), JSON.stringify(config, null, 2), 'utf-8');
}

export function getConfigSync(): AppConfig {
  return cached || { ...DEFAULT_CONFIG };
}
