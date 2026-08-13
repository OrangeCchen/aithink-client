<template>
  <el-dialog v-model="visible" title="新建备考项目" width="480px" @closed="reset">
    <div class="form">
      <label class="field">
        <span>项目名称</span>
        <input v-model="name" type="text" placeholder="如：2026 软考系分" />
      </label>

      <fieldset v-if="showAdvanced" class="field syllabus-mode">
        <legend>高级：导入考纲（可选）</legend>
        <label class="radio-row">
          <input v-model="syllabusMode" type="radio" value="blank" />
          <span>从对话生长（推荐）</span>
        </label>
        <label class="radio-row">
          <input v-model="syllabusMode" type="radio" value="import" />
          <span>导入考纲文件</span>
          <span class="radio-hint">.json / .md</span>
        </label>
      </fieldset>

      <div v-if="showAdvanced && syllabusMode === 'import'" class="import-row">
        <button class="pick-btn" type="button" @click="pickSyllabusFile">
          {{ syllabusFilePath ? '更换文件' : '选择考纲文件' }}
        </button>
        <span v-if="syllabusFileLabel" class="file-label" :title="syllabusFilePath">
          {{ syllabusFileLabel }}
        </span>
      </div>

      <p class="hint">
        考纲初始为空。学习、问答后点「沉淀」，填写章节名即可把内容收进考纲。
        也可稍后在顶部栏「导入考纲」批量导入。
      </p>
      <button class="link-btn" type="button" @click="showAdvanced = !showAdvanced">
        {{ showAdvanced ? '收起高级选项' : '高级：预先导入考纲' }}
      </button>
    </div>
    <template #footer>
      <button class="btn ghost" type="button" @click="visible = false">取消</button>
      <button class="btn primary" type="button" :disabled="loading" @click="submit">
        {{ loading ? '创建中…' : '创建' }}
      </button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { ElMessage } from 'element-plus';
import { useExamProfileStore } from '@/stores/examProfile';

const visible = defineModel<boolean>('visible', { default: false });

const examStore = useExamProfileStore();
const name = ref('');
const syllabusMode = ref<'blank' | 'import'>('blank');
const showAdvanced = ref(false);
const syllabusFilePath = ref('');
const loading = ref(false);

const syllabusFileLabel = computed(() => {
  if (!syllabusFilePath.value) return '';
  const parts = syllabusFilePath.value.split(/[/\\]/);
  return parts[parts.length - 1] || syllabusFilePath.value;
});

const reset = () => {
  name.value = '';
  syllabusMode.value = 'blank';
  showAdvanced.value = false;
  syllabusFilePath.value = '';
  loading.value = false;
};

const pickSyllabusFile = async () => {
  try {
    const result = await window.electronAPI.invoke('dialog:open-syllabus-file');
    if (!result || result.canceled || !result.filePaths?.length) return;
    syllabusFilePath.value = result.filePaths[0] as string;
  } catch (err: any) {
    ElMessage.error(err?.message || '无法选择文件');
  }
};

const submit = async () => {
  const n = name.value.trim();
  if (!n) {
    ElMessage.warning('请输入项目名称');
    return;
  }
  if (syllabusMode.value === 'import' && !syllabusFilePath.value) {
    ElMessage.warning('请选择考纲文件，或改为「空白开始」');
    return;
  }
  loading.value = true;
  try {
    await examStore.createExamProfile(
      n,
      showAdvanced.value && syllabusMode.value === 'import'
        ? syllabusFilePath.value
        : undefined
    );
    ElMessage.success('备考项目已创建');
    visible.value = false;
  } catch (err: any) {
    ElMessage.error(err?.message || '创建失败');
  } finally {
    loading.value = false;
  }
};
</script>

<style scoped>
.form {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: var(--font-sm);
  color: var(--color-text-secondary);
}

.field input[type='text'] {
  padding: 8px 10px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  font-size: var(--font-sm);
}

.syllabus-mode {
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  padding: 10px 12px;
  margin: 0;
}

.syllabus-mode legend {
  padding: 0 4px;
  font-size: var(--font-sm);
  color: var(--color-text-secondary);
}

.radio-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  padding: 6px 0;
  cursor: pointer;
  font-size: var(--font-sm);
  color: var(--color-text-primary);
}

.radio-hint {
  font-size: var(--font-xs);
  color: var(--color-text-muted);
}

.import-row {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.pick-btn {
  padding: 6px 12px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  background: var(--color-bg);
  font-size: var(--font-sm);
  cursor: pointer;
}

.pick-btn:hover {
  background: var(--color-bg-hover);
}

.file-label {
  font-size: var(--font-xs);
  color: var(--color-text-muted);
  max-width: 240px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.hint {
  font-size: var(--font-xs);
  color: var(--color-text-muted);
  margin: 0;
  line-height: 1.55;
}

.hint code {
  font-size: 11px;
  background: var(--color-bg-subtle);
  padding: 1px 4px;
  border-radius: 3px;
}

.link-btn {
  border: none;
  background: transparent;
  color: var(--color-accent-text, var(--color-accent));
  font-size: var(--font-xs);
  cursor: pointer;
  padding: 0;
  text-align: left;
}

.link-btn:hover {
  text-decoration: underline;
}

.btn {
  padding: 8px 16px;
  border-radius: var(--radius-sm);
  font-size: var(--font-sm);
  cursor: pointer;
  border: 1px solid var(--color-border);
  margin-left: 8px;
}

.btn.primary {
  background: var(--color-accent);
  color: #fff;
  border-color: var(--color-accent);
}

.btn.ghost {
  background: transparent;
}
</style>
