<template>
  <div class="title-bar">
    <div class="title-bar-left">
      <div class="logo">
        <img src="/logo.png" alt="logo" class="logo-image" />
        <span class="logo-text">AIThink</span>
      </div>
    </div>
    <div class="title-bar-right">
      <div class="status-indicator" @click="showDetails = !showDetails" :title="statusTooltip">
        <span class="status-dot" :class="statusClass"></span>
        <span class="status-text">{{ statusText }}</span>
        <svg
          v-if="overallStatus !== 'checking'"
          class="expand-icon"
          :class="{ expanded: showDetails }"
          viewBox="0 0 12 12"
          width="10"
          height="10"
          fill="none"
          stroke="currentColor"
          stroke-width="1.5"
        >
          <polyline points="3 4.5 6 7.5 9 4.5"></polyline>
        </svg>
      </div>

      <!-- 详情弹窗 -->
      <div v-if="showDetails" class="status-dropdown">
        <div class="status-item">
          <span class="status-label">千问 API</span>
          <span class="status-badge" :class="qwenStatus">{{ statusLabel(qwenStatus) }}</span>
        </div>
        <div class="status-item">
          <span class="status-label">HTTP 服务</span>
          <span class="status-badge" :class="httpStatus">{{ statusLabel(httpStatus) }}</span>
        </div>
        <div class="status-item">
          <span class="status-label">浏览器插件</span>
          <span class="status-badge" :class="extensionStatus">{{ statusLabel(extensionStatus) }}</span>
        </div>
      </div>

      <div class="window-controls">
        <button class="control-btn" @click="minimize" title="最小化">
          <svg viewBox="0 0 12 12" width="10" height="10" fill="none" stroke="currentColor" stroke-width="1.5">
            <line x1="2" y1="6" x2="10" y2="6"></line>
          </svg>
        </button>
        <button class="control-btn" @click="maximize" title="最大化">
          <svg viewBox="0 0 12 12" width="10" height="10" fill="none" stroke="currentColor" stroke-width="1.5">
            <rect x="2" y="2" width="8" height="8" rx="1"></rect>
          </svg>
        </button>
        <button class="control-btn close" @click="close" title="关闭">
          <svg viewBox="0 0 12 12" width="10" height="10" fill="none" stroke="currentColor" stroke-width="1.5">
            <line x1="3" y1="3" x2="9" y2="9"></line>
            <line x1="9" y1="3" x2="3" y2="9"></line>
          </svg>
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';

type ServiceStatus = 'checking' | 'connected' | 'disconnected' | 'error';

const qwenStatus = ref<ServiceStatus>('checking');
const httpStatus = ref<ServiceStatus>('checking');
const extensionStatus = ref<ServiceStatus>('checking');
const showDetails = ref(false);

const overallStatus = computed(() => {
  const statuses = [qwenStatus.value, httpStatus.value, extensionStatus.value];
  if (statuses.includes('checking')) return 'checking';
  if (statuses.every(s => s === 'connected')) return 'connected';
  if (statuses.some(s => s === 'connected')) return 'partial';
  return 'disconnected';
});

const statusClass = computed(() => {
  const status = overallStatus.value;
  if (status === 'connected') return 'connected';
  if (status === 'partial') return 'partial';
  if (status === 'checking') return 'checking';
  return '';
});

const statusText = computed(() => {
  const status = overallStatus.value;
  if (status === 'checking') return '检测中';
  if (status === 'connected') return '全部就绪';
  if (status === 'partial') return '部分连接';
  return '未连接';
});

const statusTooltip = computed(() => {
  return `千问: ${statusLabel(qwenStatus.value)} | HTTP: ${statusLabel(httpStatus.value)} | 插件: ${statusLabel(extensionStatus.value)}`;
});

const statusLabel = (status: ServiceStatus) => {
  if (status === 'connected') return '已连接';
  if (status === 'checking') return '检测中';
  if (status === 'error') return '异常';
  return '未连接';
};

const checkStatuses = async () => {
  // 检测千问 API
  try {
    const result = await window.electronAPI.invoke('connection:checkQwen');
    qwenStatus.value = result.status;
  } catch {
    qwenStatus.value = 'error';
  }

  // 检测 HTTP 服务
  try {
    const result = await window.electronAPI.invoke('connection:checkHttp');
    httpStatus.value = result.status;
  } catch {
    httpStatus.value = 'error';
  }

  // 检测插件
  try {
    const result = await window.electronAPI.invoke('connection:checkExtension');
    extensionStatus.value = result.status;
  } catch {
    extensionStatus.value = 'disconnected';
  }
};

const handleClickOutside = (event: MouseEvent) => {
  const target = event.target as HTMLElement;
  if (!target.closest('.status-indicator') && !target.closest('.status-dropdown')) {
    showDetails.value = false;
  }
};

let intervalId: number | null = null;

onMounted(() => {
  checkStatuses();
  // 每 5 秒检测一次（更频繁）
  intervalId = window.setInterval(checkStatuses, 5000);
  // 监听点击外部关闭弹窗
  document.addEventListener('click', handleClickOutside);
});

onUnmounted(() => {
  if (intervalId !== null) clearInterval(intervalId);
  document.removeEventListener('click', handleClickOutside);
});

const minimize = () => window.electronAPI.minimize();
const maximize = () => window.electronAPI.maximize();
const close = () => window.electronAPI.close();
</script>

<style scoped>
.title-bar {
  height: 44px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0 16px;
  background: var(--color-bg);
  border-bottom: 1px solid var(--color-border);
  -webkit-app-region: drag;
}

.title-bar-left,
.title-bar-right {
  display: flex;
  align-items: center;
  gap: 12px;
  position: relative;
}

.logo {
  display: flex;
  align-items: center;
  gap: 8px;
}

.logo-image {
  width: 20px;
  height: 20px;
  display: block;
}

.logo-text {
  font-size: var(--font-md);
  font-weight: 600;
  color: var(--color-text-primary);
  letter-spacing: -0.01em;
}

.status-indicator {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 3px 10px;
  background: var(--color-bg-soft);
  border-radius: var(--radius-full);
  cursor: pointer;
  transition: background 0.15s ease;
  position: relative;
  -webkit-app-region: no-drag;
}

.status-indicator:hover {
  background: var(--color-bg-hover);
}

.status-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--color-text-muted);
  flex-shrink: 0;
}

.status-dot.connected {
  background: var(--color-success);
  box-shadow: 0 0 0 2px rgba(16, 185, 129, 0.15);
}

.status-dot.partial {
  background: var(--color-warning);
  box-shadow: 0 0 0 2px rgba(245, 158, 11, 0.15);
}

.status-dot.checking {
  background: var(--color-text-muted);
  animation: pulse 1.5s ease-in-out infinite;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.4; }
}

.status-text {
  font-size: var(--font-xs);
  color: var(--color-text-secondary);
  font-weight: 500;
}

.expand-icon {
  color: var(--color-text-tertiary);
  transition: transform 0.2s ease;
  margin-left: 2px;
}

.expand-icon.expanded {
  transform: rotate(180deg);
}

.status-dropdown {
  position: absolute;
  top: calc(100% + 6px);
  right: 0;
  background: var(--color-bg);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-lg);
  padding: 8px;
  min-width: 180px;
  z-index: 1000;
  -webkit-app-region: no-drag;
}

.status-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 8px;
  border-radius: var(--radius-sm);
  transition: background 0.15s ease;
}

.status-item:hover {
  background: var(--color-bg-soft);
}

.status-label {
  font-size: var(--font-sm);
  color: var(--color-text-secondary);
}

.status-badge {
  font-size: var(--font-xs);
  padding: 2px 8px;
  border-radius: var(--radius-full);
  font-weight: 500;
}

.status-badge.connected {
  background: var(--color-success-soft);
  color: var(--color-success);
}

.status-badge.disconnected {
  background: var(--color-bg-soft);
  color: var(--color-text-muted);
}

.status-badge.error {
  background: var(--color-danger-soft);
  color: var(--color-danger);
}

.status-badge.checking {
  background: var(--color-bg-soft);
  color: var(--color-text-tertiary);
}

.window-controls {
  display: flex;
  gap: 2px;
  -webkit-app-region: no-drag;
}

.control-btn {
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  background: transparent;
  border-radius: var(--radius-sm);
  cursor: pointer;
  color: var(--color-text-tertiary);
  transition: all 0.15s ease;
}

.control-btn:hover {
  background: var(--color-bg-hover);
  color: var(--color-text-primary);
}

.control-btn.close:hover {
  background: var(--color-danger);
  color: #ffffff;
}
</style>
