import { defineStore } from 'pinia';
import type { ModelConfig } from '@shared/types';

export const useModelStore = defineStore('model', {
  state: () => ({
    currentModel: 'qwen-plus',
    availableModels: [
      { label: 'Claude Opus 4.7', value: 'claude-opus-4-7', provider: 'claude' },
      { label: 'Claude Sonnet 4.6', value: 'claude-sonnet-4-6', provider: 'claude' },
      { label: 'Claude Haiku 4.5', value: 'claude-haiku-4-5', provider: 'claude' },
      // Qwen 最新版本号型号（阿里云百炼当前旗舰）
      { label: 'Qwen3.8 Max', value: 'qwen3.8-max', provider: 'qwen' },
      { label: 'Qwen3.7 Max', value: 'qwen3.7-max', provider: 'qwen' },
      { label: 'Qwen3.7 Plus', value: 'qwen3.7-plus', provider: 'qwen' },
      { label: 'Qwen3.6 Flash', value: 'qwen3.6-flash', provider: 'qwen' },
      // Qwen 滚动别名，始终指向阿里云百炼最新稳定版本
      { label: 'Qwen Max（最新）', value: 'qwen-max', provider: 'qwen' },
      { label: 'Qwen Plus（最新）', value: 'qwen-plus', provider: 'qwen' },
      { label: 'Qwen Flash（最新）', value: 'qwen-flash', provider: 'qwen' },
      { label: 'Qwen Turbo（最新）', value: 'qwen-turbo', provider: 'qwen' },
      { label: 'Qwen3 Coder Plus', value: 'qwen3-coder-plus', provider: 'qwen' }
    ] as ModelConfig[]
  }),

  actions: {
    setModel(model: string) {
      this.currentModel = model;
    },

    async loadFromConfig() {
      try {
        const config = await window.electronAPI.invoke('config:get');
        if (config?.defaultModel) {
          this.currentModel = config.defaultModel;
        }
      } catch (error) {
        console.error('加载默认模型失败:', error);
      }
    }
  }
});
