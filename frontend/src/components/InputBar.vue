<template>
  <div class="input-bar">
    <!-- 等待外部任务时的引导：任务完成后自动消失 -->
    <div v-if="isWaitingExternalTasks" class="waiting-hint">
      <span class="waiting-text">
        💡 任务在后台执行，您可以新建对话继续其他工作
      </span>
      <button class="waiting-action" @click="handleNewSession">新建对话</button>
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
        :placeholder="inputPlaceholder"
        @input="onInput"
        @paste="handlePaste"
        @compositionstart="isComposing = true"
        @compositionend="isComposing = false"
        @keydown.enter.exact="onEnterKeydown"
        :disabled="streaming || isWaitingExternalTasks"
      />

      <!-- 图片预览区：横向滚动，最多 10 张 -->
      <div v-if="pastedImages.length > 0" class="image-previews">
        <div
          v-for="(imgUrl, index) in pastedImages"
          :key="index"
          class="image-preview-item"
          @click="previewImage(imgUrl)"
        >
          <img :src="imgUrl" alt="pasted image" />
          <button class="image-remove" @click.stop="removeImage(index)" title="删除">×</button>
        </div>
      </div>

      <div class="input-toolbar">
        <div class="toolbar-left">
          <!-- 选择空间 -->
          <div class="space-picker" ref="spacePickerRef">
            <button class="space-trigger" @click="toggleSpaceMenu" :title="activeSpacePath">
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8">
                <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
              </svg>
              <span class="space-trigger-label">{{ activeSpaceLabel }}</span>
              <svg class="caret" viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="6 9 12 15 18 9"></polyline>
              </svg>
            </button>
            <div v-if="spaceMenuOpen" class="space-menu">
              <div class="space-search">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
                  <circle cx="11" cy="11" r="7"></circle>
                  <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                </svg>
                <input
                  v-model="spaceQuery"
                  type="text"
                  placeholder="搜索空间"
                  @mousedown.stop
                />
              </div>
              <div class="space-menu-list">
                <button
                  v-for="space in filteredSpaces"
                  :key="space.id"
                  class="space-option"
                  :class="{ active: space.id === activeSpaceId }"
                  @mousedown.prevent="selectSpace(space.id)"
                >
                  <svg class="opt-folder" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8">
                    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
                  </svg>
                  <span class="space-option-name">{{ spaceDisplayName(space) }}</span>
                </button>
                <div v-if="filteredSpaces.length === 0" class="space-empty">无匹配空间</div>
              </div>
              <div class="space-menu-divider"></div>
              <button class="space-option action" @mousedown.prevent="browseAndCreateSpace">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
                  <line x1="12" y1="5" x2="12" y2="19"></line>
                  <line x1="5" y1="12" x2="19" y2="12"></line>
                </svg>
                <span class="space-option-name">新建空间</span>
              </button>
            </div>
          </div>

          <el-select v-model="selectedModel" size="small" class="model-select">
            <el-option
              v-for="model in availableModels"
              :key="model.value"
              :label="model.label"
              :value="model.value"
            />
          </el-select>
          <el-select v-model="dispatchMode" size="small" class="dispatch-mode-select" title="对话模式">
            <el-option value="local" label="本机对话" />
            <el-option value="external" label="外部 App" />
          </el-select>
          <el-select
            v-if="dispatchMode === 'external'"
            v-model="externalAppTargets"
            multiple
            collapse-tags
            collapse-tags-tooltip
            size="small"
            class="dispatch-target-select"
            title="并发派发到多个 App"
            placeholder="选择 App"
          >
            <el-option
              v-for="opt in externalAppOptions"
              :key="opt.value"
              :label="opt.label"
              :value="opt.value"
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
          v-if="streaming"
          class="stop-btn"
          @click="handleStop"
          title="终止任务"
        >
          <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
            <rect x="6" y="6" width="12" height="12" rx="2"></rect>
          </svg>
        </button>
        <button
          v-else
          class="send-btn"
          @click="handleSend"
          :disabled="!inputText.trim() || isWaitingExternalTasks"
          :title="sendButtonTitle"
        >
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="22" y1="2" x2="11" y2="13"></line>
            <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
          </svg>
        </button>
      </div>
    </div>

    <!-- 图片放大预览弹窗 -->
    <div v-if="imagePreviewVisible" class="image-preview-overlay" @click="closeImagePreview">
      <div class="image-preview-container">
        <img :src="imagePreviewUrl" alt="preview" />
        <button class="preview-close" @click="closeImagePreview" title="关闭">×</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue';
import { useChatStore } from '@/stores/chat';
import { useModelStore } from '@/stores/model';
import { useSkillStore } from '@/stores/skill';
import { useSpaceStore } from '@/stores/space';
import { ElMessage } from 'element-plus';
import type { ExternalAppId } from '@shared/types';

const chatStore = useChatStore();
const modelStore = useModelStore();
const skillStore = useSkillStore();
const spaceStore = useSpaceStore();

const inputText = ref('');
const isComposing = ref(false);
const textareaRef = ref();
const spaceMenuOpen = ref(false);
const spaceQuery = ref('');
const spacePickerRef = ref<HTMLElement | null>(null);
// 粘贴的图片（base64 data URL）
const pastedImages = ref<string[]>([]);
// 图片放大预览
const imagePreviewVisible = ref(false);
const imagePreviewUrl = ref('');

// 只锁当前会话的输入；别的会话在跑不影响这里
const streaming = computed(() => chatStore.isStreamingActiveSession);
// 等待中的任务也只看当前会话
const sessionPendingTasks = computed(() =>
  chatStore.externalTasks.filter(
    (t) =>
      t.sessionId === chatStore.currentSessionId &&
      (t.status === 'queued' || t.status === 'running')
  )
);
const isWaitingExternalTasks = computed(() => sessionPendingTasks.value.length > 0);
const waitingTasksCount = computed(() => {
  const total = chatStore.externalTasks.filter(
    (t) => t.sessionId === chatStore.currentSessionId
  ).length;
  const pending = sessionPendingTasks.value.length;
  return { pending, completed: total - pending, total };
});

/** 新建对话：任务在后台继续跑，这里只切出一个干净会话 */
const handleNewSession = () => {
  chatStore.clearSession();
  ElMessage.success('已创建新对话');
};

/** 监听粘贴事件，提取图片（最多 10 张） */
const handlePaste = (event: ClipboardEvent) => {
  const items = event.clipboardData?.items;
  if (!items) return;

  for (const item of Array.from(items)) {
    if (item.type.startsWith('image/')) {
      event.preventDefault();

      if (pastedImages.value.length >= 10) {
        ElMessage.warning('最多只能添加 10 张图片');
        return;
      }

      const file = item.getAsFile();
      if (!file) continue;

      const reader = new FileReader();
      reader.onload = (e) => {
        const dataUrl = e.target?.result as string;
        if (dataUrl && pastedImages.value.length < 10) {
          pastedImages.value.push(dataUrl);
        }
      };
      reader.readAsDataURL(file);
    }
  }
};

/** 移除某张图片 */
const removeImage = (index: number) => {
  pastedImages.value.splice(index, 1);
};

/** 放大预览图片 */
const previewImage = (url: string) => {
  imagePreviewUrl.value = url;
  imagePreviewVisible.value = true;
};

/** 关闭图片预览 */
const closeImagePreview = () => {
  imagePreviewVisible.value = false;
  imagePreviewUrl.value = '';
};

const externalAppOptions: Array<{ value: ExternalAppId; label: string }> = [
  { value: 'doubao', label: '豆包' },
  { value: 'qwenworkcn', label: '千问Work' },
  { value: 'workbuddy', label: 'WorkBuddy' }
];

const dispatchMode = computed({
  get: () => chatStore.dispatchMode,
  set: (val: 'local' | 'external') => chatStore.setDispatchMode(val)
});

const externalAppTargets = computed({
  get: () => chatStore.externalAppTargets,
  set: (val: ExternalAppId[]) => chatStore.setExternalAppTargets(val)
});

const selectedExternalLabel = computed(() => {
  const labels = externalAppTargets.value
    .map((id) => externalAppOptions.find((o) => o.value === id)?.label)
    .filter(Boolean);
  if (labels.length === 0) return '外部 App';
  if (labels.length === 1) return labels[0];
  return `${labels.length} 个 App`;
});

const inputPlaceholder = computed(() => {
  if (isWaitingExternalTasks.value) {
    const { pending, completed, total } = waitingTasksCount.value;
    return `⏳ 等待外部任务 (${completed}/${total} 已完成，${pending} 进行中)`;
  }
  if (dispatchMode.value === 'external') {
    return `输入问题，Enter 并发派发到 ${selectedExternalLabel.value}（完成后自动汇总）`;
  }
  return '今天帮你做些什么？/ 调用已安装技能';
});

const sendButtonTitle = computed(() => {
  if (dispatchMode.value === 'external') {
    return `并发派发到 ${selectedExternalLabel.value} (Enter)`;
  }
  return '发送 (Enter)，Shift+Enter 换行';
});

const spaces = computed(() => spaceStore.spaces);
const activeSpaceId = computed(() => spaceStore.activeSpaceId || chatStore.spaceId);
const spaceDisplayName = (space: { name: string; isDefault?: boolean }) =>
  space.isDefault ? '选择工作空间' : space.name;
const filteredSpaces = computed(() => {
  const q = spaceQuery.value.trim().toLowerCase();
  if (!q) return spaces.value;
  return spaces.value.filter((s) => spaceDisplayName(s).toLowerCase().includes(q) || s.name.toLowerCase().includes(q));
});
const activeSpaceLabel = computed(() => {
  const s = spaces.value.find((x) => x.id === activeSpaceId.value) || spaceStore.activeSpace;
  if (!s) return '选择工作空间';
  return spaceDisplayName(s);
});
const activeSpacePath = computed(() => {
  const s = spaces.value.find((x) => x.id === activeSpaceId.value) || spaceStore.activeSpace;
  return s?.folderPath || chatStore.workspacePath || '';
});

const toggleSpaceMenu = () => {
  spaceMenuOpen.value = !spaceMenuOpen.value;
  if (spaceMenuOpen.value) spaceQuery.value = '';
};

const selectSpace = (spaceId: string) => {
  const space = spaces.value.find((s) => s.id === spaceId);
  if (!space) return;
  spaceStore.setActiveSpace(space.id);
  chatStore.setSpace(space.id, space.folderPath);
  spaceMenuOpen.value = false;
};

const browseAndCreateSpace = async () => {
  spaceMenuOpen.value = false;
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
      ElMessage.success(`已切换到「${space.name}」`);
    }
  } catch (err) {
    console.error(err);
    ElMessage.error('创建空间失败');
  }
};

const onDocClick = (e: MouseEvent) => {
  if (!spaceMenuOpen.value) return;
  const el = spacePickerRef.value;
  if (el && !el.contains(e.target as Node)) {
    spaceMenuOpen.value = false;
  }
};

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
  if (skillStore.installed.length === 0) skillStore.loadInstalled();
  if (spaceStore.spaces.length === 0) spaceStore.loadSpaces();
  applyPendingInput();
  document.addEventListener('mousedown', onDocClick);
});

onUnmounted(() => {
  document.removeEventListener('mousedown', onDocClick);
});

const selectedModel = computed({
  get: () => modelStore.currentModel,
  set: (val) => modelStore.setModel(val)
});

const availableModels = computed(() => modelStore.availableModels);


const handleSend = async () => {
  const text = inputText.value.trim();
  if (!text || streaming.value || isWaitingExternalTasks.value) return;

  if (dispatchMode.value === 'external') {
    if (externalAppTargets.value.length === 0) {
      ElMessage.warning('请至少选择一个外部 App');
      return;
    }
    await chatStore.dispatchToExternalApp(text, selectedModel.value);
  } else {
    const images = pastedImages.value.length > 0 ? [...pastedImages.value] : undefined;
    await chatStore.sendMessage(text, selectedModel.value, images);
  }

  inputText.value = '';
  pastedImages.value = [];
};

/** Enter 发送；IME 组字/选词时的回车不拦截 */
const onEnterKeydown = (event: KeyboardEvent) => {
  if (event.isComposing || isComposing.value || event.keyCode === 229) return;
  event.preventDefault();
  handleSend();
};

const handleStop = async () => {
  if (!streaming.value) return;
  await chatStore.cancelStreaming();
  ElMessage.info('已终止任务');
};

const handleAttachment = () => {
  ElMessage.info('附件功能开发中...');
};

const handleVoice = () => {
  ElMessage.info('语音输入开发中...');
};

const appendText = (text: string) => {
  if (inputText.value) {
    inputText.value += '\n' + text;
  } else {
    inputText.value = text;
  }
  focusTextarea();
};

defineExpose({ appendText });
</script>

<style scoped>
.input-bar {
  padding: 16px 24px 20px;
  background: var(--color-bg);
}

/* 等待外部任务时的引导条 */
.waiting-hint {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 8px;
  padding: 8px 12px;
  background: #f2f7ff;
  border: 1px solid #dbe9ff;
  border-radius: var(--radius-md, 8px);
}

.waiting-text {
  font-size: 12px;
  color: #1a5fb4;
}

.waiting-action {
  flex-shrink: 0;
  padding: 4px 12px;
  font-size: 12px;
  color: #fff;
  background: #3b82f6;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  transition: background 0.15s ease;
}

.waiting-action:hover {
  background: #2563eb;
}

.waiting-action:hover {
  background: #2563eb;
}

/* 图片预览区：横向滚动，最多 10 张 */
.image-previews {
  display: flex;
  flex-wrap: nowrap;
  align-items: center;
  gap: 8px;
  padding: 8px 0;
  overflow-x: auto;
  /* 不显式关掉纵向，overflow-y:visible 会被规范提升为 auto，冒出竖滚动条 */
  overflow-y: hidden;
  overscroll-behavior-x: contain;
}

.image-previews::-webkit-scrollbar {
  height: 6px;
}

.image-previews::-webkit-scrollbar-thumb {
  background: rgba(0, 0, 0, 0.2);
  border-radius: 3px;
}

.image-previews::-webkit-scrollbar-thumb:hover {
  background: rgba(0, 0, 0, 0.3);
}

.image-preview-item {
  position: relative;
  width: 80px;
  height: 80px;
  border-radius: 6px;
  overflow: hidden;
  border: 1px solid var(--el-border-color-lighter, #ebeef5);
  flex: 0 0 auto;
  cursor: pointer;
  /* 只过渡不参与布局的属性：scale 会撑大滚动区域导致抖动 */
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
}

.image-preview-item:hover {
  border-color: var(--color-accent, #3b82f6);
  box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.25);
}

.image-preview-item img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.image-remove {
  position: absolute;
  top: 2px;
  right: 2px;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: rgba(0, 0, 0, 0.6);
  color: white;
  border: none;
  font-size: 16px;
  line-height: 1;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.15s ease;
  z-index: 1;
}

.image-remove:hover {
  background: rgba(0, 0, 0, 0.8);
}

/* 图片放大预览弹窗 */
.image-preview-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.85);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
  cursor: pointer;
}

.image-preview-container {
  position: relative;
  max-width: 90vw;
  max-height: 90vh;
  cursor: default;
}

.image-preview-container img {
  max-width: 90vw;
  max-height: 90vh;
  object-fit: contain;
  border-radius: 8px;
}

.preview-close {
  position: absolute;
  top: -40px;
  right: 0;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.9);
  color: #333;
  border: none;
  font-size: 24px;
  line-height: 1;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.15s ease;
}

.preview-close:hover {
  background: #fff;
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
  padding: 6px 8px 8px 10px;
}

.toolbar-left {
  display: flex;
  align-items: center;
  gap: 4px;
  min-width: 0;
  flex: 1;
}

.space-picker {
  position: relative;
  flex-shrink: 1;
  min-width: 0;
}

.space-trigger {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  max-width: 180px;
  padding: 4px 8px;
  border: none;
  background: transparent;
  border-radius: var(--radius-sm);
  cursor: pointer;
  color: var(--color-text-secondary);
  font-size: var(--font-sm);
}

.space-trigger:hover {
  background: var(--color-bg-hover);
  color: var(--color-text-primary);
}

.space-trigger-label {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.caret {
  flex-shrink: 0;
  opacity: 0.6;
}

.space-menu {
  position: absolute;
  bottom: calc(100% + 6px);
  left: 0;
  width: 260px;
  background: var(--color-bg);
  border: 1px solid var(--color-border);
  border-radius: 14px;
  box-shadow: var(--shadow-lg);
  padding: 8px;
  z-index: 30;
}

.space-search {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  margin-bottom: 4px;
  background: var(--color-bg-soft);
  border-radius: 10px;
  color: var(--color-text-muted);
}

.space-search input {
  flex: 1;
  border: none;
  outline: none;
  background: transparent;
  font-size: var(--font-sm);
  color: var(--color-text-primary);
}

.space-search input::placeholder {
  color: var(--color-text-muted);
}

.space-menu-list {
  max-height: 220px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.space-option {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 8px 10px;
  border: none;
  background: transparent;
  border-radius: 8px;
  cursor: pointer;
  text-align: left;
}

.space-option:hover,
.space-option.active {
  background: var(--color-bg-hover);
}

.opt-folder {
  flex-shrink: 0;
  color: var(--color-text-tertiary);
}

.space-option-name {
  font-size: var(--font-sm);
  color: var(--color-text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.space-option.action {
  color: var(--color-text-secondary);
}

.space-option.action svg {
  color: var(--color-text-tertiary);
}

.space-empty {
  padding: 12px;
  text-align: center;
  font-size: var(--font-xs);
  color: var(--color-text-muted);
}

.space-menu-divider {
  height: 1px;
  background: var(--color-border);
  margin: 6px 0;
}

.model-select {
  width: 120px;
  margin-right: 2px;
  flex-shrink: 0;
}

.dispatch-mode-select {
  width: 108px;
  margin-right: 2px;
  flex-shrink: 0;
}

.dispatch-target-select {
  width: 168px;
  margin-right: 2px;
  flex-shrink: 0;
}

.dispatch-btn {
  height: 32px;
  padding: 0 12px;
  margin-right: 6px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-bg-soft);
  color: var(--color-text-primary);
  font-size: var(--font-sm);
  cursor: pointer;
  flex-shrink: 0;
}

.dispatch-btn:hover:not(:disabled) {
  background: var(--color-bg-hover);
  border-color: var(--color-text-tertiary);
}

.dispatch-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
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
  flex-shrink: 0;
}

.tool-btn:hover {
  background: var(--color-bg-hover);
  color: var(--color-text-primary);
}

.send-btn,
.stop-btn {
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  border-radius: var(--radius-md);
  cursor: pointer;
  flex-shrink: 0;
}

.send-btn {
  background: var(--color-text-primary);
  color: #ffffff;
}

.send-btn:hover:not(:disabled) {
  background: #000;
}

.send-btn:disabled {
  background: var(--color-bg-hover);
  color: var(--color-text-muted);
  cursor: not-allowed;
}

.stop-btn {
  background: #dc2626;
  color: #ffffff;
}

.stop-btn:hover {
  background: #b91c1c;
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
