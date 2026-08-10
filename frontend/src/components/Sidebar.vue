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
          :class="{
            active: activeView === 'transcription',
            processing: Boolean(transcriptionTask) || transcriptionQueue > 0
          }"
          :title="transcriptionBadgeTitle"
          @click="openTranscriptionNav"
        >
          <svg class="nav-icon" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
            <polyline points="14 2 14 8 20 8"></polyline>
            <path d="M8 13h8M8 17h6"></path>
          </svg>
          <span class="nav-text">文件转写</span>
          <span
            v-if="transcriptionTask || transcriptionQueue > 0"
            class="nav-task-badge"
            :class="{ minutes: transcriptionTask?.stage === 'summarizing' }"
          >
            {{ transcriptionBadgeText }}
          </span>
          <span
            v-else-if="hasTranscriptionAttention"
            class="nav-attention"
          >
            <i v-if="unreadCompletedCount > 0" class="attn-dot" aria-hidden="true"></i>
            <i v-if="failedCount > 0" class="attn-fail" aria-hidden="true">!</i>
          </span>
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
      </div>
    </div>

    <div class="sidebar-lists">
      <!-- 空间：自定义空间（默认空间不单独列出，其任务在「最近」） -->
      <div class="sidebar-section spaces-section">
        <div class="section-header clickable" @click="spacesExpanded = !spacesExpanded">
          <span class="section-title">空间</span>
          <svg
            class="expand-icon end"
            :class="{ expanded: spacesExpanded }"
            viewBox="0 0 24 24"
            width="12"
            height="12"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <polyline points="9 18 15 12 9 6"></polyline>
          </svg>
        </div>

        <div v-if="spacesExpanded" class="space-list compact">
          <div v-for="space in customSpaces" :key="space.id" class="space-block">
            <div
              class="space-row"
              :class="{ active: space.id === activeSpaceId }"
              @click="selectSpace(space.id)"
              :title="space.folderPath"
            >
              <button class="chevron-btn" @click.stop="spaceStore.toggleExpanded(space.id)">
                <svg
                  class="expand-icon sm"
                  :class="{ expanded: isExpanded(space.id) }"
                  viewBox="0 0 24 24"
                  width="11"
                  height="11"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                >
                  <polyline points="9 18 15 12 9 6"></polyline>
                </svg>
              </button>
              <svg class="folder-icon" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8">
                <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
              </svg>
              <span class="space-name">{{ space.name }}</span>
              <div class="space-trailing has-delete">
                <span
                  class="space-task-count"
                  :title="`该空间下的任务 ${sessionsInSpace(space).length} 个`"
                >{{ sessionsInSpace(space).length }}</span>
                <div class="row-actions">
                  <button class="icon-btn" title="在访达中打开" @click.stop="revealSpace(space.folderPath)">
                    <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2">
                      <path d="M5 4h5l2 2h9a1 1 0 0 1 1 1v2H4V5a1 1 0 0 1 1-1z"></path>
                      <path d="M4 10h16l-1.2 8.2A1 1 0 0 1 17.8 19H6.2a1 1 0 0 1-1-0.8L4 10z"></path>
                    </svg>
                  </button>
                  <button class="icon-btn" title="重命名" @click.stop="handleRenameSpace(space)">
                    <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2">
                      <path d="M12 20h9M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path>
                    </svg>
                  </button>
                  <button class="icon-btn danger" title="删除空间" @click.stop="handleDeleteSpace(space.id)">
                    <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2">
                      <line x1="18" y1="6" x2="6" y2="18"></line>
                      <line x1="6" y1="6" x2="18" y2="18"></line>
                    </svg>
                  </button>
                </div>
              </div>
            </div>

            <div v-if="isExpanded(space.id)" class="nested-sessions">
              <div
                v-for="session in sessionsInSpace(space)"
                :key="session.id"
                class="session-item nested"
                :class="{ active: session.id === currentSessionId }"
                @click="switchSession(session.id)"
                :title="sessionTooltip(session)"
              >
                <svg class="task-icon" viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.8">
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
                </svg>
                <span class="session-title">{{ session.title }}</span>
                <span class="session-time">{{ relativeTime(session.createdAt) }}</span>
                <button class="delete-btn" @click.stop="handleDelete(session.id)" title="删除">
                  <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2">
                    <line x1="18" y1="6" x2="6" y2="18"></line>
                    <line x1="6" y1="6" x2="18" y2="18"></line>
                  </svg>
                </button>
              </div>
              <div v-if="sessionsInSpace(space).length === 0" class="empty-nested">暂无任务</div>
            </div>
          </div>
          <button class="new-project-row" @click="handleCreateSpace">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="12" y1="5" x2="12" y2="19"></line>
              <line x1="5" y1="12" x2="19" y2="12"></line>
            </svg>
            <span>新建空间</span>
          </button>
        </div>
      </div>

      <!-- 最近：默认空间下的任务 -->
      <div class="sidebar-section recent-section">
        <div
          class="section-header clickable"
          :class="{ 'section-active': isOnDefaultSpace }"
          @click="onRecentHeaderClick"
          :title="defaultSpace?.folderPath || '默认空间'"
        >
          <span class="section-title">最近</span>
          <span v-if="recentSessions.length > 0" class="section-count">{{ recentSessions.length }}</span>
          <svg
            class="expand-icon end"
            :class="{ expanded: recentExpanded }"
            viewBox="0 0 24 24"
            width="12"
            height="12"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            @click.stop="recentExpanded = !recentExpanded"
          >
            <polyline points="9 18 15 12 9 6"></polyline>
          </svg>
        </div>
        <div v-if="recentExpanded" class="session-list recent-list">
          <!-- 普通会话 + 嵌套的外部任务 -->
          <template v-for="session in recentSessions" :key="session.id">
            <div
              class="session-item recent"
              :class="{
                active: session.id === currentSessionId && !currentExternalTaskId,
                waiting: isSessionWaiting(session.id)
              }"
              @click="switchRecentSession(session.id)"
              :title="sessionTooltip(session)"
            >
              <svg
                v-if="isSessionWaiting(session.id)"
                class="task-icon spinning"
                viewBox="0 0 24 24"
                width="12"
                height="12"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
              >
                <path d="M21 12a9 9 0 1 1-6.219-8.56"></path>
              </svg>
              <svg
                v-else
                class="task-icon"
                viewBox="0 0 24 24"
                width="12"
                height="12"
                fill="none"
                stroke="currentColor"
                stroke-width="1.8"
              >
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
              </svg>
              <span class="session-title">{{ session.title }}</span>
              <span class="session-time">{{ relativeTime(session.createdAt) }}</span>
              <button class="delete-btn" @click.stop="handleDelete(session.id)" title="删除">
                <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2">
                  <line x1="18" y1="6" x2="6" y2="18"></line>
                  <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
              </button>
            </div>

            <!-- 该会话的外部任务(嵌套显示) -->
            <div
              v-for="task in visibleTasksForSession(session.id)"
              :key="task.id"
              class="session-item recent external-task nested"
              :class="{
                active: currentExternalTaskId === task.id,
                running: task.status === 'running',
                completed: task.status === 'completed',
                failed: task.status === 'failed' || task.status === 'cancelled'
              }"
              @click="viewExternalTask(task.id)"
              :title="`${task.appName}: ${task.prompt}`"
            >
              <span class="nest-indicator">└─</span>
              <svg
                v-if="task.status === 'running'"
                class="task-icon spinning"
                viewBox="0 0 24 24"
                width="12"
                height="12"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
              >
                <path d="M21 12a9 9 0 1 1-6.219-8.56"></path>
              </svg>
              <svg
                v-else-if="task.status === 'completed'"
                class="task-icon"
                viewBox="0 0 24 24"
                width="12"
                height="12"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
              >
                <polyline points="20 6 9 17 4 12"></polyline>
              </svg>
              <svg
                v-else-if="task.status === 'failed' || task.status === 'cancelled'"
                class="task-icon"
                viewBox="0 0 24 24"
                width="12"
                height="12"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
              >
                <circle cx="12" cy="12" r="10"></circle>
                <line x1="15" y1="9" x2="9" y2="15"></line>
                <line x1="9" y1="9" x2="15" y2="15"></line>
              </svg>
              <svg
                v-else
                class="task-icon"
                viewBox="0 0 24 24"
                width="12"
                height="12"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
              >
                <circle cx="12" cy="12" r="10"></circle>
                <polyline points="12 6 12 12 16 14"></polyline>
              </svg>
              <span class="app-badge">{{ task.appName }}</span>
              <span class="batch-label">{{ task.batchLabel }}</span>
              <span class="session-title">{{ task.prompt.slice(0, 15) }}{{ task.prompt.length > 15 ? '...' : '' }}</span>
              <span class="session-time">{{ relativeTime(task.createdAt) }}</span>
            </div>

            <!-- 已完成任务折叠按钮 -->
            <div
              v-if="completedTaskCount(session.id) > 0 && !sessionTasksExpanded[session.id]"
              class="show-completed-btn"
              @click.stop="toggleSessionTasksExpanded(session.id)"
            >
              显示已完成 ({{ completedTaskCount(session.id) }})
            </div>
            <div
              v-if="completedTaskCount(session.id) > 0 && sessionTasksExpanded[session.id]"
              class="show-completed-btn"
              @click.stop="toggleSessionTasksExpanded(session.id)"
            >
              收起已完成
            </div>
          </template>

          <div v-if="recentSessions.length === 0" class="empty-hint">暂无任务</div>
        </div>
      </div>

      <!-- 足迹：浏览器录制会话 -->
      <div class="sidebar-section footprint-section">
        <div class="section-header clickable" @click="footprintExpanded = !footprintExpanded">
          <span class="section-title">足迹</span>
          <svg
            class="expand-icon end"
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
        </div>
        <div v-if="footprintExpanded" class="footprint-wrap">
          <FootprintPanel compact />
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
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { useChatStore } from '@/stores/chat';
import { useSessionsStore } from '@/stores/sessions';
import { useSpaceStore } from '@/stores/space';
import { useUiStore } from '@/stores/ui';
import { useFileTranscription } from '@/composables/useFileTranscription';
import { ElMessage } from 'element-plus';
import SettingsDialog from './SettingsDialog.vue';
import FootprintPanel from './FootprintPanel.vue';
import type { Session, WorkspaceSpace } from '@shared/types';

const chatStore = useChatStore();
const sessionsStore = useSessionsStore();
const spaceStore = useSpaceStore();
const uiStore = useUiStore();
const {
  activeTask: transcriptionTask,
  queueLength: transcriptionQueue,
  hasAttention: hasTranscriptionAttention,
  unreadCompletedCount,
  failedCount,
  attentionTooltip,
  clearTranscriptionAttention
} = useFileTranscription();

const transcriptionBadgeText = computed(() => {
  if (transcriptionTask.value) {
    const pct = `${Math.round(transcriptionTask.value.progress)}%`;
    return transcriptionQueue.value > 0 ? `${pct}+${transcriptionQueue.value}` : pct;
  }
  return transcriptionQueue.value > 0 ? `${transcriptionQueue.value}排队` : '';
});

const transcriptionBadgeTitle = computed(() => {
  if (transcriptionTask.value && transcriptionQueue.value > 0) {
    return `${transcriptionTask.value.message}；另有 ${transcriptionQueue.value} 个排队`;
  }
  if (transcriptionTask.value) return transcriptionTask.value.message;
  if (transcriptionQueue.value > 0) return `${transcriptionQueue.value} 个文件排队等待转写`;
  if (hasTranscriptionAttention.value) return attentionTooltip.value;
  return '';
});

function openTranscriptionNav() {
  clearTranscriptionAttention();
  uiStore.showTranscription();
}

const sessions = computed(() => sessionsStore.sessions);
const externalTasks = computed(() => chatStore.externalTasks);
const currentExternalTaskId = computed(() => chatStore.currentExternalTaskId);
const customSpaces = computed(() => spaceStore.customSpaces);
const defaultSpace = computed(() => spaceStore.defaultSpace);
const activeSpaceId = computed(() => spaceStore.activeSpaceId);
const isOnDefaultSpace = computed(
  () => Boolean(defaultSpace.value && activeSpaceId.value === defaultSpace.value.id)
);
const currentSessionId = computed(() => chatStore.currentSessionId);
const activeView = computed(() => uiStore.activeView);
const showSettings = ref(false);
const spacesExpanded = ref(true);
const recentExpanded = ref(true);
const footprintExpanded = ref(true);
// 各会话的子任务折叠状态（sessionId -> boolean，true=展示已完成任务）
const sessionTasksExpanded = ref<Record<string, boolean>>({});

/** 最近 = 默认空间下的任务 */
const recentSessions = computed(() => {
  const def = defaultSpace.value;
  if (!def) return [];
  return sessions.value
    .filter(
      (s) =>
        s.spaceId === def.id ||
        (!s.spaceId && (!s.workspacePath || s.workspacePath === def.folderPath))
    )
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, 50);
});

/** 获取某会话的所有外部任务，带批次标签和可见性过滤 */
const externalTasksForSession = (sessionId: string) => {
  const allTasks = externalTasks.value
    .filter((t) => t.sessionId === sessionId)
    .sort((a, b) => a.createdAt - b.createdAt);

  // 批次聚类：±2秒内算同批
  const batches: number[] = [];
  allTasks.forEach((task, i) => {
    if (i === 0) {
      batches.push(1);
    } else {
      const prevTime = allTasks[i - 1].createdAt;
      const diff = Math.abs(task.createdAt - prevTime);
      batches.push(diff < 2000 ? batches[i - 1] : batches[i - 1] + 1);
    }
  });

  // 附加批次标签
  return allTasks.map((t, i) => ({ ...t, batchLabel: `第${batches[i]}批` }));
};

/** 获取某会话当前可见的子任务（已完成的可折叠） */
const visibleTasksForSession = (sessionId: string) => {
  const tasks = externalTasksForSession(sessionId);
  const showCompleted = sessionTasksExpanded.value[sessionId] ?? false;
  if (showCompleted) return tasks;
  return tasks.filter((t) => t.status === 'queued' || t.status === 'running');
};

/** 某会话已完成的子任务数 */
const completedTaskCount = (sessionId: string) => {
  return externalTasks.value.filter(
    (t) => t.sessionId === sessionId && t.status === 'completed'
  ).length;
};

/** 切换某会话的子任务展开状态 */
const toggleSessionTasksExpanded = (sessionId: string) => {
  sessionTasksExpanded.value[sessionId] = !sessionTasksExpanded.value[sessionId];
};

const sessionsInSpace = (space: WorkspaceSpace) =>
  sessions.value
    .filter((s) => s.spaceId === space.id)
    .sort((a, b) => b.createdAt - a.createdAt);

const isExpanded = (spaceId: string) => Boolean(spaceStore.expandedIds[spaceId]);

const useDefaultSpace = () => {
  const space = defaultSpace.value;
  if (!space) return;
  spaceStore.selectDefaultSpace();
  chatStore.setSpace(space.id, space.folderPath);
};

const createNewSession = () => {
  uiStore.showChat();
  chatStore.clearSession();
  const space = spaceStore.activeSpace || defaultSpace.value;
  if (space) chatStore.setSpace(space.id, space.folderPath);
};

const onRecentHeaderClick = () => {
  useDefaultSpace();
  uiStore.showChat();
  recentExpanded.value = true;
};

const selectSpace = (spaceId: string) => {
  const space = spaceStore.spaces.find((s) => s.id === spaceId);
  if (!space || space.isDefault) return;
  spaceStore.setActiveSpace(spaceId);
  chatStore.setSpace(space.id, space.folderPath);
  uiStore.showChat();
  if (!spaceStore.expandedIds[spaceId]) {
    spaceStore.expandedIds[spaceId] = true;
  }
};

const switchSession = (sessionId: string) => {
  uiStore.showChat();
  const wasViewingTask = Boolean(chatStore.currentExternalTaskId);
  chatStore.backToSession(); // 退出外部任务视图，回到对话

  // 已经是当前会话：只是从子任务视图切回来，消息还在，不用重载
  if (chatStore.currentSessionId === sessionId) {
    if (!wasViewingTask) return;
    // 防御：视图残留导致消息为空时，从缓存/后端补回
    if (chatStore.messages.length === 0) chatStore.loadSession(sessionId);
    return;
  }

  // loadSession 优先读缓存,找不到才从后端加载
  chatStore.loadSession(sessionId);
};

const switchRecentSession = (sessionId: string) => {
  useDefaultSpace();
  switchSession(sessionId);
};

const viewExternalTask = (taskId: string) => {
  chatStore.viewExternalTask(taskId);
  uiStore.showChat(); // 切换到聊天视图(会显示外部任务详情)
};

const isSessionWaiting = (sessionId: string) => {
  // 检查该会话是否有待完成的外部任务
  return externalTasks.value.some(
    (t) => t.sessionId === sessionId && (t.status === 'queued' || t.status === 'running')
  );
};

const handleDelete = async (sessionId: string) => {
  if (!confirm('确定删除此会话？')) return;
  try {
    await sessionsStore.deleteSession(sessionId);
    if (sessionId === currentSessionId.value) {
      chatStore.clearSession();
    }
  } catch {
    ElMessage.error('删除失败');
  }
};

const handleCreateSpace = async () => {
  try {
    const result = await window.electronAPI.invoke('dialog:open-folder');
    if (!result || result.canceled || !result.filePaths?.length) return;
    const folderPath = result.filePaths[0] as string;
    const defaultName = folderPath.split(/[/\\]/).filter(Boolean).pop() || '新空间';
    const name = window.prompt('空间名称', defaultName);
    if (name === null) return;
    const space = await spaceStore.createSpace(name.trim() || defaultName, folderPath);
    if (space) {
      chatStore.setSpace(space.id, space.folderPath);
      ElMessage.success(`已创建空间「${space.name}」`);
      uiStore.showChat();
    }
  } catch (err) {
    console.error(err);
    ElMessage.error('创建空间失败');
  }
};

const handleRenameSpace = async (space: WorkspaceSpace) => {
  const name = window.prompt('重命名空间', space.name);
  if (name === null || !name.trim()) return;
  const result = await spaceStore.renameSpace(space.id, name.trim());
  if (!result?.success) ElMessage.error(result?.error || '重命名失败');
};

const handleDeleteSpace = async (id: string) => {
  const space = spaceStore.spaces.find((s) => s.id === id);
  if (space?.isDefault) {
    ElMessage.warning('默认空间不可删除');
    return;
  }
  if (!confirm('删除空间不会删除本地文件夹与历史任务，确定继续？')) return;
  const result = await spaceStore.deleteSpace(id);
  if (!result?.success) {
    ElMessage.error(result?.error || '删除失败');
    return;
  }
  useDefaultSpace();
  ElMessage.success('已删除空间');
};

const revealSpace = async (folderPath: string) => {
  const result = await spaceStore.revealPath(folderPath);
  if (!result?.success) ElMessage.error(result?.error || '无法打开');
};

const sessionTooltip = (s: Session) => {
  const parts = [s.title];
  if (s.source === 'extension') parts.push('(来自浏览器插件)');
  if (s.workspacePath) parts.push(s.workspacePath);
  return parts.join(' ');
};

const relativeTime = (ts: number) => {
  const diff = Date.now() - ts;
  const min = Math.floor(diff / 60000);
  if (min < 1) return '刚刚';
  if (min < 60) return `${min}分钟前`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}小时前`;
  const day = Math.floor(hr / 24);
  if (day < 30) return `${day}天前`;
  return new Date(ts).toLocaleDateString();
};

let unsubscribe: (() => void) | null = null;

onMounted(async () => {
  await Promise.all([
    sessionsStore.loadSessions(),
    spaceStore.loadSpaces(),
    chatStore.loadExternalTasks()
  ]);
  if (!chatStore.workspacePath || !chatStore.spaceId) {
    useDefaultSpace();
  }
  unsubscribe = window.electronAPI.on('sessions:updated', () => {
    sessionsStore.loadSessions();
  });
});

watch(
  () => spaceStore.activeSpaceId,
  (id) => {
    if (!id) return;
    const space = spaceStore.spaces.find((s) => s.id === id);
    if (space && !chatStore.spaceId) {
      chatStore.setSpace(space.id, space.folderPath);
    }
  }
);

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
  padding: 16px 12px 8px;
  flex-shrink: 0;
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
  box-shadow: var(--shadow-md);
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

.nav-task-badge {
  margin-left: auto;
  flex-shrink: 0;
  min-width: 36px;
  padding: 1px 6px;
  border-radius: 999px;
  background: var(--color-accent-soft, #edf3ff);
  color: var(--color-accent, #3370ff);
  font-size: 11px;
  font-weight: 650;
  font-variant-numeric: tabular-nums;
  text-align: center;
  line-height: 1.5;
}

.nav-task-badge.minutes {
  background: #fffbeb;
  color: #d97706;
}

.nav-attention {
  margin-left: auto;
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  min-height: 18px;
}

.nav-attention .attn-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #16a34a;
  box-shadow: 0 0 0 3px rgba(22, 163, 74, 0.18);
}

.nav-attention .attn-fail {
  width: 14px;
  height: 14px;
  display: inline-grid;
  place-items: center;
  border-radius: 50%;
  background: #fee2e2;
  color: #dc2626;
  font-size: 10px;
  font-weight: 800;
  font-style: normal;
  line-height: 1;
}

.nav-item.processing .nav-task-badge {
  animation: nav-task-pulse 1.6s ease-in-out infinite;
}

@keyframes nav-task-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.55; }
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

.nav-item.active .nav-icon {
  color: var(--color-accent);
}

.sidebar-lists {
  flex: 1;
  overflow-y: auto;
  min-height: 0;
  display: flex;
  flex-direction: column;
  scrollbar-gutter: stable;
}

.sidebar-section {
  padding: 2px 8px 4px;
  flex-shrink: 0;
}

.section-header {
  padding: 6px 8px;
  display: flex;
  align-items: center;
  gap: 4px;
  border-radius: var(--radius-sm);
  user-select: none;
  flex-shrink: 0;
}

.section-header.section-active .section-title {
  color: var(--color-text-primary);
  font-weight: 600;
}

.section-count {
  margin-left: 2px;
  font-size: 11px;
  color: var(--color-text-muted);
  font-weight: 400;
}

.section-header.clickable {
  cursor: pointer;
}

.section-header.clickable:hover {
  background: var(--color-bg-hover);
}

.expand-icon {
  color: var(--color-text-muted);
  transition: transform 0.2s ease;
  flex-shrink: 0;
  opacity: 0.7;
}

.expand-icon.expanded {
  transform: rotate(90deg);
}

.expand-icon.end {
  margin-left: auto;
}

.expand-icon.sm {
  width: 11px;
  height: 11px;
}

.section-title {
  font-size: var(--font-sm);
  color: var(--color-text-tertiary);
  font-weight: 500;
  letter-spacing: 0;
  text-transform: none;
}

.space-list {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 0 2px 2px;
}

.space-list.compact {
  gap: 1px;
}

.new-project-row {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  margin-top: 4px;
  padding: 7px 10px;
  border: none;
  background: transparent;
  border-radius: var(--radius-sm);
  color: var(--color-text-tertiary);
  font-size: var(--font-sm);
  cursor: pointer;
  text-align: left;
}

.new-project-row:hover {
  background: var(--color-bg-hover);
  color: var(--color-text-primary);
}

.space-block {
  display: flex;
  flex-direction: column;
  gap: 0;
}

.space-row {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 6px 6px 6px 4px;
  border-radius: var(--radius-sm);
  cursor: pointer;
  color: var(--color-text-secondary);
  font-size: var(--font-base);
  font-weight: 500;
  min-height: 32px;
  position: relative;
}

.space-row:hover {
  background: var(--color-bg-hover);
  color: var(--color-text-primary);
}

.space-row.active {
  background: var(--color-bg-hover);
  color: var(--color-text-primary);
  font-weight: 600;
}

.chevron-btn {
  border: none;
  background: transparent;
  padding: 2px;
  cursor: pointer;
  display: flex;
  color: var(--color-text-muted);
  flex-shrink: 0;
}

.folder-icon {
  flex-shrink: 0;
  color: #ca8a04;
}

.space-row.active .folder-icon {
  color: #b45309;
}

.space-name {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
}

.space-trailing {
  position: relative;
  flex-shrink: 0;
  min-width: 44px;
  height: 22px;
  display: flex;
  align-items: center;
  justify-content: flex-end;
}

.space-trailing.has-delete {
  min-width: 64px;
}

.space-task-count {
  font-size: 10px;
  font-weight: 500;
  color: var(--color-text-muted);
  text-align: right;
  line-height: 22px;
  transition: opacity 0.12s ease;
}

.row-actions {
  position: absolute;
  right: 0;
  top: 0;
  bottom: 0;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 1px;
  background: var(--color-bg-hover);
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.12s ease;
}

.space-row:hover .space-task-count {
  opacity: 0;
}

.space-row:hover .row-actions {
  opacity: 1;
  pointer-events: auto;
}

.space-row.active .row-actions {
  background: var(--color-bg-hover);
}

.icon-btn {
  width: 20px;
  height: 20px;
  border: none;
  background: transparent;
  border-radius: var(--radius-sm);
  cursor: pointer;
  color: var(--color-text-tertiary);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.icon-btn:hover {
  background: var(--color-bg);
  color: var(--color-text-primary);
}

.icon-btn.danger:hover {
  background: var(--color-danger-soft);
  color: var(--color-danger);
}

.nested-sessions {
  margin: 0 4px 4px 18px;
  padding: 2px 0 4px 8px;
  border-left: 1px solid var(--color-border);
  display: flex;
  flex-direction: column;
  gap: 0;
}

.empty-nested {
  padding: 6px 8px;
  font-size: var(--font-xs);
  color: var(--color-text-muted);
}

.session-list {
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.recent-list {
  padding: 0 4px 4px 14px;
}

.session-item {
  padding: 6px 8px;
  font-size: var(--font-sm);
  color: var(--color-text-tertiary);
  background: transparent;
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: background 0.15s ease, color 0.15s ease;
  display: flex;
  align-items: center;
  gap: 6px;
  position: relative;
  min-height: 30px;
  font-weight: 400;
}

.session-item.nested {
  padding: 4px 8px 4px 4px;
  font-size: 12px;
  min-height: 26px;
  color: var(--color-text-muted);
}

.session-item.recent:hover,
.session-item.nested:hover {
  color: var(--color-text-secondary);
  background: var(--color-bg-hover);
}

.session-item.nested.active,
.session-item.recent.active {
  color: var(--color-accent-text);
  background: var(--color-accent-soft);
  font-weight: 500;
}

.session-item.recent.waiting {
  background: rgba(251, 191, 36, 0.1);
  border-left: 2px solid rgba(251, 191, 36, 0.5);
}

.session-item.recent.waiting .task-icon {
  color: rgba(251, 191, 36, 1);
}

.session-item.external-task {
  gap: 4px;
}

.session-item.external-task.nested {
  padding-left: 32px;
  font-size: 12px;
  opacity: 0.9;
}

.batch-label {
  font-size: 10px;
  padding: 1px 4px;
  border-radius: 3px;
  background: var(--color-accent-soft);
  color: var(--color-accent-text);
  font-weight: 500;
  white-space: nowrap;
}

.show-completed-btn {
  margin-left: 32px;
  padding: 4px 8px;
  font-size: 11px;
  color: var(--color-text-muted);
  cursor: pointer;
  border-radius: var(--radius-sm);
  transition: all 0.15s ease;
  user-select: none;
}

.show-completed-btn:hover {
  background: var(--color-bg-hover);
  color: var(--color-text-secondary);
}

.nest-indicator {
  color: var(--color-text-tertiary);
  font-size: 11px;
  margin-right: 4px;
  flex-shrink: 0;
}

.session-item.external-task.running {
  background: rgba(59, 130, 246, 0.1);
}

.session-item.external-task.completed {
  background: rgba(34, 197, 94, 0.1);
}

.session-item.external-task.failed {
  background: rgba(239, 68, 68, 0.1);
}

.session-item.external-task .task-icon.spinning {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}

.app-badge {
  display: inline-block;
  padding: 1px 6px;
  background: var(--color-accent-soft);
  color: var(--color-accent);
  border-radius: 4px;
  font-size: 10px;
  font-weight: 600;
  white-space: nowrap;
  flex-shrink: 0;
}

.task-icon {
  flex-shrink: 0;
  color: var(--color-text-muted);
  opacity: 0.7;
}

.session-item.active .task-icon {
  color: var(--color-accent);
  opacity: 1;
}

.session-title {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
}

.session-time {
  flex-shrink: 0;
  font-size: 10px;
  color: var(--color-text-muted);
  min-width: 3.5em;
  text-align: right;
}

.delete-btn {
  position: absolute;
  right: 4px;
  top: 50%;
  transform: translateY(-50%);
  width: 20px;
  height: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  background: var(--color-bg-hover);
  border-radius: var(--radius-sm);
  cursor: pointer;
  color: var(--color-text-tertiary);
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.12s ease;
}

.delete-btn:hover {
  background: var(--color-danger-soft);
  color: var(--color-danger);
}

.session-item:hover .delete-btn {
  opacity: 1;
  pointer-events: auto;
}

.session-item:hover .session-time {
  visibility: hidden;
}

.session-item.active:hover .delete-btn {
  background: var(--color-accent-soft);
}

.empty-hint {
  padding: 8px 12px;
  text-align: center;
  font-size: var(--font-sm);
  color: var(--color-text-muted);
}

.footprint-wrap {
  padding: 0 2px 4px;
  max-height: 280px;
  overflow-y: auto;
}

.sidebar-footer {
  padding: 8px 12px 12px;
  border-top: 1px solid var(--color-border);
  flex-shrink: 0;
}

.user-card {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px 8px;
  border-radius: var(--radius-md);
  cursor: pointer;
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
}

.settings-btn:hover {
  background: var(--color-bg-hover);
  color: var(--color-text-primary);
}
</style>
