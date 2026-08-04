<template>
  <div class="footprint-panel">
    <div v-if="recordings.length === 0" class="empty-state">
      <div class="empty-icon">
        <svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="currentColor" stroke-width="1.5">
          <circle cx="12" cy="12" r="3"></circle>
          <circle cx="12" cy="12" r="9"></circle>
        </svg>
      </div>
      <div class="empty-text">暂无足迹记录</div>
      <div class="empty-hint">在浏览器插件中开启录制即可</div>
    </div>

    <div v-else class="recording-list">
      <div
        v-for="rec in recordings"
        :key="rec.id"
        class="recording-item"
      >
        <div class="recording-header" @click="toggleExpand(rec.id)">
          <div class="recording-info">
            <span
              class="status-dot"
              :class="{ active: !rec.endedAt }"
            />
            <input
              v-if="editingId === rec.id"
              v-model="editingName"
              @click.stop
              @keydown.enter="confirmRename(rec.id)"
              @keydown.escape="cancelRename"
              @blur="confirmRename(rec.id)"
              class="rename-input"
              ref="renameInput"
            />
            <span v-else class="recording-name" @dblclick.stop="startRename(rec)">
              {{ rec.name }}
            </span>
          </div>
          <div class="recording-meta">
            <span class="page-count">{{ rec.pageCount }} 页</span>
            <button
              class="action-btn"
              @click.stop="startRename(rec)"
              title="重命名"
            >
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M12 20h9M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path>
              </svg>
            </button>
            <button
              class="action-btn danger"
              @click.stop="handleDelete(rec)"
              title="删除"
            >
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
              </svg>
            </button>
            <svg
              class="expand-icon"
              :class="{ expanded: expandedIds.has(rec.id) }"
              viewBox="0 0 24 24" width="14" height="14"
              fill="none" stroke="currentColor" stroke-width="2"
            >
              <polyline points="9 18 15 12 9 6"></polyline>
            </svg>
          </div>
        </div>

        <div v-if="expandedIds.has(rec.id)" class="page-list">
          <div v-if="loadingPagesId === rec.id" class="loading">加载中...</div>
          <div v-else-if="(pagesByRecording[rec.id] || []).length === 0" class="empty">
            该会话暂无页面记录
          </div>
          <template v-else>
            <div
              v-for="page in mergePages(pagesByRecording[rec.id] || [])"
              :key="page.id"
              class="page-item"
            >
              <a
                href="#"
                @click.prevent="openInBrowser(page.url)"
                :title="page.url"
                class="page-title"
              >
                {{ page.title || page.url }}
              </a>
              <div class="page-meta">
                <span class="page-url">{{ truncateUrl(page.url) }}</span>
                <span v-if="page.visitCount > 1" class="visit-count">×{{ page.visitCount }}</span>
              </div>
            </div>
          </template>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, nextTick } from 'vue';
import type { RecordingSession, PageVisit } from '@shared/types';

const recordings = ref<RecordingSession[]>([]);
const expandedIds = ref<Set<string>>(new Set());
const pagesByRecording = ref<Record<string, PageVisit[]>>({});
const loadingPagesId = ref<string | null>(null);
const editingId = ref<string | null>(null);
const editingName = ref('');
const renameInput = ref<HTMLInputElement | null>(null);

const loadRecordings = async () => {
  try {
    recordings.value = await window.electronAPI.invoke('recording:list');
  } catch (err) {
    console.error('加载录制会话失败:', err);
  }
};

const loadPages = async (recordingId: string) => {
  loadingPagesId.value = recordingId;
  try {
    const pages: PageVisit[] = await window.electronAPI.invoke('recording:listPages', recordingId);
    pagesByRecording.value = { ...pagesByRecording.value, [recordingId]: pages };
  } catch (err) {
    console.error('加载页面列表失败:', err);
  } finally {
    loadingPagesId.value = null;
  }
};

const toggleExpand = (id: string) => {
  const newSet = new Set(expandedIds.value);
  if (newSet.has(id)) {
    newSet.delete(id);
  } else {
    newSet.add(id);
    if (!pagesByRecording.value[id]) {
      void loadPages(id);
    }
  }
  expandedIds.value = newSet;
};

const startRename = (rec: RecordingSession) => {
  editingId.value = rec.id;
  editingName.value = rec.name;
  void nextTick(() => {
    renameInput.value?.focus();
    renameInput.value?.select();
  });
};

const confirmRename = async (id: string) => {
  if (editingId.value !== id) return;
  const newName = editingName.value.trim();
  if (newName && newName !== recordings.value.find(r => r.id === id)?.name) {
    await window.electronAPI.invoke('recording:rename', { id, name: newName });
    await loadRecordings();
  }
  editingId.value = null;
};

const cancelRename = () => {
  editingId.value = null;
};

const handleDelete = async (rec: RecordingSession) => {
  if (!confirm(`确定删除"${rec.name}"及其所有页面记录？`)) return;
  await window.electronAPI.invoke('recording:delete', rec.id);
  await loadRecordings();
  delete pagesByRecording.value[rec.id];
};

const openInBrowser = (url: string) => {
  void window.electronAPI.openExternal(url);
};

const truncateUrl = (url: string) => {
  try {
    const u = new URL(url);
    const path = u.pathname + u.search;
    const truncatedPath = path.length > 30 ? path.slice(0, 30) + '...' : path;
    return u.hostname + truncatedPath;
  } catch {
    return url.length > 50 ? url.slice(0, 50) + '...' : url;
  }
};

// 合并同一 URL 的多次访问，记录访问次数和最后访问时间
const mergePages = (pages: PageVisit[]) => {
  const map = new Map<string, PageVisit & { visitCount: number }>();
  for (const p of pages) {
    const existing = map.get(p.url);
    if (existing) {
      existing.visitCount += 1;
      if (p.visitedAt > existing.visitedAt) {
        existing.visitedAt = p.visitedAt;
        existing.title = p.title || existing.title;
      }
    } else {
      map.set(p.url, { ...p, visitCount: 1 });
    }
  }
  return Array.from(map.values()).sort((a, b) => b.visitedAt - a.visitedAt);
};

let unsubRecordings: (() => void) | null = null;
let unsubPages: (() => void) | null = null;

onMounted(() => {
  void loadRecordings();
  unsubRecordings = window.electronAPI.on('recordings:updated', () => {
    void loadRecordings();
  });
  unsubPages = window.electronAPI.on('pages:updated', (data: any) => {
    if (data?.recordingId && expandedIds.value.has(data.recordingId)) {
      void loadPages(data.recordingId);
    }
    void loadRecordings(); // 更新页面计数
  });
});

onUnmounted(() => {
  unsubRecordings?.();
  unsubPages?.();
});
</script>

<style scoped>
.footprint-panel {
  padding: 8px 0;
}

.empty-state {
  padding: 32px 16px;
  text-align: center;
  color: var(--color-text-muted);
}

.empty-icon {
  display: flex;
  justify-content: center;
  margin-bottom: 8px;
  color: var(--color-text-muted);
}

.empty-text {
  font-size: var(--font-base);
  margin-bottom: 4px;
}

.empty-hint {
  font-size: var(--font-xs);
  color: var(--color-text-muted);
}

.recording-list {
  display: flex;
  flex-direction: column;
}

.recording-item {
  border-bottom: 1px solid var(--color-border);
}

.recording-item:last-child {
  border-bottom: none;
}

.recording-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 16px;
  cursor: pointer;
  transition: background 0.15s ease;
}

.recording-header:hover {
  background: var(--color-bg-hover);
}

.recording-info {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
  min-width: 0;
}

.status-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--color-text-muted);
  flex-shrink: 0;
}

.status-dot.active {
  background: var(--color-danger);
  animation: pulse 1.5s ease-in-out infinite;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}

.recording-name {
  font-size: var(--font-base);
  color: var(--color-text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.rename-input {
  font-size: var(--font-base);
  padding: 2px 6px;
  border: 1px solid var(--color-accent);
  border-radius: var(--radius-sm);
  outline: none;
  flex: 1;
  min-width: 0;
}

.recording-meta {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}

.page-count {
  font-size: var(--font-xs);
  color: var(--color-text-secondary);
  background: var(--color-bg-soft);
  padding: 2px 8px;
  border-radius: var(--radius-full);
}

.action-btn {
  background: transparent;
  border: none;
  cursor: pointer;
  padding: 4px;
  color: var(--color-text-tertiary);
  border-radius: var(--radius-sm);
  display: flex;
  align-items: center;
  transition: all 0.15s ease;
}

.action-btn:hover {
  background: var(--color-bg-hover);
  color: var(--color-text-secondary);
}

.action-btn.danger:hover {
  background: var(--color-danger-soft);
  color: var(--color-danger);
}

.expand-icon {
  color: var(--color-text-tertiary);
  transition: transform 0.2s;
  margin-left: 4px;
}

.expand-icon.expanded {
  transform: rotate(90deg);
}

.page-list {
  background: var(--color-bg);
  padding: 4px 0;
}

.page-item {
  padding: 6px 16px 6px 32px;
  border-left: 2px solid transparent;
  transition: all 0.15s ease;
}

.page-item:hover {
  border-left-color: var(--color-accent);
  background: var(--color-bg-subtle);
}

.page-title {
  display: block;
  font-size: var(--font-sm);
  color: var(--color-accent-text);
  text-decoration: none;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  cursor: pointer;
}

.page-title:hover {
  color: var(--color-accent-hover);
  text-decoration: underline;
}

.page-meta {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 2px;
  font-size: var(--font-xs);
  color: var(--color-text-muted);
}

.page-url {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  flex: 1;
  min-width: 0;
}

.visit-count {
  background: var(--color-warning-soft);
  color: var(--color-warning);
  padding: 1px 5px;
  border-radius: var(--radius-full);
  flex-shrink: 0;
  font-weight: 500;
}

.loading,
.empty {
  padding: 12px 16px;
  font-size: var(--font-sm);
  color: var(--color-text-muted);
  text-align: center;
}
</style>
