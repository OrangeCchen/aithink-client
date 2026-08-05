<template>
  <div class="right-panel">
    <div class="rp-tabs">
      <button class="rp-tab" :class="{ active: activeTab === 'artifacts' }" @click="activeTab = 'artifacts'">
        产物
      </button>
      <button
        v-if="hasPending"
        class="rp-tab"
        :class="{ active: activeTab === 'questions', pulse: activeTab !== 'questions' }"
        @click="activeTab = 'questions'"
      >
        问题
        <span class="badge">{{ pendingCount }}</span>
      </button>
    </div>

    <div class="rp-body">
      <QuestionPanel v-if="activeTab === 'questions' && hasPending" />
      <div v-else class="tab-pane artifacts-pane">
        <div class="art-header">
          <div class="art-path" :title="folderPath">{{ shortPath(folderPath) || '未选择空间' }}</div>
          <div class="art-actions">
            <button class="art-btn" title="刷新" :disabled="!folderPath || filesLoading" @click="refreshFiles">
              <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="23 4 23 10 17 10"></polyline>
                <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path>
              </svg>
            </button>
            <button class="art-btn" title="在访达中打开空间根目录" :disabled="!folderPath" @click="openFolder">
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
        <div v-else-if="filesLoading" class="art-empty">加载中…</div>
        <div v-else-if="filesError" class="art-empty error">{{ filesError }}</div>
        <div v-else-if="files.length === 0" class="art-empty">
          Agent 写入本空间的文件会出现在这里
        </div>
        <ArtifactTree v-else :files="files" @open="onOpenEntry" />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import QuestionPanel from './QuestionPanel.vue';
import ArtifactTree from './ArtifactTree.vue';
import { useQuestionStore } from '@/stores/question';
import { useSpaceStore } from '@/stores/space';
import { useChatStore } from '@/stores/chat';
import { ElMessage } from 'element-plus';

const questionStore = useQuestionStore();
const spaceStore = useSpaceStore();
const chatStore = useChatStore();

const activeTab = ref<'questions' | 'artifacts'>('artifacts');

const hasPending = computed(() => questionStore.hasPending);
const pendingCount = computed(() => questionStore.pending?.questions.length || 0);
const files = computed(() => spaceStore.files);
const filesLoading = computed(() => spaceStore.filesLoading);
const filesError = computed(() => spaceStore.filesError);
const folderPath = computed(
  () => chatStore.workspacePath || spaceStore.activeFolderPath || ''
);

const shortPath = (path: string) => {
  if (!path) return '';
  const parts = path.split(/[/\\]/);
  if (parts.length > 3) return '.../' + parts.slice(-2).join('/');
  return path;
};

const refreshFiles = () => {
  if (folderPath.value) spaceStore.loadFiles(folderPath.value);
};

const openFolder = async () => {
  if (!folderPath.value) return;
  const result = await spaceStore.revealPath(folderPath.value);
  if (!result?.success) ElMessage.error(result?.error || '无法打开');
};

const onOpenEntry = async (path: string, _isDir: boolean) => {
  const result = await spaceStore.revealPath(path);
  if (!result?.success) ElMessage.error(result?.error || '无法打开');
};

watch(
  () => questionStore.focusQuestions,
  (v) => {
    if (v && questionStore.hasPending) {
      activeTab.value = 'questions';
      questionStore.focusQuestions = false;
    }
  }
);

watch(hasPending, (v) => {
  if (v) {
    activeTab.value = 'questions';
  } else if (activeTab.value === 'questions') {
    // 答完后隐藏「问题」页签，回到产物
    activeTab.value = 'artifacts';
  }
});

watch(
  () => [activeTab.value, folderPath.value] as const,
  ([tab, path]) => {
    if (tab === 'artifacts' && path) refreshFiles();
  }
);

watch(
  () => chatStore.streaming,
  (streaming, was) => {
    if (was && !streaming && activeTab.value === 'artifacts') {
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
