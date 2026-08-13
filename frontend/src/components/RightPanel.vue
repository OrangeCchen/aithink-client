<template>
  <div class="right-panel">
    <div class="rp-tabs">
      <button class="rp-tab active">
        {{ isExamNotesMode ? '本章语料' : '产物' }}
      </button>
    </div>

    <div class="rp-body">
      <div class="tab-pane artifacts-pane">
        <div class="art-header">
          <div class="art-path" :title="panelPathTitle">{{ panelPathLabel }}</div>
          <div class="art-actions">
            <button class="art-btn" title="刷新" :disabled="!canRefresh || filesLoading" @click="refreshFiles">
              <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="23 4 23 10 17 10"></polyline>
                <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path>
              </svg>
            </button>
            <button class="art-btn" title="在访达中打开" :disabled="!openPath" @click="openFolder">
              <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M5 4h5l2 2h9a1 1 0 0 1 1 1v2H4V5a1 1 0 0 1 1-1z"></path>
                <path d="M4 10h16l-1.2 8.2A1 1 0 0 1 17.8 19H6.2a1 1 0 0 1-1-0.8L4 10z"></path>
              </svg>
            </button>
          </div>
        </div>

        <div v-if="!folderPath" class="art-empty">
          请先在左侧或输入框选择工作空间
        </div>
        <div v-else-if="examStore.isSyllabusEmpty" class="art-empty">
          考纲尚空。对话后点「沉淀」，填写章节名即可开始积累语料
        </div>
        <div v-else-if="examStore.isExamMode && !examStore.activeSyllabusNodeId" class="art-empty">
          未选章节时，沉淀笔记会创建或归入对应章节
        </div>
        <div v-else-if="filesLoading" class="art-empty">加载中…</div>
        <div v-else-if="filesError" class="art-empty error">{{ filesError }}</div>
        <div v-else-if="files.length === 0" class="art-empty">
          {{ isExamNotesMode ? '本章还没有沉淀笔记，对话后可点击「沉淀」写入' : 'Agent 写入本空间的文件会出现在这里' }}
        </div>
        <ArtifactTree v-else :files="files" @open="onOpenEntry" />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, watch } from 'vue';
import ArtifactTree from './ArtifactTree.vue';
import { useSpaceStore } from '@/stores/space';
import { useChatStore } from '@/stores/chat';
import { useExamProfileStore } from '@/stores/examProfile';
import { ElMessage } from 'element-plus';

const spaceStore = useSpaceStore();
const chatStore = useChatStore();
const examStore = useExamProfileStore();

const isExamNotesMode = computed(
  () => examStore.isExamMode && Boolean(examStore.activeNode)
);
const files = computed(() =>
  isExamNotesMode.value ? examStore.chapterNotes : spaceStore.files
);
const filesLoading = computed(() =>
  isExamNotesMode.value ? examStore.chapterNotesLoading : spaceStore.filesLoading
);
const filesError = computed(() =>
  isExamNotesMode.value ? examStore.chapterNotesError : spaceStore.filesError
);
const folderPath = computed(
  () => chatStore.workspacePath || spaceStore.activeFolderPath || ''
);
const canRefresh = computed(() => {
  if (!folderPath.value) return false;
  if (examStore.isExamMode) return Boolean(examStore.activeSyllabusNodeId);
  return true;
});
const openPath = computed(() => {
  if (isExamNotesMode.value && examStore.activeNode) {
    return `${folderPath.value}/notes/${examStore.activeNode.slug}`;
  }
  return folderPath.value;
});

const shortPath = (path: string) => {
  if (!path) return '';
  const parts = path.split(/[/\\]/);
  if (parts.length > 3) return '.../' + parts.slice(-2).join('/');
  return path;
};

const panelPathTitle = computed(() => {
  if (isExamNotesMode.value && examStore.activeNode) {
    return `${folderPath.value}/notes/${examStore.activeNode.slug}`;
  }
  return folderPath.value;
});

const panelPathLabel = computed(() => {
  if (isExamNotesMode.value) return `本章语料 · ${examStore.activeNodeLabel}`;
  return shortPath(folderPath.value) || '未选择空间';
});

const refreshFiles = () => {
  if (isExamNotesMode.value) {
    void examStore.loadChapterNotesForPanel();
    return;
  }
  if (folderPath.value) spaceStore.loadFiles(folderPath.value);
};

const openFolder = async () => {
  if (!openPath.value) return;
  const result = await spaceStore.revealPath(openPath.value);
  if (!result?.success) ElMessage.error(result?.error || '无法打开');
};

const onOpenEntry = async (path: string, _isDir: boolean) => {
  const result = await spaceStore.revealPath(path);
  if (!result?.success) ElMessage.error(result?.error || '无法打开');
};

watch(
  () =>
    [
      folderPath.value,
      examStore.isExamMode,
      examStore.activeSyllabusNodeId
    ] as const,
  () => {
    refreshFiles();
  }
);

watch(
  () => chatStore.streaming,
  (streaming, was) => {
    if (was && !streaming) {
      refreshFiles();
    }
  }
);

watch(
  () => examStore.lastHighlightPath,
  () => {
    if (isExamNotesMode.value) {
      refreshFiles();
    }
  }
);

onMounted(() => {
  if (spaceStore.spaces.length === 0) spaceStore.loadSpaces();
  if (folderPath.value) refreshFiles();
});
</script>

<style scoped>
.right-panel {
  background: var(--color-bg-subtle);
  border-left: 1px solid var(--color-border);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  flex-shrink: 0;
  min-height: 0;
}

.rp-tabs {
  display: flex;
  border-bottom: 1px solid var(--color-border);
  flex-shrink: 0;
  background: var(--color-bg);
}

.rp-tab {
  flex: 1;
  padding: 10px 8px;
  border: none;
  background: transparent;
  color: var(--color-text-secondary);
  font-size: var(--font-sm);
  cursor: pointer;
  border-bottom: 2px solid transparent;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
}

.rp-tab.active {
  color: var(--color-accent-text, var(--color-accent));
  border-bottom-color: var(--color-accent);
  font-weight: 600;
}

.rp-tab.pulse {
  color: var(--color-accent);
}

.badge {
  min-width: 18px;
  height: 18px;
  padding: 0 5px;
  border-radius: 9px;
  background: var(--color-accent);
  color: #fff;
  font-size: 11px;
  line-height: 18px;
  text-align: center;
}

.rp-body {
  flex: 1;
  overflow-y: auto;
  background: var(--color-bg);
  min-height: 0;
}

.tab-pane {
  height: 100%;
}

.artifacts-pane {
  display: flex;
  flex-direction: column;
  min-height: 100%;
}

.art-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 14px 8px;
  border-bottom: 1px solid var(--color-border);
}

.art-path {
  flex: 1;
  font-size: var(--font-xs);
  color: var(--color-text-muted);
  font-family: 'SF Mono', Menlo, Monaco, monospace;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.art-actions {
  display: flex;
  gap: 2px;
}

.art-btn {
  width: 26px;
  height: 26px;
  border: none;
  background: transparent;
  border-radius: var(--radius-sm);
  cursor: pointer;
  color: var(--color-text-tertiary);
  display: flex;
  align-items: center;
  justify-content: center;
}

.art-btn:hover:not(:disabled) {
  background: var(--color-bg-hover);
  color: var(--color-text-primary);
}

.art-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.art-empty {
  padding: 32px 16px;
  text-align: center;
  font-size: var(--font-sm);
  color: var(--color-text-muted);
  line-height: 1.5;
}

.art-empty.error {
  color: var(--color-danger);
}
</style>
