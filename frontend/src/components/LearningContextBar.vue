<template>
  <div v-if="examStore.isExamMode" class="learning-context-bar">
    <div class="ctx-left">
      <span class="ctx-label">备考</span>
      <span class="ctx-profile" :title="spaceName">{{ spaceName }}</span>
      <span class="ctx-sep">›</span>
      <span v-if="examStore.isSyllabusEmpty" class="ctx-empty">考纲尚空，沉淀笔记时自动生长</span>
      <select
        v-else
        class="ctx-select"
        :value="examStore.activeSyllabusNodeId"
        @change="onChapterChange"
      >
        <option value="">选择章节（可选）</option>
        <option v-for="node in examStore.flatNodes" :key="node.id" :value="node.id">
          {{ node.title }}
        </option>
      </select>
    </div>
    <div class="ctx-actions">
      <button class="ctx-link" type="button" title="从 JSON/Markdown 覆盖考纲" @click="handleImportSyllabus">
        导入考纲
      </button>
      <button class="ctx-link" type="button" title="打开 syllabus.json" @click="editSyllabus">
        编辑考纲
      </button>
      <button class="ctx-link" type="button" title="重新读取 syllabus.json" @click="reloadSyllabus">
        刷新
      </button>
      <button
        v-if="examStore.activeSyllabusNodeId"
        class="ctx-link"
        type="button"
        @click="openNotes"
      >
        本章语料
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { ElMessage } from 'element-plus';
import { useExamProfileStore } from '@/stores/examProfile';
import { useSpaceStore } from '@/stores/space';

const examStore = useExamProfileStore();
const spaceStore = useSpaceStore();

const spaceName = computed(() => spaceStore.activeSpace?.name || '');

const onChapterChange = (e: Event) => {
  const v = (e.target as HTMLSelectElement).value;
  examStore.setActiveSyllabusNode(v);
};

const editSyllabus = () => {
  examStore.openSyllabusFile();
};

const handleImportSyllabus = async () => {
  try {
    const count = await examStore.importSyllabus();
    ElMessage.success(`已导入 ${count ?? ''} 个章节`);
  } catch (err: any) {
    ElMessage.error(err?.message || '导入失败');
  }
};

const reloadSyllabus = async () => {
  try {
    await examStore.loadSyllabusForActiveSpace();
    ElMessage.success('已从 syllabus.json 重新加载考纲');
  } catch {
    ElMessage.error('刷新考纲失败');
  }
};

const openNotes = () => {
  const node = examStore.activeNode;
  if (!node || !spaceStore.activeFolderPath) return;
  const path = `${spaceStore.activeFolderPath}/notes/${node.slug}`;
  spaceStore.revealPath(path);
};
</script>

<style scoped>
.learning-context-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 8px 16px;
  border-bottom: 1px solid var(--color-border);
  background: var(--color-bg-subtle);
  font-size: var(--font-sm);
}

.ctx-left {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  flex: 1;
}

.ctx-actions {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-shrink: 0;
}

.ctx-label {
  color: var(--color-text-muted);
  flex-shrink: 0;
}

.ctx-profile {
  font-weight: 600;
  color: var(--color-text-primary);
  max-width: 140px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ctx-sep {
  color: var(--color-text-muted);
}

.ctx-select {
  flex: 1;
  max-width: 220px;
  padding: 4px 8px;
  border-radius: var(--radius-sm);
  border: 1px solid var(--color-border);
  background: var(--color-bg);
  color: var(--color-text-primary);
  font-size: var(--font-sm);
}

.ctx-empty {
  flex: 1;
  font-size: var(--font-sm);
  color: var(--color-text-muted);
}

.ctx-link {
  border: none;
  background: transparent;
  color: var(--color-accent-text, var(--color-accent));
  font-size: var(--font-sm);
  cursor: pointer;
  flex-shrink: 0;
  padding: 0;
}

.ctx-link:hover {
  text-decoration: underline;
}
</style>
