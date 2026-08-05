<template>
  <div class="app-container">
    <TitleBar />
    <div class="main-layout">
      <Sidebar :style="{ width: sidebarWidth + 'px' }" />
      <div
        class="resize-handle resize-handle-left"
        @mousedown="startResize('sidebar', $event)"
      ></div>

      <!-- 用 v-show 保活视图，避免切换时整页卸载闪现 -->
      <KnowledgeSpaceView v-show="activeView === 'knowledge'" :style="{ flex: '1' }" />
      <FileTranscriptionView v-show="activeView === 'transcription'" :style="{ flex: '1' }" />
      <SkillMarketView v-show="activeView === 'skill'" :style="{ flex: '1' }" />

      <template v-if="activeView === 'chat'">
        <ChatView :style="{ flex: '1' }" />
        <div
          class="resize-handle resize-handle-right"
          @mousedown="startResize('rightPanel', $event)"
        ></div>
        <RightPanel :style="{ width: rightPanelWidth + 'px' }" />
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import TitleBar from './components/TitleBar.vue';
import Sidebar from './components/Sidebar.vue';
import ChatView from './views/ChatView.vue';
import KnowledgeSpaceView from './views/KnowledgeSpaceView.vue';
import FileTranscriptionView from './views/FileTranscriptionView.vue';
import SkillMarketView from './views/SkillMarketView.vue';
import RightPanel from './components/RightPanel.vue';
import { bootstrapFileTranscription } from './composables/useFileTranscription';
import { useModelStore } from './stores/model';
import { useUiStore } from './stores/ui';

const modelStore = useModelStore();
const uiStore = useUiStore();
const activeView = computed(() => uiStore.activeView);

// 面板宽度状态
const sidebarWidth = ref(240);
const rightPanelWidth = ref(280);

// 最小/最大宽度限制
const MIN_SIDEBAR_WIDTH = 180;
const MAX_SIDEBAR_WIDTH = 400;
const MIN_RIGHT_PANEL_WIDTH = 200;
const MAX_RIGHT_PANEL_WIDTH = 500;

// 拖动状态
let resizingPanel: 'sidebar' | 'rightPanel' | null = null;
let startX = 0;
let startWidth = 0;

const startResize = (panel: 'sidebar' | 'rightPanel', event: MouseEvent) => {
  resizingPanel = panel;
  startX = event.clientX;
  startWidth = panel === 'sidebar' ? sidebarWidth.value : rightPanelWidth.value;

  document.addEventListener('mousemove', handleResize);
  document.addEventListener('mouseup', stopResize);
  document.body.style.cursor = 'col-resize';
  document.body.style.userSelect = 'none';
};

const handleResize = (event: MouseEvent) => {
  if (!resizingPanel) return;

  const delta = event.clientX - startX;

  if (resizingPanel === 'sidebar') {
    const newWidth = Math.max(MIN_SIDEBAR_WIDTH, Math.min(MAX_SIDEBAR_WIDTH, startWidth + delta));
    sidebarWidth.value = newWidth;
  } else {
    // 右侧面板向右拖动时宽度减小
    const newWidth = Math.max(MIN_RIGHT_PANEL_WIDTH, Math.min(MAX_RIGHT_PANEL_WIDTH, startWidth - delta));
    rightPanelWidth.value = newWidth;
  }
};

const stopResize = () => {
  resizingPanel = null;
  document.removeEventListener('mousemove', handleResize);
  document.removeEventListener('mouseup', stopResize);
  document.body.style.cursor = '';
  document.body.style.userSelect = '';
};

onMounted(() => {
  modelStore.loadFromConfig();
  void bootstrapFileTranscription();
});
</script>

<style scoped>
.app-container {
  width: 100vw;
  height: 100vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: var(--color-bg);
}

.main-layout {
  flex: 1;
  display: flex;
  overflow: hidden;
  background: var(--color-bg);
  position: relative;
}

.main-layout > :deep(.tx-page),
.main-layout > :deep(.knowledge-space),
.main-layout > :deep(.skill-market) {
  min-width: 0;
}

.resize-handle {
  width: 4px;
  background: transparent;
  cursor: col-resize;
  position: relative;
  flex-shrink: 0;
  transition: background 0.2s;
}

.resize-handle:hover {
  background: var(--color-accent);
}

.resize-handle::before {
  content: '';
  position: absolute;
  top: 0;
  bottom: 0;
  left: -2px;
  right: -2px;
}

.resize-handle-left {
  margin-left: -2px;
  margin-right: -2px;
}

.resize-handle-right {
  margin-left: -2px;
  margin-right: -2px;
}
</style>

<style>
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

:root {
  /* 色板：白底 + 三档灰 */
  --color-bg: #ffffff;
  --color-bg-subtle: #fafafa;
  --color-bg-soft: #f5f5f7;
  --color-bg-hover: #f0f0f3;

  /* 文字色：四档 */
  --color-text-primary: #18181b;
  --color-text-secondary: #52525b;
  --color-text-tertiary: #71717a;
  --color-text-muted: #a1a1aa;

  /* 边框：极弱 */
  --color-border: #ececef;
  --color-border-strong: #e4e4e7;

  /* 强调色：单一蓝 */
  --color-accent: #3b82f6;
  --color-accent-hover: #2563eb;
  --color-accent-soft: #eff6ff;
  --color-accent-text: #1d4ed8;

  /* 状态色 */
  --color-success: #10b981;
  --color-success-soft: #ecfdf5;
  --color-danger: #ef4444;
  --color-danger-soft: #fef2f2;
  --color-warning: #f59e0b;
  --color-warning-soft: #fffbeb;

  /* 圆角 */
  --radius-sm: 6px;
  --radius-md: 10px;
  --radius-lg: 14px;
  --radius-xl: 20px;
  --radius-full: 9999px;

  /* 阴影：柔和 */
  --shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.04);
  --shadow-md: 0 2px 8px rgba(0, 0, 0, 0.04);
  --shadow-lg: 0 8px 24px rgba(0, 0, 0, 0.06);

  /* 字号 */
  --font-xs: 11px;
  --font-sm: 12px;
  --font-base: 13px;
  --font-md: 14px;
  --font-lg: 15px;

  /* 行高 */
  --leading-tight: 1.4;
  --leading-normal: 1.6;
}

body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', sans-serif;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  color: var(--color-text-primary);
  background: var(--color-bg);
}

#app {
  width: 100%;
  height: 100%;
}

/* 滚动条：极简、悬浮显示 */
::-webkit-scrollbar {
  width: 6px;
  height: 6px;
}

::-webkit-scrollbar-track {
  background: transparent;
}

::-webkit-scrollbar-thumb {
  background: transparent;
  border-radius: 3px;
  transition: background 0.2s;
}

*:hover > ::-webkit-scrollbar-thumb,
*:hover::-webkit-scrollbar-thumb {
  background: rgba(0, 0, 0, 0.12);
}

::-webkit-scrollbar-thumb:hover {
  background: rgba(0, 0, 0, 0.24) !important;
}

* {
  scrollbar-width: thin;
  scrollbar-color: transparent transparent;
}

*:hover {
  scrollbar-color: rgba(0, 0, 0, 0.12) transparent;
}
</style>
