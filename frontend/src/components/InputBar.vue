<template>
  <div class="input-bar">
    <!-- 工作空间显示 -->
    <div v-if="workspacePath" class="workspace-info">
      <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8">
        <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
      </svg>
      <span class="workspace-path" :title="workspacePath">{{ displayWorkspacePath }}</span>
      <button class="workspace-btn" @click="handleChangeWorkspace" title="更改工作空间">
        <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
        </svg>
      </button>
    </div>
    <div v-else class="workspace-info empty">
      <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8">
        <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
      </svg>
      <span class="workspace-placeholder">未设置工作空间</span>
      <button class="workspace-btn primary" @click="handleChangeWorkspace" title="选择工作空间">
        <span>选择</span>
      </button>
    </div>

    <div class="input-container">
      <!-- 斜杠命令：已安装技能菜单 -->
      <div v-if="showSlashMenu && filteredSlashSkills.length > 0" class="slash-menu">
        <div class="slash-menu-title">调用技能</div>
        <button
          v-for="skill in filteredSlashSkills"
          :key="skill.slug"
          class="slash-item"
          @mousedown.prevent="selectSlashSkill(skill)"
        >
          <span class="slash-item-name">{{ skill.name }}</span>
          <span class="slash-item-hint">/{{ skill.skillName || skill.slug }}</span>
        </button>
      </div>

      <el-input
        ref="textareaRef"
        v-model="inputText"
        type="textarea"
        :autosize="{ minRows: 1, maxRows: 8 }"
        placeholder="继续对话...（输入 / 调用已安装技能）"
        @input="onInput"
        @keydown.enter.exact.prevent="handleSend"
        :disabled="streaming"
      />
      <div class="input-toolbar">
        <div class="toolbar-left">
          <el-select v-model="selectedModel" size="small" class="model-select">
            <el-option
              v-for="model in availableModels"
              :key="model.value"
              :label="model.label"
              :value="model.value"
            />
          </el-select>
          <button class="tool-btn" @click="handleAttachment" title="附件">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8">
              <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"></path>
            </svg>
          </button>
          <button class="tool-btn" @click="handleVoice" title="语音">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8">
              <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path>
              <path d="M19 10v2a7 7 0 0 1-14 0v-2"></path>
              <line x1="12" y1="19" x2="12" y2="23"></line>
            </svg>
          </button>
        </div>
        <button
          class="send-btn"
          @click="handleSend"
          :disabled="!inputText.trim() || streaming"
          :title="streaming ? '发送中...' : '发送 (Enter)'"
        >
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="22" y1="2" x2="11" y2="13"></line>
            <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
          </svg>
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue';
import { useChatStore } from '@/stores/chat';
import { useModelStore } from '@/stores/model';
import { useSkillStore } from '@/stores/skill';
import { ElMessage } from 'element-plus';

const chatStore = useChatStore();
const modelStore = useModelStore();
const skillStore = useSkillStore();

const inputText = ref('');
const textareaRef = ref();

// 斜杠命令：调用已安装技能
const showSlashMenu = ref(false);
const slashQuery = ref('');
const installedSkills = computed(() => skillStore.installed);
const filteredSlashSkills = computed(() => {
  const q = slashQuery.value.toLowerCase();
  const list = installedSkills.value;
  if (!q) return list;
  return list.filter(
    (s) =>
      s.name.toLowerCase().includes(q) ||
      (s.skillName || s.slug).toLowerCase().includes(q)
  );
});

// 回填待处理输入（从技能市场"立即使用"跳转而来）
const applyPendingInput = () => {
  const pending = chatStore.consumePendingInput();
  if (pending) {
    inputText.value = pending;
    focusTextarea();
  }
};

const focusTextarea = () => {
  setTimeout(() => {
    const textarea = textareaRef.value?.$el?.querySelector('textarea');
    if (textarea) {
      textarea.focus();
      textarea.scrollTop = textarea.scrollHeight;
    }
  }, 100);
};

// 输入变化时检测行首斜杠命令
const onInput = () => {
  const text = inputText.value;
  const match = /(?:^|\n)\/([^\s/]*)$/.exec(text);
  if (match && installedSkills.value.length > 0) {
    showSlashMenu.value = true;
    slashQuery.value = match[1];
  } else {
    showSlashMenu.value = false;
  }
};

// 选择技能：把行首的 /xxx 替换为调用提示（必须用 frontmatter skillName）
const selectSlashSkill = (skill: { name: string; slug: string; skillName?: string }) => {
  const id = skill.skillName || skill.slug;
  const prompt =
    skill.name && skill.name !== id
      ? `请使用 Skill 工具调用技能「${id}」（${skill.name}），并严格按其 SKILL.md 流程开始执行：`
      : `请使用 Skill 工具调用技能「${id}」，并严格按其 SKILL.md 流程开始执行：`;
  inputText.value = inputText.value.replace(/(?:^|\n)?\/[^\s/]*$/, (m) => {
    const prefix = m.startsWith('\n') ? '\n' : '';
    return `${prefix}${prompt}`;
  });
  showSlashMenu.value = false;
  focusTextarea();
};

watch(() => chatStore.pendingInput, (val) => {
  if (val) applyPendingInput();
});

onMounted(() => {
  // 确保已安装技能列表可用于斜杠命令
  if (skillStore.installed.length === 0) {
    skillStore.loadInstalled();
  }
  applyPendingInput();
});

const selectedModel = computed({
  get: () => modelStore.currentModel,
  set: (val) => modelStore.setModel(val)
});

const availableModels = computed(() => modelStore.availableModels);
const streaming = computed(() => chatStore.streaming);
const workspacePath = computed(() => chatStore.workspacePath);

// 显示工作空间路径（缩短显示）
const displayWorkspacePath = computed(() => {
  if (!workspacePath.value) return '';
  const path = workspacePath.value;
  // 如果路径过长，只显示最后两层
  const parts = path.split(/[/\\]/);
  if (parts.length > 3) {
    return '.../' + parts.slice(-2).join('/');
  }
  return path;
});

const handleSend = async () => {
  const text = inputText.value.trim();
  if (!text || streaming.value) return;

  await chatStore.sendMessage(text, selectedModel.value);
  inputText.value = '';
};

const handleAttachment = () => {
  ElMessage.info('附件功能开发中...');
};

const handleVoice = () => {
  ElMessage.info('语音输入开发中...');
};

const handleChangeWorkspace = async () => {
  try {
    // 调用 Electron 文件夹选择对话框
    const result = await window.electronAPI.invoke('dialog:open-folder');
    if (result && !result.canceled && result.filePaths.length > 0) {
      const selectedPath = result.filePaths[0];
      chatStore.setWorkspacePath(selectedPath);
      ElMessage.success('工作空间已更新');
    }
  } catch (error) {
    console.error('Failed to select workspace:', error);
    ElMessage.error('选择工作空间失败');
  }
};

// 暴露方法供外部调用
const appendText = (text: string) => {
  if (inputText.value) {
    inputText.value += '\n' + text;
  } else {
    inputText.value = text;
  }
  // 聚焦到输入框
  setTimeout(() => {
    const textarea = textareaRef.value?.$el?.querySelector('textarea');
    if (textarea) {
      textarea.focus();
      textarea.scrollTop = textarea.scrollHeight;
    }
  }, 100);
};

defineExpose({
  appendText
});
</script>

<style scoped>
.input-bar {
  padding: 16px 24px 20px;
  background: var(--color-bg);
}

/* 工作空间信息 */
.workspace-info {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  margin-bottom: 12px;
  background: var(--color-bg-subtle);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  font-size: var(--font-sm);
  color: var(--color-text-secondary);
}

.workspace-info svg {
  flex-shrink: 0;
  color: var(--color-text-tertiary);
}

.workspace-path {
  flex: 1;
  font-family: 'SF Mono', 'Menlo', 'Monaco', monospace;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.workspace-placeholder {
  flex: 1;
  color: var(--color-text-muted);
}

.workspace-btn {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 8px;
  border: none;
  background: transparent;
  border-radius: var(--radius-sm);
  cursor: pointer;
  color: var(--color-text-tertiary);
  font-size: var(--font-xs);
  transition: all 0.15s ease;
}

.workspace-btn:hover {
  background: var(--color-bg-hover);
  color: var(--color-text-primary);
}

.workspace-btn.primary {
  background: var(--color-text-primary);
  color: #fff;
  padding: 4px 10px;
}

.workspace-btn.primary:hover {
  background: #000;
}

.workspace-info.empty {
  border-style: dashed;
}

.input-container {
  display: flex;
  flex-direction: column;
  background: var(--color-bg-subtle);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  transition: all 0.15s ease;
  box-shadow: var(--shadow-sm);
  position: relative;
}

/* 斜杠命令菜单 */
.slash-menu {
  position: absolute;
  bottom: calc(100% + 6px);
  left: 0;
  right: 0;
  max-height: 240px;
  overflow-y: auto;
  background: var(--color-bg);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-lg, 0 8px 24px rgba(0, 0, 0, 0.12));
  padding: 4px;
  z-index: 20;
}

.slash-menu-title {
  font-size: var(--font-xs, 11px);
  color: var(--color-text-muted);
  padding: 6px 8px 4px;
}

.slash-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  padding: 8px 10px;
  border: none;
  background: transparent;
  border-radius: var(--radius-sm);
  cursor: pointer;
  text-align: left;
  transition: background 0.12s ease;
}

.slash-item:hover {
  background: var(--color-bg-hover);
}

.slash-item-name {
  font-size: var(--font-sm);
  color: var(--color-text-primary);
}

.slash-item-hint {
  font-size: var(--font-xs, 11px);
  color: var(--color-text-muted);
  font-family: 'SF Mono', 'Menlo', 'Monaco', monospace;
}

.input-container:focus-within {
  border-color: var(--color-text-tertiary);
  background: var(--color-bg);
  box-shadow: var(--shadow-md);
}

.input-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 6px 8px 8px 12px;
}

.toolbar-left {
  display: flex;
  align-items: center;
  gap: 4px;
}

.model-select {
  width: 130px;
  margin-right: 4px;
}

.tool-btn {
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

.tool-btn:hover {
  background: var(--color-bg-hover);
  color: var(--color-text-primary);
}

.send-btn {
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  background: var(--color-text-primary);
  color: #ffffff;
  border-radius: var(--radius-md);
  cursor: pointer;
  transition: all 0.15s ease;
  flex-shrink: 0;
}

.send-btn:hover:not(:disabled) {
  background: #000;
  transform: translateY(-0.5px);
}

.send-btn:active:not(:disabled) {
  transform: translateY(0);
}

.send-btn:disabled {
  background: var(--color-bg-hover);
  color: var(--color-text-muted);
  cursor: not-allowed;
}

:deep(.el-textarea__inner) {
  border: none;
  box-shadow: none !important;
  padding: 12px 14px 4px;
  font-size: var(--font-md);
  line-height: 1.5;
  resize: none;
  background: transparent;
  color: var(--color-text-primary);
}

:deep(.el-textarea__inner::placeholder) {
  color: var(--color-text-muted);
}

:deep(.el-select .el-input__wrapper) {
  background: transparent;
  box-shadow: none;
  padding: 0 8px;
  border-radius: var(--radius-sm);
  transition: background 0.15s;
}

:deep(.el-select:hover .el-input__wrapper) {
  background: var(--color-bg-hover);
}

:deep(.el-select.is-focus .el-input__wrapper) {
  box-shadow: none !important;
}

:deep(.el-input__inner) {
  font-size: var(--font-sm);
  color: var(--color-text-secondary);
}
</style>
