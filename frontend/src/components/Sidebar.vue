<template>
  <div class="sidebar">
    <div class="sidebar-nav">
      <button class="new-task-btn" @click="createNewSession">
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="12" y1="5" x2="12" y2="19"></line>
          <line x1="5" y1="12" x2="19" y2="12"></line>
        </svg>
        <span>新建任务</span>
      </button>

      <div class="nav-list">
        <button class="nav-item" @click="showComingSoon('定时任务')">
          <svg class="nav-icon" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8">
            <circle cx="12" cy="12" r="10"></circle>
            <polyline points="12 6 12 12 16 14"></polyline>
          </svg>
          <span class="nav-text">定时任务</span>
        </button>
        <button
          class="nav-item"
          :class="{ active: activeView === 'knowledge' }"
          @click="uiStore.showKnowledge()"
        >
          <svg class="nav-icon" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8">
            <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path>
            <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path>
          </svg>
          <span class="nav-text">知识空间</span>
        </button>
        <button
          class="nav-item"
          :class="{ active: activeView === 'asr' }"
          @click="uiStore.showASR()"
        >
          <svg class="nav-icon" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8">
            <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path>
            <path d="M19 10v2a7 7 0 0 1-14 0v-2"></path>
            <line x1="12" y1="19" x2="12" y2="23"></line>
            <line x1="8" y1="23" x2="16" y2="23"></line>
          </svg>
          <span class="nav-text">语音转写</span>
        </button>
        <button
          class="nav-item"
          :class="{ active: activeView === 'skill' }"
          @click="uiStore.showSkill()"
        >
          <svg class="nav-icon" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8">
            <path d="M12 2L2 7l10 5 10-5-10-5z"></path>
            <path d="M2 17l10 5 10-5"></path>
            <path d="M2 12l10 5 10-5"></path>
          </svg>
          <span class="nav-text">技能中心</span>
        </button>
        <button class="nav-item" @click="showComingSoon('自定义')">
          <svg class="nav-icon" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8">
            <circle cx="12" cy="12" r="3"></circle>
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
          </svg>
          <span class="nav-text">自定义</span>
        </button>
      </div>
    </div>

    <!-- 浏览足迹 -->
    <!-- <div class="sidebar-section footprint-section">
      <div class="section-header clickable" @click="footprintExpanded = !footprintExpanded">
        <svg
          class="expand-icon"
          :class="{ expanded: footprintExpanded }"
          viewBox="0 0 24 24"
          width="12"
          height="12"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
        >
          <polyline points="9 18 15 12 9 6"></polyline>
        </svg>
        <span class="section-title">浏览足迹</span>
        <span v-if="recordingSessions.length > 0" class="section-count">{{ recordingSessions.length }}</span>
      </div>
      <div v-if="footprintExpanded" class="session-list">
        <div
          v-for="session in recordingSessions"
          :key="session.id"
          class="session-item"
          :class="{ active: session.id === currentSessionId }"
          @click="switchSession(session.id)"
          :title="sessionTooltip(session)"
        >
          <svg class="session-icon" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8">
            <circle cx="12" cy="12" r="10"></circle>
            <path d="M12 6v6l4 2"></path>
          </svg>
          <span class="session-title">{{ session.title }}</span>
          <button
            class="delete-btn"
            @click.stop="handleDelete(session.id)"
            title="删除"
          >
            <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>
        <div v-if="recordingSessions.length === 0" class="empty-hint">
          暂无浏览记录
        </div>
      </div>
    </div> -->

    <div class="sidebar-section">
      <div class="section-header">
        <span class="section-title">最近</span>
        <span v-if="chatSessions.length > 0" class="section-count">{{ chatSessions.length }}</span>
      </div>
      <div class="session-list">
        <div
          v-for="session in chatSessions"
          :key="session.id"
          class="session-item"
          :class="{ active: session.id === currentSessionId }"
          @click="switchSession(session.id)"
          :title="sessionTooltip(session)"
        >
          <span v-if="session.source === 'extension'" class="source-badge" title="来自浏览器插件">
            <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2.2">
              <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path>
              <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path>
            </svg>
          </span>
          <span class="session-title">{{ session.title }}</span>
          <button
            class="delete-btn"
            @click.stop="handleDelete(session.id)"
            title="删除"
          >
            <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>
        <div v-if="chatSessions.length === 0" class="empty-hint">
          暂无会话记录
        </div>
      </div>
    </div>

    <div class="sidebar-footer">
      <div class="user-card" @click="showSettings = true">
        <div class="user-avatar">C</div>
        <span class="user-name">chenzi</span>
        <button class="settings-btn" @click.stop="showSettings = true" title="设置">
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8">
            <circle cx="12" cy="12" r="3"></circle>
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
          </svg>
        </button>
      </div>
    </div>

    <SettingsDialog v-model="showSettings" />
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { useChatStore } from '@/stores/chat';
import { useSessionsStore } from '@/stores/sessions';
import { useUiStore } from '@/stores/ui';
import { ElMessage } from 'element-plus';
import SettingsDialog from './SettingsDialog.vue';
import type { Session } from '@shared/types';

const chatStore = useChatStore();
const sessionsStore = useSessionsStore();
const uiStore = useUiStore();

const sessions = computed(() => sessionsStore.sessions);
const currentSessionId = computed(() => chatStore.currentSessionId);
const activeView = computed(() => uiStore.activeView);
const showSettings = ref(false);

// 分组：浏览足迹（来自插件的录制会话）vs 普通对话
const recordingSessions = computed(() =>
  sessions.value.filter(s => s.source === 'extension' && s.sourceMeta?.recordingId)
);
const chatSessions = computed(() =>
  sessions.value.filter(s => !(s.source === 'extension' && s.sourceMeta?.recordingId))
);

const footprintExpanded = ref(false);

const createNewSession = () => {
  uiStore.showChat();
  chatStore.clearSession();
};

const switchSession = (sessionId: string) => {
  uiStore.showChat();
  chatStore.loadSession(sessionId);
};

const handleDelete = async (sessionId: string) => {
  if (!confirm('确定删除此会话？')) return;
  try {
    await sessionsStore.deleteSession(sessionId);
    // 如果删除的是当前会话，清空界面
    if (sessionId === currentSessionId.value) {
      chatStore.clearSession();
    }
  } catch (error) {
    ElMessage.error('删除失败');
  }
};

const showComingSoon = (feature: string) => {
  ElMessage.info(`${feature}功能开发中...`);
};

const sessionTooltip = (s: Session) => {
  const parts = [s.title];
  if (s.source === 'extension') parts.push('(来自浏览器插件)');
  if (s.sourceMeta?.pageTitle) parts.push(`页面: ${s.sourceMeta.pageTitle}`);
  return parts.join(' ');
};

let unsubscribe: (() => void) | null = null;

onMounted(() => {
  sessionsStore.loadSessions();
  // 监听外部会话同步事件,实时刷新列表
  unsubscribe = window.electronAPI.on('sessions:updated', () => {
    sessionsStore.loadSessions();
  });
});

onUnmounted(() => {
  if (unsubscribe) unsubscribe();
});
</script>

<style scoped>
.sidebar {
  display: flex;
  flex-direction: column;
  background: var(--color-bg-subtle);
  border-right: 1px solid var(--color-border);
  overflow: hidden;
  flex-shrink: 0;
}

.sidebar-nav {
  padding: 16px 12px 12px;
}

.new-task-btn {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 9px 12px;
  margin-bottom: 12px;
  border: none;
  background: var(--color-text-primary);
  color: #ffffff;
  border-radius: var(--radius-md);
  cursor: pointer;
  font-size: var(--font-base);
  font-weight: 500;
  transition: all 0.15s ease;
}

.new-task-btn:hover {
  background: #000;
  transform: translateY(-0.5px);
  box-shadow: var(--shadow-md);
}

.new-task-btn:active {
  transform: translateY(0);
}

.nav-list {
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.nav-item {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 7px 10px;
  border: none;
  background: transparent;
  color: var(--color-text-secondary);
  border-radius: var(--radius-sm);
  cursor: pointer;
  font-size: var(--font-base);
  text-align: left;
  transition: all 0.15s ease;
}

.nav-item:hover {
  background: var(--color-bg-hover);
  color: var(--color-text-primary);
}

.nav-item.active {
  background: var(--color-accent-soft);
  color: var(--color-accent-text);
  font-weight: 500;
}

.nav-icon {
  flex-shrink: 0;
  color: var(--color-text-tertiary);
}

.nav-item:hover .nav-icon {
  color: var(--color-text-secondary);
}

.nav-item.active .nav-icon {
  color: var(--color-accent);
}

.nav-text {
  font-size: var(--font-base);
}

.sidebar-section {
  flex: 1;
  padding: 8px 12px;
  overflow-y: auto;
}

.sidebar-section.footprint-section {
  flex: 0;
  padding: 0 12px 8px;
  border-bottom: 1px solid var(--color-border);
  overflow-y: visible;
}

.section-header {
  padding: 8px 10px 6px;
  display: flex;
  align-items: center;
  gap: 6px;
}

.section-header.clickable {
  cursor: pointer;
  border-radius: var(--radius-sm);
  transition: background 0.15s ease;
}

.section-header.clickable:hover {
  background: var(--color-bg-hover);
}

.expand-icon {
  color: var(--color-text-muted);
  transition: transform 0.2s ease;
  flex-shrink: 0;
}

.expand-icon.expanded {
  transform: rotate(90deg);
}

.section-title {
  font-size: var(--font-xs);
  color: var(--color-text-muted);
  font-weight: 500;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  flex: 1;
}

.section-count {
  font-size: var(--font-xs);
  color: var(--color-text-muted);
  background: var(--color-bg-soft);
  padding: 1px 6px;
  border-radius: var(--radius-full);
  flex-shrink: 0;
}

.session-list {
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.session-item {
  padding: 7px 10px;
  font-size: var(--font-base);
  color: var(--color-text-secondary);
  background: transparent;
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: all 0.15s ease;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  display: flex;
  align-items: center;
  gap: 6px;
  position: relative;
}

.session-icon {
  flex-shrink: 0;
  color: var(--color-text-tertiary);
}

.source-badge {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  color: var(--color-accent);
}

.session-title {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
}

.delete-btn {
  flex-shrink: 0;
  width: 20px;
  height: 20px;
  display: none;
  align-items: center;
  justify-content: center;
  border: none;
  background: transparent;
  border-radius: var(--radius-sm);
  cursor: pointer;
  color: var(--color-text-tertiary);
  transition: all 0.15s ease;
}

.delete-btn:hover {
  background: var(--color-danger-soft);
  color: var(--color-danger);
}

.session-item:hover .delete-btn {
  display: flex;
}

.session-item:hover {
  background: var(--color-bg-hover);
  color: var(--color-text-primary);
}

.session-item.active {
  background: var(--color-accent-soft);
  color: var(--color-accent-text);
  font-weight: 500;
}

.session-item.active .source-badge {
  color: var(--color-accent-text);
}

.empty-hint {
  padding: 24px 12px;
  text-align: center;
  font-size: var(--font-sm);
  color: var(--color-text-muted);
}

.sidebar-footer {
  padding: 8px 12px 12px;
  border-top: 1px solid var(--color-border);
}

.user-card {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px 8px;
  border-radius: var(--radius-md);
  cursor: pointer;
  transition: background 0.15s ease;
}

.user-card:hover {
  background: var(--color-bg-hover);
}

.user-avatar {
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #3b82f6 0%, #6366f1 100%);
  border-radius: var(--radius-full);
  font-size: var(--font-sm);
  font-weight: 600;
  color: #ffffff;
}

.user-name {
  font-size: var(--font-base);
  color: var(--color-text-primary);
  flex: 1;
  font-weight: 500;
}

.settings-btn {
  width: 26px;
  height: 26px;
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

.settings-btn:hover {
  background: var(--color-bg-hover);
  color: var(--color-text-primary);
}
</style>
