import { ref, computed } from 'vue';

export type ServiceStatus = 'checking' | 'connected' | 'disconnected' | 'error';

interface ConnectionState {
  qwenApi: ServiceStatus;
  httpServer: ServiceStatus;
  browserExtension: ServiceStatus;
  lastExtensionPing: number;
}

const state = ref<ConnectionState>({
  qwenApi: 'checking',
  httpServer: 'checking',
  browserExtension: 'checking',
  lastExtensionPing: 0,
});

// 总体连接状态
export const overallStatus = computed(() => {
  const statuses = [state.value.qwenApi, state.value.httpServer, state.value.browserExtension];

  if (statuses.includes('checking')) return 'checking';
  if (statuses.every(s => s === 'connected')) return 'connected';
  if (statuses.every(s => s === 'disconnected' || s === 'error')) return 'disconnected';
  return 'partial'; // 部分连接
});

export const connectionDetails = computed(() => ({
  qwen: state.value.qwenApi,
  http: state.value.httpServer,
  extension: state.value.browserExtension,
  overall: overallStatus.value,
}));

// 更新各项状态
export const updateQwenStatus = (status: ServiceStatus) => {
  state.value.qwenApi = status;
};

export const updateHttpStatus = (status: ServiceStatus) => {
  state.value.httpServer = status;
};

export const updateExtensionStatus = (status: ServiceStatus) => {
  state.value.browserExtension = status;
};

export const recordExtensionPing = () => {
  state.value.lastExtensionPing = Date.now();
  updateExtensionStatus('connected');
};

// 检测插件心跳（超过 30 秒无请求认为断开）
setInterval(() => {
  if (state.value.lastExtensionPing > 0) {
    const elapsed = Date.now() - state.value.lastExtensionPing;
    if (elapsed > 30000) {
      updateExtensionStatus('disconnected');
    }
  }
}, 5000);

export const useConnectionStore = () => {
  return {
    state,
    overallStatus,
    connectionDetails,
    updateQwenStatus,
    updateHttpStatus,
    updateExtensionStatus,
    recordExtensionPing,
  };
};
