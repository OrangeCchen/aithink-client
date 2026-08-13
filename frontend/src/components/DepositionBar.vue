<template>
  <div v-if="visible" class="deposition-bar">
    <div v-if="deposited" class="dep-done">
      已沉淀到本章语料
      <button type="button" class="dep-btn ghost" @click="openFile">打开文件</button>
    </div>
    <template v-else>
      <div class="dep-preview">
        <span class="dep-label">
          {{ examStore.isSyllabusEmpty ? '沉淀时将创建考纲章节' : '可沉淀为笔记' }}
        </span>
        <span class="dep-snippet">{{ snippet }}</span>
      </div>
      <div class="dep-actions">
        <input
          v-if="needsChapterName"
          v-model="chapterName"
          class="dep-title"
          type="text"
          placeholder="章节名（从对话提炼）"
          @keydown.enter.prevent="submit"
        />
        <select
          v-if="showChapterSelect"
          v-model="selectedNodeId"
          class="dep-select"
          @change="onSelectChapter"
        >
          <option value="">新建章节…</option>
          <option v-for="node in examStore.flatNodes" :key="node.id" :value="node.id">
            {{ node.title }}
          </option>
        </select>
        <input
          v-model="title"
          class="dep-title"
          type="text"
          placeholder="笔记标题"
          @keydown.enter.prevent="submit"
        />
        <button type="button" class="dep-btn primary" :disabled="loading" @click="submit">
          {{ loading ? '写入中…' : '沉淀' }}
        </button>
        <button type="button" class="dep-btn ghost" @click="dismiss">忽略</button>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { ElMessage } from 'element-plus';
import type { DepositionSource } from '@shared/types';
import { useExamProfileStore } from '@/stores/examProfile';
import { useSpaceStore } from '@/stores/space';

const props = defineProps<{
  messageId: string;
  content: string;
  defaultTitle?: string;
  sources: DepositionSource[];
}>();

const examStore = useExamProfileStore();
const spaceStore = useSpaceStore();

const title = ref('');
const chapterName = ref('');
const selectedNodeId = ref('');
const loading = ref(false);

const suggestChapter = () =>
  props.defaultTitle?.trim().slice(0, 40) ||
  props.content.trim().split('\n')[0]?.replace(/^#+\s*/, '').slice(0, 40) ||
  '';

watch(
  () => [props.defaultTitle, props.content, examStore.activeSyllabusNodeId] as const,
  () => {
    if (!title.value) {
      title.value =
        props.defaultTitle?.trim().slice(0, 60) ||
        props.content.trim().split('\n')[0]?.slice(0, 60) ||
        '学习笔记';
    }
    if (!chapterName.value) {
      chapterName.value = suggestChapter();
    }
    if (!selectedNodeId.value && examStore.activeSyllabusNodeId) {
      selectedNodeId.value = examStore.activeSyllabusNodeId;
    }
  },
  { immediate: true }
);

const visible = computed(
  () =>
    examStore.isExamMode &&
    props.content.trim().length >= 8 &&
    !examStore.isDismissed(props.messageId)
);

const deposited = computed(() => examStore.isDeposited(props.messageId));

const hasActiveChapter = computed(() => Boolean(examStore.activeSyllabusNodeId));

const showChapterSelect = computed(
  () => !hasActiveChapter.value && examStore.flatNodes.length > 0
);

const needsChapterName = computed(
  () => !hasActiveChapter.value && !selectedNodeId.value
);

const snippet = computed(() => {
  const t = props.content.trim().replace(/\s+/g, ' ');
  return t.length > 120 ? `${t.slice(0, 120)}…` : t;
});

const onSelectChapter = () => {
  if (selectedNodeId.value) {
    chapterName.value = '';
  } else if (!chapterName.value) {
    chapterName.value = suggestChapter();
  }
};

const submit = async () => {
  const nodeId = hasActiveChapter.value
    ? examStore.activeSyllabusNodeId
    : selectedNodeId.value || undefined;
  const chapter = chapterName.value.trim();

  if (!nodeId && !chapter) {
    ElMessage.warning('请填写章节名');
    return;
  }

  loading.value = true;
  try {
    await examStore.depose({
      messageId: props.messageId,
      title: title.value.trim() || '学习笔记',
      content: props.content,
      sources: props.sources,
      syllabusNodeId: nodeId,
      chapterTitle: !nodeId ? chapter : undefined
    });
    ElMessage.success('已沉淀');
    if (examStore.isExamMode) {
      await examStore.loadChapterNotesForPanel();
    } else {
      await spaceStore.loadFiles();
    }
  } catch (err: any) {
    ElMessage.error(err?.message || '沉淀失败');
  } finally {
    loading.value = false;
  }
};

const dismiss = () => {
  examStore.dismissMessage(props.messageId);
};

const openFile = async () => {
  const rel = examStore.depositedMessages[props.messageId];
  const root = spaceStore.activeFolderPath;
  if (!rel || !root) return;
  const path = `${root}/${rel}`.replace(/\/+/g, '/');
  await spaceStore.revealPath(path);
};
</script>

<style scoped>
.deposition-bar {
  margin-top: 10px;
  padding: 10px 12px;
  border-radius: var(--radius-md);
  border: 1px dashed var(--color-border);
  background: var(--color-bg-subtle);
}

.dep-preview {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-bottom: 8px;
}

.dep-label {
  font-size: var(--font-xs);
  color: var(--color-text-muted);
}

.dep-snippet {
  font-size: var(--font-sm);
  color: var(--color-text-secondary);
  line-height: 1.45;
}

.dep-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}

.dep-title {
  flex: 1;
  min-width: 120px;
  padding: 6px 8px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  font-size: var(--font-sm);
  background: var(--color-bg);
}

.dep-select {
  padding: 6px 8px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  font-size: var(--font-sm);
  background: var(--color-bg);
  max-width: 160px;
}

.dep-btn {
  padding: 6px 12px;
  border-radius: var(--radius-sm);
  font-size: var(--font-sm);
  cursor: pointer;
  border: 1px solid var(--color-border);
  background: var(--color-bg);
}

.dep-btn.primary {
  background: var(--color-accent);
  color: #fff;
  border-color: var(--color-accent);
}

.dep-btn.primary:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.dep-btn.ghost {
  background: transparent;
  color: var(--color-text-secondary);
}

.dep-done {
  font-size: var(--font-sm);
  color: var(--color-success, #16a34a);
  display: flex;
  align-items: center;
  gap: 10px;
}
</style>
